const express = require("express");
const pool = require("../db");
const { requireFeature } = require("../lib/access");

const router = express.Router();

// Admin approval of new businesses, listings and events (client requirement 2E, KAN-298).

const REASON_MIN = 10;
const REASON_MAX = 500;
const RECENT_LIMIT = 20;

function parseId(raw) {
    return /^\d{1,10}$/.test(raw) && Number(raw) > 0 && Number(raw) <= 2147483647 ? Number(raw) : null;
}

// Every /admin route needs a signed-in admin (see index.js); decisions are recorded against that admin.

/** Validates { decision, reason }. Returns { error } or { decision, reason }. */
function parseDecision(body) {
    const decision = body?.decision;
    if (decision !== "approve" && decision !== "reject") {
        return { error: 'decision must be "approve" or "reject"' };
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (decision === "reject") {
        if (reason.length < REASON_MIN) {
            return { error: `Give the owner a reason of at least ${REASON_MIN} characters, so they know what to fix.` };
        }
        if (reason.length > REASON_MAX) return { error: `Keep the reason under ${REASON_MAX} characters.` };
    }
    return { decision, reason: decision === "reject" ? reason : null };
}

// Queue

router.get("/admin/queue", requireFeature("admin.approvals"), async (req, res) => {
    try {
        const [vendors, listings, events, recent] = await Promise.all([
            // Oldest first: whoever has waited longest is reviewed first.
            pool.query(
                `SELECT v.vendor_id, v.vendor_slug, v.vendor_name, v.vendor_name_bn,
                        v.vendor_description, v.vendor_phone, v.vendor_whatsapp, v.vendor_email,
                        v.vendor_website, v.vendor_address, v.vendor_cover_url, v.vendor_logo_url,
                        v.vendor_created_at, v.vendor_updated_at,
                        loc.location_name AS area_name,
                        u.user_name AS owner_name, u.user_phone AS owner_phone,
                        u.user_phone_verified_at IS NOT NULL AS owner_phone_verified,
                        (SELECT string_agg(c.category_name, ', ' ORDER BY c.category_sort_order, c.category_id)
                         FROM vendor_categories vc JOIN categories c ON c.category_id = vc.category_id
                         WHERE vc.vendor_id = v.vendor_id) AS categories,
                        (SELECT COUNT(*)::int FROM vendor_listings l
                         WHERE l.vendor_id = v.vendor_id AND l.listing_status <> 'archived') AS listing_count,
                        (SELECT COUNT(*)::int FROM vendor_photos p WHERE p.vendor_id = v.vendor_id) AS photo_count,
                        (SELECT COUNT(*)::int FROM vendor_opening_hours h WHERE h.vendor_id = v.vendor_id) AS hours_days,
                        -- The owner's other businesses, which helps spot duplicates.
                        (SELECT COUNT(*)::int FROM vendors o
                         WHERE o.user_id = v.user_id AND o.vendor_id <> v.vendor_id) AS owner_other_businesses,
                        EXISTS (SELECT 1 FROM audit_logs a
                                WHERE a.audit_target_type = 'vendor' AND a.audit_target_id = v.vendor_id
                                  AND a.audit_action = 'vendor.reject') AS resubmitted
                 FROM vendors v
                 JOIN users u ON u.user_id = v.user_id
                 LEFT JOIN locations loc ON loc.location_id = v.location_id
                 WHERE v.vendor_status = 'pending'
                 ORDER BY v.vendor_updated_at, v.vendor_id`
            ),
            pool.query(
                `SELECT l.listing_id, l.listing_title, l.listing_title_bn, l.listing_description,
                        l.listing_price, l.listing_price_max, l.listing_price_unit,
                        l.listing_min_order_qty, l.listing_created_at,
                        c.category_name,
                        v.vendor_id, v.vendor_name, v.vendor_slug, v.vendor_status,
                        (SELECT p.photo_url FROM listing_photos p WHERE p.listing_id = l.listing_id
                         ORDER BY p.photo_is_primary DESC, p.photo_sort_order, p.photo_id LIMIT 1) AS photo_url
                 FROM vendor_listings l
                 JOIN vendors v ON v.vendor_id = l.vendor_id
                 LEFT JOIN categories c ON c.category_id = l.category_id
                 WHERE l.listing_status = 'pending'
                 ORDER BY l.listing_created_at, l.listing_id`
            ),
            pool.query(
                `SELECT e.event_id, e.event_title, e.event_title_bn, e.event_slug, e.event_description,
                        e.event_type, e.event_venue, e.event_is_online, e.event_online_url,
                        e.event_starts_at, e.event_ends_at, e.event_price_type, e.event_price_bdt,
                        e.event_ticket_url, e.event_image_url, e.event_created_at,
                        loc.location_name AS area_name,
                        v.vendor_id, v.vendor_name, v.vendor_slug, v.vendor_status,
                        (SELECT COUNT(*)::int FROM event_photos p WHERE p.event_id = e.event_id) AS photo_count,
                        EXISTS (SELECT 1 FROM audit_logs a
                                WHERE a.audit_target_type = 'event' AND a.audit_target_id = e.event_id
                                  AND a.audit_action = 'event.reject') AS resubmitted
                 FROM events e
                 LEFT JOIN vendors v ON v.vendor_id = e.vendor_id
                 LEFT JOIN locations loc ON loc.location_id = e.location_id
                 WHERE e.event_status = 'pending'
                 ORDER BY e.event_updated_at, e.event_id`
            ),
            pool.query(
                `SELECT a.audit_id, a.audit_action, a.audit_target_type, a.audit_target_id,
                        a.audit_after->>'reason' AS reason, a.audit_created_at,
                        u.user_name AS actor_name,
                        CASE a.audit_target_type
                            WHEN 'vendor' THEN (SELECT vendor_name FROM vendors WHERE vendor_id = a.audit_target_id)
                            WHEN 'listing' THEN (SELECT listing_title FROM vendor_listings WHERE listing_id = a.audit_target_id)
                            WHEN 'event' THEN (SELECT event_title FROM events WHERE event_id = a.audit_target_id)
                        END AS target_label
                 FROM audit_logs a
                 LEFT JOIN users u ON u.user_id = a.audit_actor_user_id
                 WHERE a.audit_action IN ('vendor.approve', 'vendor.reject', 'listing.approve', 'listing.reject',
                                          'event.approve', 'event.reject')
                 ORDER BY a.audit_created_at DESC, a.audit_id DESC
                 LIMIT $1`,
                [RECENT_LIMIT]
            ),
        ]);

        res.json({ vendors: vendors.rows, listings: listings.rows, events: events.rows, recent: recent.rows });
    } catch (err) {
        console.error("GET /api/admin/queue failed:", err);
        res.status(500).json({ error: "Could not load the approval queue" });
    }
});

// Decisions

const TABLES = {
    vendor: { name: "vendors", key: "vendor_id", status: "vendor_status", reason: "vendor_rejection_reason", label: "vendor_name", noun: "business" },
    listing: { name: "vendor_listings", key: "listing_id", status: "listing_status", reason: "listing_rejection_reason", label: "listing_title", noun: "listing" },
    event: { name: "events", key: "event_id", status: "event_status", reason: "event_rejection_reason", label: "event_title", noun: "event" },
};

// Applies one decision in a transaction: lock the row, check it is still pending, update it, audit it.
async function decide(res, { kind, id, actor, decision, reason }) {
    const table = TABLES[kind];
    const Noun = table.noun[0].toUpperCase() + table.noun.slice(1);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Identifiers come from the fixed table above, never from input.
        const current = await client.query(
            `SELECT ${table.status} AS status, ${table.reason} AS reason, ${table.label} AS label
             FROM ${table.name} WHERE ${table.key} = $1 FOR UPDATE`,
            [id]
        );
        if (current.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: `${Noun} not found` });
        }
        const before = current.rows[0];
        if (before.status !== "pending") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: `This ${table.noun} is no longer awaiting approval (it is ${before.status}). Reload to see the current queue.`,
                status: before.status,
            });
        }

        // An approved event is published; businesses and listings are "approved".
        const status = decision === "approve" ? (kind === "event" ? "published" : "approved") : "rejected";

        if (kind === "vendor") {
            await client.query(
                `UPDATE vendors SET
                     vendor_status = $2::text,
                     vendor_rejection_reason = $3::text,
                     vendor_verified_at = CASE WHEN $2::text = 'approved' THEN NOW() ELSE NULL END,
                     vendor_verified_by = CASE WHEN $2::text = 'approved' THEN $4::int ELSE NULL END,
                     vendor_updated_at = NOW()
                 WHERE vendor_id = $1`,
                [id, status, reason, actor]
            );
        } else if (kind === "listing") {
            await client.query(
                `UPDATE vendor_listings SET
                     listing_status = $2, listing_rejection_reason = $3, listing_updated_at = NOW()
                 WHERE listing_id = $1`,
                [id, status, reason]
            );
        } else {
            await client.query(
                `UPDATE events SET
                     event_status = $2, event_rejection_reason = $3, event_updated_at = NOW()
                 WHERE event_id = $1`,
                [id, status, reason]
            );
        }

        await client.query(
            `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type,
                                     audit_target_id, audit_before, audit_after)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                actor,
                `${kind}.${decision}`,
                kind,
                id,
                JSON.stringify({ status: before.status, reason: before.reason }),
                JSON.stringify({ status, reason }),
            ]
        );

        await client.query("COMMIT");
        res.json({ id, status, reason, label: before.label });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`POST /api/admin/${kind}s/${id}/decision failed:`, err);
        res.status(500).json({ error: "Could not save the decision. Nothing was changed." });
    } finally {
        client.release();
    }
}

for (const kind of Object.keys(TABLES)) {
    router.post(`/admin/${kind}s/:id/decision`, requireFeature("admin.approvals"), async (req, res) => {
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "Invalid id" });

        const parsed = parseDecision(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });

        await decide(res, { kind, id, actor: req.user.user_id, ...parsed });
    });
}

module.exports = router;
