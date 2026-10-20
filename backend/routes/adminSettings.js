// Admin settings (KAN-293): switch approval of new businesses and new listings on or off.
//
// Every /api/admin route needs a signed-in admin (index.js). Each change is written to audit_logs
// against that admin. Switching approval off does not approve anything already waiting; those
// stay in the Approvals queue.

const express = require("express");
const pool = require("../db");
const { requireFeature } = require("../lib/access");
const { SETTINGS, listSettings, invalidValue, setSetting, getSetting } = require("../lib/settings");

const router = express.Router();

async function waiting(db) {
    const result = await db.query(
        `SELECT (SELECT COUNT(*)::int FROM vendors WHERE vendor_status = 'pending') AS businesses,
                (SELECT COUNT(*)::int FROM vendor_listings WHERE listing_status = 'pending') AS listings`
    );
    return result.rows[0];
}

router.get("/admin/settings", requireFeature("admin.settings"), async (req, res) => {
    try {
        res.json({ settings: await listSettings(pool), waiting: await waiting(pool) });
    } catch (err) {
        console.error("GET /api/admin/settings failed:", err);
        res.status(500).json({ error: "Could not load the settings" });
    }
});

// { value }
router.put("/admin/settings/:key", requireFeature("admin.settings"), async (req, res) => {
    const key = req.params.key;
    if (!Object.hasOwn(SETTINGS, key)) return res.status(404).json({ error: "Unknown setting" });
    const problem = invalidValue(key, req.body?.value);
    if (problem) return res.status(400).json({ error: problem });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { before, after } = await setSetting(client, key, req.body.value, req.user.user_id);
        await client.query(
            `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
             VALUES ($1, 'setting.update', 'setting', NULL, $2, $3)`,
            [req.user.user_id, JSON.stringify({ key, value: before }), JSON.stringify({ key, value: after })]
        );
        await client.query("COMMIT");
        const setting = (await listSettings(pool)).find((s) => s.key === key);
        res.json({ setting, waiting: await waiting(pool) });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`PUT /api/admin/settings/${key} failed:`, err);
        res.status(500).json({ error: "Could not save the setting. Nothing was changed." });
    } finally {
        client.release();
    }
});

// Public: lets the registration page say whether a new business needs approval.
router.get("/settings/public", async (req, res) => {
    try {
        res.json({
            require_business_approval: await getSetting(pool, "require_business_approval"),
            require_listing_approval: await getSetting(pool, "require_listing_approval"),
        });
    } catch (err) {
        console.error("GET /api/settings/public failed:", err);
        res.status(500).json({ error: "Could not load the settings" });
    }
});

module.exports = router;
