// Marketing workspace (KAN-285, Stage 3): the business owner's campaigns.
//
// Owners and managers read with business.marketing (an admin can look too) and change campaigns with
// business.marketing.manage. Everything is hidden only if MARKETING_WORKSPACE_ENABLED=false. Every
// approved business can write campaigns, with or without a pass (the free plan); only a suspended pass
// blocks it. Drafting spends no allowance; sending (KAN-286, services/marketing/sending.js) uses the
// pass or the free allowance. The owner posts Facebook and WhatsApp themselves and marks them as
// posted (KAN-287, services/marketing/posts.js); results are in services/marketing/results.js.

const express = require("express");
const pool = require("../db");
const { parseId } = require("../lib/currentUser");
const { requireVendorOwnership } = require("../lib/middleware/auth");
const { requireFeature } = require("../lib/access");
const { passSummary, checkEntitlement, freePlanEmails, EXPIRED_EMAILS_PER_WEEK } = require("../services/marketing/entitlements");
const { audienceFor } = require("../services/marketing/consent");
const { sendCampaign, sendResults, statusProblem } = require("../services/marketing/sending");
const { couponOf, workspaceEnabled, planOf, draftingCheck, validateBrief, validateContent, buildSnapshot, readiness, MAX_LISTINGS } = require("../services/marketing/campaigns");
const { generateDrafts, warnings, placeholdersIn } = require("../services/marketing/templates");
const { POST_CHANNELS, validatePostUrl, postsOf } = require("../services/marketing/posts");
const { periodOf, marketingResults } = require("../services/marketing/results");

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

/**
 * Sending, for the editor: who it would go to and whether the allowance covers it (before), or
 * when it went and how many emails the provider accepted (after).
 */
