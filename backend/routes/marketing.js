// Marketing passes (KAN-283, Stage 1): admin activation and management, and the owner's pass status.
//
// Every /api/admin route needs a signed-in admin (index.js), and each change is written to
// audit_logs against that admin. Sponsored placement follows the passes (syncSponsoredPlacement).

const express = require("express");
const pool = require("../db");
const { parseId, cleanText } = require("../lib/currentUser");
const { requireVendorOwnership } = require("../lib/middleware/auth");
const { requireFeature } = require("../lib/access");
const { PASS_SQL, passSummary, syncSponsoredPlacement } = require("../services/marketing/entitlements");

const router = express.Router();
const REASON_MAX = 500;
const EXTEND_MAX_DAYS = 365;

// The vendor-facing marketing pages and routes are on unless MARKETING_WORKSPACE_ENABLED=false.
const { workspaceEnabled } = require("../services/marketing/campaigns");

function audit(db, actor, action, id, before, after) {
    return db.query(
        `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
         VALUES ($1, $2, 'marketing_pass', $3, $4, $5)`,
        [actor, action, id, before ? JSON.stringify(before) : null, JSON.stringify(after)]
    );
}

const snapshot = (row) => ({ status: row.subscription_status, ends_at: row.subscription_ends_at, package: row.package_name });

// Runs fn(client) in a transaction; fn returns [statusCode, body].
async function inTransaction(res, label, fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const [status, body] = await fn(client);
        await client.query(status < 400 ? "COMMIT" : "ROLLBACK");
        res.status(status).json(body);
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        // The one-running-pass-per-business index is the last line of defence against a race.
        if (err.code === "23505") {
            return res.status(409).json({ error: "This business already has a pass running. Reload and extend it instead." });
        }
        console.error(`${label} failed:`, err);
        res.status(500).json({ error: "Could not save the change. Nothing was changed." });
    } finally {
        client.release();
    }
}

// ---------- admin ----------

// Packages, every pass (newest first) and the approved businesses that can be given one.
router.get("/admin/marketing", requireFeature("admin.marketing"), async (req, res) => {
    try {
        const [packages, passes, businesses] = await Promise.all([
            pool.query(
                `SELECT package_id, package_name, package_duration_days, package_price_bdt,
                        package_email_campaign_limit, package_ai_action_limit, package_sms_limit, package_is_active
                 FROM marketing_packages ORDER BY package_sort_order, package_id`
            ),
            pool.query(
                `SELECT x.*, v.vendor_name, v.vendor_slug, u.user_name AS activated_by_name
                 FROM (${PASS_SQL}) x
                 JOIN vendors v ON v.vendor_id = x.vendor_id
                 LEFT JOIN users u ON u.user_id = x.subscription_activated_by
                 ORDER BY (x.effective_status IN ('active', 'pending', 'suspended')) DESC, x.subscription_ends_at DESC NULLS LAST, x.subscription_id DESC`
            ),
            pool.query(
                `SELECT v.vendor_id, v.vendor_name,
                        EXISTS (SELECT 1 FROM vendor_marketing_subscriptions s
                                WHERE s.vendor_id = v.vendor_id AND s.subscription_status = 'active'
                                  AND s.subscription_ends_at > now()) AS has_active_pass
                 FROM vendors v WHERE v.vendor_status = 'approved'
                 ORDER BY v.vendor_name`
            ),
        ]);
        res.json({ packages: packages.rows, passes: passes.rows, businesses: businesses.rows });
    } catch (err) {
        console.error("GET /api/admin/marketing failed:", err);
        res.status(500).json({ error: "Could not load marketing passes" });
    }
});

// Activates a pass for an approved business, starting now.
router.post("/admin/marketing/subscriptions", requireFeature("admin.marketing"), (req, res) => {
    const vendorId = parseId(req.body?.vendor_id);
    const packageId = parseId(req.body?.package_id);
    if (!vendorId || !packageId) return res.status(400).json({ error: "Choose a business and a pass." });

    return inTransaction(res, "POST /api/admin/marketing/subscriptions", async (db) => {
        const vendor = (await db.query(
            "SELECT vendor_name, vendor_status FROM vendors WHERE vendor_id = $1 FOR UPDATE", [vendorId]
        )).rows[0];
        if (!vendor) return [404, { error: "Business not found" }];
        if (vendor.vendor_status !== "approved") {
            return [400, { error: "Only approved businesses can have a Marketing pass." }];
        }
        const pkg = (await db.query(
            "SELECT * FROM marketing_packages WHERE package_id = $1 AND package_is_active", [packageId]
        )).rows[0];
        if (!pkg) return [404, { error: "Pass not found" }];

        const live = (await db.query(
            `${PASS_SQL} WHERE s.vendor_id = $1 AND s.subscription_status IN ('pending', 'active') FOR UPDATE OF s`, [vendorId]
        )).rows[0];
        if (live && live.effective_status !== "expired") {
            const until = live.subscription_ends_at ? ` until ${new Date(live.subscription_ends_at).toDateString()}` : "";
            return [409, { error: `${vendor.vendor_name} already has a ${live.effective_status} pass${until}. Extend it instead.` }];
        }
        if (live) {
            await db.query(
                "UPDATE vendor_marketing_subscriptions SET subscription_status = 'expired', subscription_updated_at = now() WHERE subscription_id = $1",
                [live.subscription_id]
            );
        }

        const created = (await db.query(
            `INSERT INTO vendor_marketing_subscriptions (
                 vendor_id, package_id, subscription_status, subscription_starts_at, subscription_ends_at,
                 subscription_price_bdt, subscription_activation_source, subscription_activated_by)
             VALUES ($1, $2, 'active', now(), now() + make_interval(days => $3), $4, 'admin', $5)
             RETURNING subscription_id, subscription_ends_at`,
            [vendorId, packageId, pkg.package_duration_days, pkg.package_price_bdt, req.user.user_id]
        )).rows[0];
        await syncSponsoredPlacement(db, vendorId);
        await audit(db, req.user.user_id, "marketing.activate", created.subscription_id, null, {
            vendor_id: vendorId, package: pkg.package_name, status: "active", ends_at: created.subscription_ends_at,
        });
        return [201, await passSummary(db, vendorId)];
    });
});

