// Offers from businesses (KAN-284): the customer's consent choices, and the public unsubscribe link.
//
// Consent is given only by an explicit choice (the prompt after saving a business, or the account
// page) and never by saving alone. Unsubscribing takes effect at once; the next send honours it
// because audiences are read from marketing_consents at send time (services/marketing/consent.js).

const express = require("express");
const pool = require("../db");
const { parseId } = require("../lib/currentUser");
const { requireFeature } = require("../lib/access");
const { CHANNELS, setChannels, withdraw, activeChannels, readUnsubscribeToken } = require("../services/marketing/consent");

const router = express.Router();
const SOURCES = ["save_prompt", "account"];

router.use("/me/consents", requireFeature("account.use"));

// Every business the customer gets offers from, with the channels.
router.get("/me/consents", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT v.vendor_id, v.vendor_name, v.vendor_name_bn, v.vendor_slug,
                    array_agg(c.consent_channel ORDER BY c.consent_channel) AS channels,
                    min(c.consent_given_at) AS given_at
             FROM marketing_consents c
             JOIN vendors v ON v.vendor_id = c.vendor_id
             WHERE c.user_id = $1 AND c.consent_withdrawn_at IS NULL
             GROUP BY v.vendor_id
             ORDER BY v.vendor_name`,
            [req.user.user_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/me/consents failed:", err);
        res.status(500).json({ error: "Could not load your offer choices" });
    }
});

// Sets exactly which channels this business may use: { channels: ["email", "sms"], source }.
// An empty list stops all offers from the business.
router.put("/me/consents/:vendorId", async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    if (!vendorId) return res.status(400).json({ error: "Invalid business id" });
    const channels = req.body?.channels;
    if (!Array.isArray(channels) || channels.some((c) => !CHANNELS.includes(c)) || new Set(channels).size !== channels.length) {
        return res.status(400).json({ error: "Choose email, SMS, both or neither" });
    }
    const source = req.body?.source ?? "account";
    if (!SOURCES.includes(source)) return res.status(400).json({ error: "Invalid source" });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const vendor = await client.query("SELECT 1 FROM vendors WHERE vendor_id = $1 AND vendor_status = 'approved'", [vendorId]);
        if (vendor.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Business not found" });
        }
        if (channels.includes("email")) {
            const user = await client.query("SELECT user_email FROM users WHERE user_id = $1", [req.user.user_id]);
            if (!user.rows[0]?.user_email) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "Your account has no email address, so offers can only come by SMS" });
            }
        }
        const active = await setChannels(client, req.user.user_id, vendorId, channels, source);
        await client.query("COMMIT");
        res.json({ vendor_id: vendorId, channels: active });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`PUT /api/me/consents/${vendorId} failed:`, err);
        res.status(500).json({ error: "Could not save your offer choices" });
    } finally {
        client.release();
    }
});

// ---------- public unsubscribe link ----------

async function linkDetails(token) {
    const link = readUnsubscribeToken(token);
    if (!link) return null;
    const vendor = await pool.query("SELECT vendor_name, vendor_name_bn, vendor_slug FROM vendors WHERE vendor_id = $1", [link.vendorId]);
    if (vendor.rowCount === 0) return null;
    return { link, business: vendor.rows[0] };
}

// Shows what the link would stop. Never changes anything, because mail scanners open links.
router.get("/unsubscribe/:token", async (req, res) => {
    try {
        const details = await linkDetails(req.params.token);
        if (!details) return res.status(404).json({ error: "This unsubscribe link is not valid" });
        const { link, business } = details;
        const channels = await activeChannels(pool, link.userId, link.vendorId);
        res.json({ business, channel: link.channel, subscribed: channels.includes(link.channel) });
    } catch (err) {
        console.error("GET /api/unsubscribe failed:", err);
        res.status(500).json({ error: "Could not load this unsubscribe link" });
    }
});

// Stops offers at once. No sign-in needed; also the target of one-click unsubscribe (RFC 8058).
router.post("/unsubscribe/:token", async (req, res) => {
    try {
        const details = await linkDetails(req.params.token);
        if (!details) return res.status(404).json({ error: "This unsubscribe link is not valid" });
        const { link, business } = details;
        await withdraw(pool, link.userId, link.vendorId, link.channel, "unsubscribe_link");
        res.json({ business, channel: link.channel, subscribed: false });
    } catch (err) {
        console.error("POST /api/unsubscribe failed:", err);
        res.status(500).json({ error: "Could not unsubscribe you. Please try again." });
    }
});

module.exports = router;
