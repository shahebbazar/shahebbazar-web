const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Analytics beacons.

// Repeat events from the same visitor within this window are ignored, so refreshes do not inflate counts.
const DEDUPE_WINDOW = "30 minutes";

const MAX_QUERY_LENGTH = 200;
const MAX_SLUG_LENGTH = 200;
// Two sponsored rows plus a first page of twenty.
const MAX_IMPRESSIONS = 25;

const VIEW_SOURCES = new Set(["search", "category", "direct", "share", "sponsored"]);

// Crawlers, link-preview fetchers and scripted clients. "^node" is Node's built-in fetch, which sends "node".
const NON_HUMAN_AGENT =
    /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|curl|wget|python|node-fetch|undici|axios|postman|^node\b/i;

// Accepts text/plain, a CORS-safelisted type, so the browser's keepalive beacon needs no preflight.
const textBody = express.text({ type: "text/plain", limit: "4kb" });

const HASH_KEY = process.env.ANALYTICS_SALT || crypto.randomBytes(32).toString("hex");

if (!process.env.ANALYTICS_SALT) {
    console.warn(
        "ANALYTICS_SALT is not set. Visitor hashes will change on every restart, " +
            "so a visitor active before and after a restart is counted twice that day."
    );
}

const dhakaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" });

/** Daily-rotating visitor hash. */
function sessionHash(req) {
    const day = dhakaDate.format(new Date());
    return crypto
        .createHmac("sha256", HASH_KEY)
        .update(`${day}|${req.ip}|${req.get("user-agent") ?? ""}`)
        .digest("hex");
}

function isNonHuman(req) {
    const agent = req.get("user-agent");
    return !agent || NON_HUMAN_AGENT.test(agent);
}

/** Accepts a JSON body sent as text/plain or as application/json. */
function parseBody(body) {
    if (typeof body === "string") {
        try {
            return JSON.parse(body);
        } catch {
            return null;
        }
    }
    return body && typeof body === "object" ? body : null;
}

// Normalises a query for trend grouping: case-folded, punctuation removed, whitespace collapsed.
function normaliseQuery(raw) {
    return raw
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function optionalSlug(value) {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim().slice(0, MAX_SLUG_LENGTH)
        : null;
}

// POST /api/track/search: records one typed search and the businesses shown for it.
router.post("/track/search", textBody, async (req, res) => {
    const body = parseBody(req.body);

    const raw = typeof body?.q === "string" ? body.q.trim().slice(0, MAX_QUERY_LENGTH) : "";
    const normalised = normaliseQuery(raw);

    if (!normalised) {
        return res.status(400).json({ error: "q is required" });
    }

    const resultCount =
        Number.isInteger(body.resultCount) && body.resultCount >= 0
            ? Math.min(body.resultCount, 1000000)
            : 0;

    const vendorIds = Array.isArray(body.vendorIds)
        ? [...new Set(body.vendorIds.filter((id) => Number.isInteger(id) && id > 0))].slice(
              0,
              MAX_IMPRESSIONS
          )
        : [];

    if (isNonHuman(req)) return res.status(204).end();

    const hash = sessionHash(req);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Unknown slugs resolve to NULL rather than rejecting the search: the query text is still worth counting.
        const logged = await client.query(
            `WITH filter AS (
                 SELECT (SELECT category_id FROM categories WHERE category_slug = $3) AS category_id,
                        (SELECT location_id FROM locations  WHERE location_slug = $4) AS location_id
             )
             INSERT INTO search_logs (search_query_raw, search_query_normalised, category_id,
                                      location_id, search_result_count, search_session_hash)
             SELECT $1, $2, f.category_id, f.location_id, $5, $6
             FROM filter f
             WHERE NOT EXISTS (
                 SELECT 1 FROM search_logs s
                 WHERE s.search_session_hash = $6
                   AND s.search_query_normalised = $2
                   AND s.category_id IS NOT DISTINCT FROM f.category_id
                   AND s.location_id IS NOT DISTINCT FROM f.location_id
                   AND s.search_created_at > NOW() - $7::interval
             )
             RETURNING search_id`,
            [
                raw,
                normalised,
                optionalSlug(body.category),
                optionalSlug(body.area),
                resultCount,
                hash,
                DEDUPE_WINDOW,
            ]
        );

        // Appearances are counted only for a search that was logged, so a repeat is ignored for both.
        if (logged.rowCount === 1 && vendorIds.length > 0) {
            await client.query(
                `INSERT INTO vendor_search_impressions (vendor_id, impression_day, impression_count)
                 SELECT v.vendor_id, CURRENT_DATE, 1
                 FROM vendors v
                 WHERE v.vendor_id = ANY($1::int[]) AND v.vendor_status = 'approved'
                 ON CONFLICT (vendor_id, impression_day)
                 DO UPDATE SET impression_count = vendor_search_impressions.impression_count + 1`,
                [vendorIds]
            );
        }

        await client.query("COMMIT");
        res.status(204).end();
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("POST /api/track/search failed:", err);
        res.status(500).json({ error: "Could not record search" });
    } finally {
        client.release();
    }
});

// POST /api/track/view: records one view of an approved business profile.
router.post("/track/view", textBody, async (req, res) => {
    const body = parseBody(req.body);
    const slug = optionalSlug(body?.slug);

    if (!slug) {
        return res.status(400).json({ error: "slug is required" });
    }

    const source = VIEW_SOURCES.has(body.source) ? body.source : "direct";

    if (isNonHuman(req)) return res.status(204).end();

    try {
        await pool.query(
            `INSERT INTO vendor_profile_views (vendor_id, view_source, view_session_hash)
             SELECT v.vendor_id, $2, $3
             FROM vendors v
             WHERE v.vendor_slug = $1 AND v.vendor_status = 'approved'
               AND NOT EXISTS (
                   SELECT 1 FROM vendor_profile_views pv
                   WHERE pv.vendor_id = v.vendor_id
                     AND pv.view_session_hash = $3
                     AND pv.view_created_at > NOW() - $4::interval
               )`,
            [slug, source, sessionHash(req), DEDUPE_WINDOW]
        );
        res.status(204).end();
    } catch (err) {
        console.error("POST /api/track/view failed:", err);
        res.status(500).json({ error: "Could not record view" });
    }
});

module.exports = router;
module.exports.normaliseQuery = normaliseQuery;
