// Marketing workspace (KAN-285, Stage 3): the business owner's campaigns.
//
// Owners and managers read with business.marketing (an admin can look too) and change campaigns with
// business.marketing.manage. Everything is hidden only if MARKETING_WORKSPACE_ENABLED=false. Every
// approved business can write campaigns, with or without a pass (the free plan); only a suspended pass
// blocks it. Drafting spends no allowance; sending (Stage 4) uses the pass or the free allowance.

const express = require("express");
const pool = require("../db");
const { parseId } = require("../lib/currentUser");
const { requireVendorOwnership } = require("../lib/middleware/auth");
const { requireFeature } = require("../lib/access");
const { passSummary, EXPIRED_EMAILS_PER_WEEK } = require("../services/marketing/entitlements");
const { couponOf, workspaceEnabled, FREE_EMAILS_PER_MONTH, planOf, draftingCheck, validateBrief, validateContent, buildSnapshot, readiness, MAX_LISTINGS } = require("../services/marketing/campaigns");
const { generateDrafts, warnings, placeholdersIn } = require("../services/marketing/templates");

const router = express.Router();
const read = [requireFeature("business.marketing"), requireVendorOwnership];
const manage = [requireFeature("business.marketing.manage"), requireVendorOwnership];

// The workspace is on unless it is switched off.
router.use("/vendors/:vendorId/marketing", (req, res, next) =>
    workspaceEnabled() ? next() : res.status(404).json({ error: "Not found" }));

const GOAL_NAMES = { new_stock: "New stock", offer: "Offer", event: "Event", reminder: "Reminder" };

async function campaignRow(db, vendorId, campaignId, { lock = false } = {}) {
    const result = await db.query(
        `SELECT * FROM marketing_campaigns WHERE campaign_id = $1 AND vendor_id = $2 ${lock ? "FOR UPDATE" : ""}`,
        [campaignId, vendorId]
    );
    return result.rows[0] ?? null;
}

async function versionsOf(db, campaignId) {
    return (await db.query(
        `SELECT v.version_id, v.version_number, v.version_content, v.version_method, v.version_created_at, u.user_name AS created_by
         FROM marketing_campaign_versions v LEFT JOIN users u ON u.user_id = v.version_created_by
         WHERE v.campaign_id = $1 ORDER BY v.version_number DESC`,
        [campaignId]
    )).rows;
}

/** The full campaign for the editor: brief, snapshot, every version, and what still needs attention. */
async function campaignDetail(db, row) {
    const versions = await versionsOf(db, row.campaign_id);
    const latest = versions[0];
    const brief = {
        goal: row.campaign_goal, language: row.campaign_language, call_to_action: row.campaign_call_to_action,
        offer: row.campaign_offer, starts_on: row.campaign_starts_on, ends_on: row.campaign_ends_on,
        coupon_code: row.campaign_coupon_code,
    };
    return {
        campaign_id: row.campaign_id,
        title: row.campaign_title,
        status: row.campaign_status,
        brief: { ...brief, listing_ids: row.campaign_listing_ids },
        snapshot: row.campaign_source_snapshot,
        coupon: couponOf(row),
        approved_version_id: row.campaign_approved_version_id,
        approved_at: row.campaign_approved_at,
        created_at: row.campaign_created_at,
        updated_at: row.campaign_updated_at,
        versions,
        latest_version_id: latest.version_id,
        warnings: warnings(row.campaign_source_snapshot),
        placeholders: placeholdersIn(latest.version_content),
    };
}

// Dates come back from PostgreSQL as Date objects at local midnight; the brief keeps YYYY-MM-DD.
// Read the local parts: toISOString() would give the day before on a server ahead of UTC.
const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => (d instanceof Date ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : d);
const tidy = (row) => ({ ...row, campaign_starts_on: isoDay(row.campaign_starts_on), campaign_ends_on: isoDay(row.campaign_ends_on) });

// ---------- workspace ----------