async function sendInfo(db, row) {
    if (row.campaign_status === "sent") {
        return { sent_at: row.campaign_sent_at, results: await sendResults(db, row.campaign_id) };
    }
    const [audience, allowance] = await Promise.all([
        audienceFor(db, row.vendor_id, "email"),
        checkEntitlement(db, row.vendor_id, "email_campaign"),
    ]);
    const problem = statusProblem(row.campaign_status)
        ?? (audience.length === 0 ? "No customers have chosen to get your offers by email yet, so there's no one to send to." : null)
        ?? (allowance.allowed ? null : allowance.reason);
    return {
        audience: audience.length,
        plan: allowance.allowed ? allowance.status : null,
        left_after: allowance.allowed ? allowance.left : null,
        can_send: problem === null,
        reason: problem,
    };
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
        send: await sendInfo(db, row),
        posts: await postsOf(db, row.campaign_id),
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
        const [pass, ready, listings, campaigns, freeEmails, subscribers] = await Promise.all([
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
                        (SELECT max(v.version_number) FROM marketing_campaign_versions v WHERE v.campaign_id = c.campaign_id) AS versions,
                        COALESCE((SELECT array_agg(p.post_channel ORDER BY p.post_channel) FROM marketing_campaign_posts p
                                  WHERE p.campaign_id = c.campaign_id), '{}') AS posted_on
                 FROM marketing_campaigns c WHERE c.vendor_id = $1 ORDER BY c.campaign_updated_at DESC`,
                [vendorId]
            ),
            freePlanEmails(pool, vendorId),
            audienceFor(pool, vendorId, "email"),
        ]);
        const drafting = draftingCheck(pass);
        res.json({
            pass,
            plan: planOf(pass),
            free_emails_per_month: freeEmails.limit,
            free_emails: freeEmails,
            email_subscribers: subscribers.length,
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

// Sends the campaign's latest version by email to the customers who chose this business's offers.
// The owner's confirmation approves that version. Uses one email campaign from the pass or the free
// allowance; a second send is refused.
router.post("/vendors/:vendorId/marketing/campaigns/:campaignId/send", ...manage, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const campaignId = parseId(req.params.campaignId);
    if (!campaignId) return res.status(400).json({ error: "Invalid campaign id" });
    try {
        const result = await sendCampaign(pool, { vendorId, campaignId, userId: req.user.user_id });
        if (result.status !== 200) return res.status(result.status).json(result.body);
        const row = await campaignRow(pool, vendorId, campaignId);
        res.json({ ...result.body, campaign: await campaignDetail(pool, tidy(row)) });
    } catch (err) {
        console.error(`POST /api/vendors/${vendorId}/marketing/campaigns/${campaignId}/send failed:`, err);
        res.status(500).json({ error: "Could not send the campaign. Check the campaign before trying again." });
    }
});

// Marks the campaign as posted on Facebook or WhatsApp: { url } (optional link to the post). The
// owner posts it themselves; this records the latest version as the one posted, for the results.
// Marking again updates the link.
router.put("/vendors/:vendorId/marketing/campaigns/:campaignId/posts/:channel", ...manage, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const campaignId = parseId(req.params.campaignId);
    const { channel } = req.params;
    if (!campaignId) return res.status(400).json({ error: "Invalid campaign id" });
    if (!POST_CHANNELS.includes(channel)) return res.status(404).json({ error: "Unknown channel" });
    const { url, error } = validatePostUrl(channel, req.body?.url);
    if (error) return res.status(400).json({ error, errors: { url: error } });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const row = await campaignRow(client, vendorId, campaignId, { lock: true });
        const fail = async (status, message, extra = {}) => {
            await client.query("ROLLBACK");
            return res.status(status).json({ error: message, ...extra });
        };
        if (!row) return fail(404, "Campaign not found");
        if (!["draft", "approved", "sent"].includes(row.campaign_status)) return fail(409, "This campaign can't be marked as posted right now.");
        const [latest] = await versionsOf(client, campaignId);
        const left = placeholdersIn(latest.version_content);
        if (left.length) return fail(400, "Fill in the parts marked [[like this]] before posting.", { placeholders: left });

        const before = (await client.query(
            "SELECT post_url FROM marketing_campaign_posts WHERE campaign_id = $1 AND post_channel = $2", [campaignId, channel]
        )).rows[0];
        await client.query(
            `INSERT INTO marketing_campaign_posts (campaign_id, vendor_id, post_channel, post_url, post_version_id, post_marked_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (campaign_id, post_channel)
             DO UPDATE SET post_url = EXCLUDED.post_url, post_version_id = EXCLUDED.post_version_id,
                           post_marked_by = EXCLUDED.post_marked_by, post_marked_at = now()`,
            [campaignId, vendorId, channel, url, latest.version_id, req.user.user_id]
        );
        await client.query("UPDATE marketing_campaigns SET campaign_updated_at = now() WHERE campaign_id = $1", [campaignId]);
        await client.query(
            `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
             VALUES ($1, 'campaign.post', 'campaign', $2, $3, $4)`,
            [req.user.user_id, campaignId, before ? JSON.stringify({ channel, url: before.post_url }) : null,
                JSON.stringify({ channel, url, version: latest.version_number })]
        );
        await client.query("COMMIT");
        res.json(await campaignDetail(pool, tidy(await campaignRow(pool, vendorId, campaignId))));
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`PUT /api/vendors/${vendorId}/marketing/campaigns/${campaignId}/posts/${channel} failed:`, err);
        res.status(500).json({ error: "Could not save that it was posted. Nothing was changed." });
    } finally {
        client.release();
    }
});

// Undoes "Mark as posted", for when it was marked by mistake.
router.delete("/vendors/:vendorId/marketing/campaigns/:campaignId/posts/:channel", ...manage, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const campaignId = parseId(req.params.campaignId);
    const { channel } = req.params;
    if (!campaignId) return res.status(400).json({ error: "Invalid campaign id" });
    if (!POST_CHANNELS.includes(channel)) return res.status(404).json({ error: "Unknown channel" });
    try {
        const row = await campaignRow(pool, vendorId, campaignId);
        if (!row) return res.status(404).json({ error: "Campaign not found" });
        const removed = (await pool.query(
            "DELETE FROM marketing_campaign_posts WHERE campaign_id = $1 AND post_channel = $2 RETURNING post_url", [campaignId, channel]
        )).rows[0];
        if (removed) {
            await pool.query(
                `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
                 VALUES ($1, 'campaign.unpost', 'campaign', $2, $3, $4)`,
                [req.user.user_id, campaignId, JSON.stringify({ channel, url: removed.post_url }), JSON.stringify({ channel, posted: false })]
            );
        }
        res.json(await campaignDetail(pool, tidy(row)));
    } catch (err) {
        console.error(`DELETE /api/vendors/${vendorId}/marketing/campaigns/${campaignId}/posts/${channel} failed:`, err);
        res.status(500).json({ error: "Could not change that. Nothing was changed." });
    }
});

// ---------- results ----------

// What the business's marketing did in the last ?days= (7, 30 or 90; default 30) against the period
// before. Open to every plan: results stay after a pass ends.
router.get("/vendors/:vendorId/marketing/results", ...read, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    try {
        res.json(await marketingResults(pool, vendorId, periodOf(req.query.days)));
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/marketing/results failed:`, err);
        res.status(500).json({ error: "Could not load the marketing results" });
    }
});

// Deletes a campaign that has not been sent or posted.
router.delete("/vendors/:vendorId/marketing/campaigns/:campaignId", ...manage, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const campaignId = parseId(req.params.campaignId);
    if (!campaignId) return res.status(400).json({ error: "Invalid campaign id" });
    try {
        const result = await pool.query(
            `DELETE FROM marketing_campaigns c WHERE c.campaign_id = $1 AND c.vendor_id = $2 AND c.campaign_status IN ('draft', 'approved')
               AND NOT EXISTS (SELECT 1 FROM marketing_campaign_posts p WHERE p.campaign_id = c.campaign_id)`,
            [campaignId, vendorId]
        );
        if (result.rowCount === 0) {
            const exists = await campaignRow(pool, vendorId, campaignId);
            return exists
                ? res.status(409).json({ error: "A sent or posted campaign is kept as a record and can't be deleted." })
                : res.status(404).json({ error: "Campaign not found" });
        }
        res.status(204).end();
    } catch (err) {
        console.error(`DELETE /api/vendors/${vendorId}/marketing/campaigns/${campaignId} failed:`, err);
        res.status(500).json({ error: "Could not delete the campaign" });
    }
});

module.exports = router;