// Changes one pass: extend, end-date, end-now, suspend, resume or cancel.
router.post("/admin/marketing/subscriptions/:id/:action", requireFeature("admin.marketing"), (req, res) => {
    const id = parseId(req.params.id);
    const action = req.params.action;
    if (!id) return res.status(400).json({ error: "Invalid id" });
    if (!["extend", "end-date", "end-now", "suspend", "resume", "cancel"].includes(action)) {
        return res.status(404).json({ error: "Unknown action" });
    }
    const reason = cleanText(req.body?.reason) || null;
    if (reason && reason.length > REASON_MAX) return res.status(400).json({ error: `Keep the reason under ${REASON_MAX} characters.` });

    return inTransaction(res, `POST /api/admin/marketing/subscriptions/${id}/${action}`, async (db) => {
        const pass = (await db.query(`${PASS_SQL} WHERE s.subscription_id = $1 FOR UPDATE OF s`, [id])).rows[0];
        if (!pass) return [404, { error: "Pass not found" }];
        const status = pass.effective_status;
        const update = (sql, params) => db.query(
            `UPDATE vendor_marketing_subscriptions SET ${sql}, subscription_updated_at = now() WHERE subscription_id = $1`,
            [id, ...params]
        );

        if (action === "extend") {
            const days = Number(req.body?.days);
            if (!Number.isInteger(days) || days < 1 || days > EXTEND_MAX_DAYS) {
                return [400, { error: `Extend by 1 to ${EXTEND_MAX_DAYS} days.` }];
            }
            if (status !== "active") return [409, { error: `Only a running pass can be extended; this one is ${status}. Activate a new pass instead.` }];
            await update("subscription_ends_at = subscription_ends_at + make_interval(days => $2)", [days]);
        } else if (action === "end-date") {
            const endsAt = new Date(req.body?.ends_at);
            if (Number.isNaN(endsAt.getTime())) return [400, { error: "Choose an end date." }];
            if (endsAt <= new Date(pass.subscription_starts_at)) return [400, { error: "The end date must be after the pass started." }];
            if (!["active", "expired"].includes(status) || pass.subscription_status !== "active") {
                return [409, { error: `The end date of a ${status} pass cannot be changed.` }];
            }
            await update(
                `subscription_ends_at = $2, subscription_status = CASE WHEN $2::timestamptz <= now() THEN 'expired' ELSE 'active' END`,
                [endsAt.toISOString()]
            );
        } else if (action === "end-now") {
            if (status !== "active") return [409, { error: `This pass is already ${status}.` }];
            await update(
                "subscription_ends_at = GREATEST(now(), subscription_starts_at + INTERVAL '1 second'), subscription_status = 'expired'", []
            );
        } else if (action === "suspend") {
            if (status !== "active") return [409, { error: `Only a running pass can be suspended; this one is ${status}.` }];
            await update("subscription_status = 'suspended', subscription_status_reason = $2", [reason]);
        } else if (action === "resume") {
            if (status !== "suspended") return [409, { error: `Only a suspended pass can be resumed; this one is ${status}.` }];
            if (new Date(pass.subscription_ends_at) <= new Date()) return [409, { error: "This pass ended while it was suspended. Activate a new pass instead." }];
            const other = await db.query(
                `SELECT 1 FROM vendor_marketing_subscriptions
                 WHERE vendor_id = $1 AND subscription_id <> $2 AND subscription_status IN ('pending', 'active')`,
                [pass.vendor_id, id]
            );
            if (other.rowCount) return [409, { error: "This business already has another pass running." }];
            await update("subscription_status = 'active', subscription_status_reason = NULL", []);
        } else if (action === "cancel") {
            if (["cancelled", "expired"].includes(status)) return [409, { error: `This pass is already ${status}.` }];
            await update("subscription_status = 'cancelled', subscription_status_reason = $2", [reason]);
        }

        const after = (await db.query(`${PASS_SQL} WHERE s.subscription_id = $1`, [id])).rows[0];
        await syncSponsoredPlacement(db, pass.vendor_id);
        await audit(db, req.user.user_id, `marketing.${action.replace("-", "_")}`, id, snapshot(pass),
            { ...snapshot(after), ...(reason ? { reason } : {}) });
        return [200, { ...after, status: after.effective_status }];
    });
});

// ---------- business owner ----------

// The business's pass, days and allowance left. Hidden only if MARKETING_WORKSPACE_ENABLED=false.
router.get("/vendors/:vendorId/marketing", requireFeature("business.marketing"), requireVendorOwnership, async (req, res) => {
    if (!workspaceEnabled()) return res.status(404).json({ error: "Not found" });
    const vendorId = parseId(req.params.vendorId);
    try {
        res.json({ pass: await passSummary(pool, vendorId) });
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/marketing failed:`, err);
        res.status(500).json({ error: "Could not load the Marketing pass" });
    }
});

module.exports = router;