// The pass, what the business still needs, the products it can promote, and its campaigns.
router.get("/vendors/:vendorId/marketing/workspace", ...read, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    try {
        const [pass, ready, listings, campaigns] = await Promise.all([
            passSummary(pool, vendorId),
            readiness(pool, vendorId),
            pool.query(
                `SELECT l.listing_id, l.listing_title, l.listing_title_bn, l.listing_price, l.listing_price_max, l.listing_price_unit,
                        (SELECT p.photo_url FROM listing_photos p WHERE p.listing_id = l.listing_id
                         ORDER BY p.photo_is_primary DESC, p.photo_sort_order, p.photo_id LIMIT 1) AS photo_url
                 FROM vendor_listings l WHERE l.vendor_id = $1 AND l.listing_status = 'approved'
                 ORDER BY l.listing_title`,
                [vendorId]
            ),
            pool.query(
                `SELECT c.campaign_id, c.campaign_title, c.campaign_goal, c.campaign_language, c.campaign_status, c.campaign_updated_at,
                        c.campaign_coupon_code, c.campaign_starts_on, c.campaign_ends_on,
                        (SELECT max(v.version_number) FROM marketing_campaign_versions v WHERE v.campaign_id = c.campaign_id) AS versions
                 FROM marketing_campaigns c WHERE c.vendor_id = $1 ORDER BY c.campaign_updated_at DESC`,
                [vendorId]
            ),
        ]);
        const drafting = draftingCheck(pass);
        res.json({
            pass,
            plan: planOf(pass),
            free_emails_per_month: FREE_EMAILS_PER_MONTH,
            ended_emails_per_week: EXPIRED_EMAILS_PER_WEEK,
            readiness: ready,
            can_create: ready.can_start && drafting.allowed,
            cannot_create_reason: !drafting.allowed ? drafting.reason
                : !ready.can_start ? "Your business needs to be approved and have at least one approved product or service." : null,
            max_listings: MAX_LISTINGS,
            listings: listings.rows,
            campaigns: campaigns.rows.map((r) => {
                const row = tidy(r);
                return { ...row, coupon: couponOf(row) };
            }),
        });
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/marketing/workspace failed:`, err);
        res.status(500).json({ error: "Could not load the Marketing workspace" });
    }
});

// ---------- campaigns ----------

// Creates a campaign from a brief and writes its first drafts from the templates.
router.post("/vendors/:vendorId/marketing/campaigns", ...manage, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const { brief, errors } = validateBrief(req.body);
    if (errors) return res.status(400).json({ error: Object.values(errors)[0], errors });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const ready = await readiness(client, vendorId);
        const drafting = draftingCheck(await passSummary(client, vendorId));
        if (!drafting.allowed || !ready.can_start) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                error: drafting.allowed ? "Your business needs to be approved and have an approved product or service first." : drafting.reason,
            });
        }
        const snapshot = await buildSnapshot(client, vendorId, brief.listing_ids);
        if (!snapshot) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "Choose only your own approved products or services.", errors: { listing_ids: "Choose only your own approved products or services." } });
        }
        const title = brief.title || `${GOAL_NAMES[brief.goal]}: ${snapshot.listings[0].title}`.slice(0, 120);
        const campaign = (await client.query(
            `INSERT INTO marketing_campaigns (vendor_id, campaign_title, campaign_goal, campaign_language, campaign_offer,
                 campaign_starts_on, campaign_ends_on, campaign_call_to_action, campaign_listing_ids, campaign_source_snapshot, campaign_created_by,
                 campaign_coupon_code)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [vendorId, title, brief.goal, brief.language, brief.offer, brief.starts_on, brief.ends_on, brief.call_to_action,
                brief.listing_ids, JSON.stringify(snapshot), req.user.user_id, brief.coupon_code]
        )).rows[0];
        await client.query(
            `INSERT INTO marketing_campaign_versions (campaign_id, version_number, version_content, version_method, version_created_by)
             VALUES ($1, 1, $2, 'template', $3)`,
            [campaign.campaign_id, JSON.stringify(generateDrafts(snapshot, brief)), req.user.user_id]
        );
        await client.query("COMMIT");
        res.status(201).json(await campaignDetail(pool, tidy(campaign)));
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`POST /api/vendors/${vendorId}/marketing/campaigns failed:`, err);
        res.status(500).json({ error: "Could not create the campaign. Nothing was saved." });
    } finally {
        client.release();
    }
});

router.get("/vendors/:vendorId/marketing/campaigns/:campaignId", ...read, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const campaignId = parseId(req.params.campaignId);
    if (!campaignId) return res.status(400).json({ error: "Invalid campaign id" });
    try {
        const row = await campaignRow(pool, vendorId, campaignId);
        if (!row) return res.status(404).json({ error: "Campaign not found" });
        res.json(await campaignDetail(pool, tidy(row)));
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/marketing/campaigns/${campaignId} failed:`, err);
        res.status(500).json({ error: "Could not load the campaign" });
    }
});

// Saves edited wording as a new version. Versions are never changed, so an approved one stays as it
// was; editing an approved campaign puts it back to draft until the new version is approved.
router.put("/vendors/:vendorId/marketing/campaigns/:campaignId/content", ...manage, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const campaignId = parseId(req.params.campaignId);
    if (!campaignId) return res.status(400).json({ error: "Invalid campaign id" });
    const { content, errors } = validateContent(req.body);
    if (errors) return res.status(400).json({ error: Object.values(errors)[0], errors });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const row = await campaignRow(client, vendorId, campaignId, { lock: true });
        if (!row) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Campaign not found" });
        }
        if (!["draft", "approved"].includes(row.campaign_status)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "This campaign has been sent and can no longer be edited." });
        }
        const next = (await client.query(
            "SELECT coalesce(max(version_number), 0) + 1 AS n FROM marketing_campaign_versions WHERE campaign_id = $1", [campaignId]
        )).rows[0].n;
        await client.query(
            `INSERT INTO marketing_campaign_versions (campaign_id, version_number, version_content, version_method, version_created_by)
             VALUES ($1, $2, $3, 'manual', $4)`,
            [campaignId, next, JSON.stringify(content), req.user.user_id]
        );
        const updated = (await client.query(
            "UPDATE marketing_campaigns SET campaign_status = 'draft', campaign_updated_at = now() WHERE campaign_id = $1 RETURNING *", [campaignId]
        )).rows[0];
        await client.query("COMMIT");
        res.json(await campaignDetail(pool, tidy(updated)));
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`PUT /api/vendors/${vendorId}/marketing/campaigns/${campaignId}/content failed:`, err);
        res.status(500).json({ error: "Could not save the changes. Nothing was saved." });
    } finally {
        client.release();
    }
});

// Approves the latest version: { version_id }. It is then locked and is what will be sent.
router.post("/vendors/:vendorId/marketing/campaigns/:campaignId/approve", ...manage, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const campaignId = parseId(req.params.campaignId);
    const versionId = parseId(String(req.body?.version_id ?? ""));
    if (!campaignId || !versionId) return res.status(400).json({ error: "Choose the version to approve" });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const row = await campaignRow(client, vendorId, campaignId, { lock: true });
        if (!row) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Campaign not found" });
        }
        const [latest] = await versionsOf(client, campaignId);
        const fail = async (status, error, extra = {}) => {
            await client.query("ROLLBACK");
            return res.status(status).json({ error, ...extra });
        };
        if (row.campaign_status !== "draft") return fail(409, "This campaign is already approved. Edit it to make a new version.");
        if (latest.version_id !== versionId) return fail(409, "A newer version has been saved. Review it, then approve that one.");
        const left = placeholdersIn(latest.version_content);
        if (left.length) return fail(400, "Fill in the parts marked [[like this]] before approving.", { placeholders: left });

        const updated = (await client.query(
            `UPDATE marketing_campaigns SET campaign_status = 'approved', campaign_approved_version_id = $2,
                 campaign_approved_at = now(), campaign_approved_by = $3, campaign_updated_at = now()
             WHERE campaign_id = $1 RETURNING *`,
            [campaignId, versionId, req.user.user_id]
        )).rows[0];
        await client.query(
            `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
             VALUES ($1, 'campaign.approve', 'campaign', $2, $3, $4)`,
            [req.user.user_id, campaignId, JSON.stringify({ status: row.campaign_status }),
                JSON.stringify({ status: "approved", version: latest.version_number })]
        );
        await client.query("COMMIT");
        res.json(await campaignDetail(pool, tidy(updated)));
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`POST /api/vendors/${vendorId}/marketing/campaigns/${campaignId}/approve failed:`, err);
        res.status(500).json({ error: "Could not approve the campaign. Nothing was changed." });
    } finally {
        client.release();
    }
});

// Deletes a campaign that has not been sent.
router.delete("/vendors/:vendorId/marketing/campaigns/:campaignId", ...manage, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const campaignId = parseId(req.params.campaignId);
    if (!campaignId) return res.status(400).json({ error: "Invalid campaign id" });
    try {
        const result = await pool.query(
            "DELETE FROM marketing_campaigns WHERE campaign_id = $1 AND vendor_id = $2 AND campaign_status IN ('draft', 'approved')",
            [campaignId, vendorId]
        );
        if (result.rowCount === 0) {
            const exists = await campaignRow(pool, vendorId, campaignId);
            return exists
                ? res.status(409).json({ error: "A sent campaign is kept as a record and can't be deleted." })
                : res.status(404).json({ error: "Campaign not found" });
        }
        res.status(204).end();
    } catch (err) {
        console.error(`DELETE /api/vendors/${vendorId}/marketing/campaigns/${campaignId} failed:`, err);
        res.status(500).json({ error: "Could not delete the campaign" });
    }
});

module.exports = router;
