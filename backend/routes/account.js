const express = require("express");
const pool = require("../db");
const { parseId, cleanText } = require("../lib/currentUser");
const { requireFeature } = require("../lib/access");
const { SESSION_COOKIE_NAME } = require("../lib/middleware/auth");
const { GRACE_DAYS, runsBusiness, deactivate } = require("../lib/accountDeletion");
const { withdraw, withdrawChannelEverywhere } = require("../services/marketing/consent");
const { imageUpload, receive, discard, storedPath, checkUploads, removeUnreferencedFiles } = require("../lib/uploads");

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = express.Router();

router.use("/me", requireFeature("account.use"));

const CARD_COLUMNS = `
    c.vendor_id, c.vendor_slug, c.vendor_name, c.vendor_name_bn,
    c.vendor_description, c.vendor_address, c.vendor_cover_url, c.vendor_logo_url,
    c.vendor_is_featured, c.is_verified, c.area_name, c.area_name_bn,
    c.primary_category, c.primary_category_bn, c.primary_category_slug,
    c.rating, c.review_count, c.open_state, c.close_time_today`;

router.get("/me", async (req, res) => {
    try {
        const userId = req.user.user_id;
        if (!userId) return res.status(404).json({ error: "No customer account exists" });
        const result = await pool.query(
            `SELECT u.user_id, u.user_name, u.user_phone, u.user_email, u.user_avatar_url, u.location_id, u.user_language,
                    loc.location_name AS area_name, loc.location_name_bn AS area_name_bn,
                    (SELECT COUNT(*)::int FROM saved_businesses s WHERE s.user_id = u.user_id) AS saved_count,
                    (SELECT COUNT(*)::int FROM reviews r WHERE r.user_id = u.user_id) AS review_count,
                    (SELECT COUNT(DISTINCT mc.vendor_id)::int FROM marketing_consents mc
                     WHERE mc.user_id = u.user_id AND mc.consent_withdrawn_at IS NULL) AS offers_count,
                    (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.conversation_id = m.conversation_id
                     WHERE c.user_id = u.user_id AND m.sender_user_id <> u.user_id AND m.message_read_at IS NULL) AS unread_messages
             FROM users u LEFT JOIN locations loc ON loc.location_id = u.location_id
             WHERE u.user_id = $1`,
            [userId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("GET /api/me failed:", err);
        res.status(500).json({ error: "Could not load your account" });
    }
});

// The customer's own details (KAN-294): { name, email, area, language }. Email is optional; an empty one removes it,
// which also stops any offers by email, since there is nowhere to send them. The area (a location id,
// or null) is optional and shows on their reviews. The phone number is the sign-in and is not changed here.
router.put("/me/profile", async (req, res) => {
    const name = cleanText(req.body?.name) ?? "";
    const email = (cleanText(req.body?.email) || "").toLowerCase() || null;
    const rawArea = req.body?.area;
    const area = rawArea === null || rawArea === undefined || rawArea === "" ? null : parseId(String(rawArea));
    const errors = {};
    if (name.length < 2 || name.length > 120) errors.name = "Enter your name (2 to 120 characters).";
    if (email && (email.length > 255 || !EMAIL.test(email))) errors.email = "Enter a valid email address, or leave it empty.";
    if (area === null && rawArea !== null && rawArea !== undefined && rawArea !== "") errors.area = "Choose an area from the list.";
    // Optional: left out, the saved language stays as it is.
    const language = req.body?.language ?? null;
    if (language !== null && !["en", "bn"].includes(language)) errors.language = "Choose English or Bangla.";
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });

    const client = await pool.connect();
    try {
        if (area !== null && (await client.query("SELECT 1 FROM locations WHERE location_id = $1", [area])).rowCount === 0) {
            return res.status(400).json({ error: "Choose an area from the list.", errors: { area: "Choose an area from the list." } });
        }
        await client.query("BEGIN");
        const result = await client.query(
            `UPDATE users SET user_name = $2, user_email = $3, location_id = $4,
                    user_language = COALESCE($5, user_language), user_updated_at = NOW() WHERE user_id = $1
             RETURNING user_name, user_phone, user_email, location_id, user_language`,
            [req.user.user_id, name, email, area, language]
        );
        if (!email) await withdrawChannelEverywhere(client, req.user.user_id, "email", "account");
        await client.query("COMMIT");
        res.json(result.rows[0]);
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        if (err.code === "23505") {
            return res.status(409).json({ error: "That email address is already used by another account.", errors: { email: "Already used by another account." } });
        }
        console.error("PUT /api/me/profile failed:", err);
        res.status(500).json({ error: "Could not save your details. Try again." });
    } finally {
        client.release();
    }
});

// The profile photo: shown beside the customer's name in the header and on their reviews. One at a
// time; a new one replaces the old, whose file is then deleted.
router.post(
    "/me/avatar",
    receive(imageUpload("avatar", AVATAR_MAX_BYTES, 1, (req) => `user-${req.user.user_id}`), "2 MB", null),
    async (req, res) => {
        if (!(await checkUploads(req, res))) return;
        try {
            const result = await pool.query(
                `UPDATE users u SET user_avatar_url = $2, user_updated_at = NOW()
                 FROM (SELECT user_avatar_url AS old_url FROM users WHERE user_id = $1) before
                 WHERE u.user_id = $1
                 RETURNING u.user_avatar_url, before.old_url`,
                [req.user.user_id, storedPath(req.files[0])]
            );
            await removeUnreferencedFiles(pool, [result.rows[0].old_url]);
            res.status(201).json({ avatar_url: result.rows[0].user_avatar_url });
        } catch (err) {
            await discard(req.files);
            console.error("POST /api/me/avatar failed:", err);
            res.status(500).json({ error: "Could not save your photo. Try again." });
        }
    }
);

router.delete("/me/avatar", async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE users u SET user_avatar_url = NULL, user_updated_at = NOW()
             FROM (SELECT user_avatar_url AS old_url FROM users WHERE user_id = $1) before
             WHERE u.user_id = $1
             RETURNING before.old_url`,
            [req.user.user_id]
        );
        await removeUnreferencedFiles(pool, [result.rows[0]?.old_url]);
        res.status(204).end();
    } catch (err) {
        console.error("DELETE /api/me/avatar failed:", err);
        res.status(500).json({ error: "Could not remove your photo. Try again." });
    }
});

// Deletes the customer's account: { confirm: true }. It is deactivated for 30 days first: signed out
// everywhere and sent no offers, but with nothing lost, so signing in again brings it back. After
// that its personal details are removed (lib/accountDeletion.js). Anyone who runs a business has to
// hand it over or remove it first, so a business is never left without an owner.
router.delete("/me", async (req, res) => {
    if (req.body?.confirm !== true) return res.status(400).json({ error: "Confirm that you want to delete your account." });
    const userId = req.user.user_id;
    const client = await pool.connect();
    try {
        if (await runsBusiness(client, userId)) {
            return res.status(409).json({
                error: "You run a business on Shahebbazar. Hand it over to another owner, or contact us to remove it, before deleting your account.",
            });
        }
        await client.query("BEGIN");
        const removedOn = await deactivate(client, userId);
        await client.query("COMMIT");
        res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
        res.json({ removed_on: removedOn, grace_days: GRACE_DAYS });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error("DELETE /api/me failed:", err);
        res.status(500).json({ error: "Could not delete your account. Nothing was changed." });
    } finally {
        client.release();
    }
});

router.get("/me/saved", async (req, res) => {
    try {
        const userId = req.user.user_id;
        const result = await pool.query(
            `SELECT ${CARD_COLUMNS}, s.saved_at,
                    COALESCE((SELECT array_agg(mc.consent_channel ORDER BY mc.consent_channel) FROM marketing_consents mc
                              WHERE mc.user_id = s.user_id AND mc.vendor_id = s.vendor_id AND mc.consent_withdrawn_at IS NULL),
                             '{}') AS offer_channels
             FROM saved_businesses s
             JOIN v_business_cards c ON c.vendor_id = s.vendor_id
             WHERE s.user_id = $1
             ORDER BY s.saved_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/me/saved failed:", err);
        res.status(500).json({ error: "Could not load saved businesses" });
    }
});

router.get("/me/saved-ids", async (req, res) => {
    try {
        const userId = req.user.user_id;
        const result = await pool.query("SELECT vendor_id FROM saved_businesses WHERE user_id = $1", [userId]);
        res.json(result.rows.map((row) => row.vendor_id));
    } catch (err) {
        console.error("GET /api/me/saved-ids failed:", err);
        res.status(500).json({ error: "Could not load saved businesses" });
    }
});

router.put("/me/saved/:vendorId", async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    if (!vendorId) return res.status(400).json({ error: "Invalid business id" });
    try {
        const userId = req.user.user_id;
        const vendor = await pool.query(
            "SELECT 1 FROM vendors WHERE vendor_id = $1 AND vendor_status = 'approved'",
            [vendorId]
        );
        if (vendor.rowCount === 0) return res.status(404).json({ error: "Business not found" });
        await pool.query(
            `INSERT INTO saved_businesses (user_id, vendor_id) VALUES ($1, $2)
             ON CONFLICT (user_id, vendor_id) DO NOTHING`,
            [userId, vendorId]
        );
        res.json({ saved: true });
    } catch (err) {
        console.error(`PUT /api/me/saved/${vendorId} failed:`, err);
        res.status(500).json({ error: "Could not save the business" });
    }
});

// Removing a saved business also stops its offers, since the customer no longer follows it.
router.delete("/me/saved/:vendorId", async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    if (!vendorId) return res.status(400).json({ error: "Invalid business id" });
    const client = await pool.connect();
    try {
        const userId = req.user.user_id;
        await client.query("BEGIN");
        await client.query("DELETE FROM saved_businesses WHERE user_id = $1 AND vendor_id = $2", [userId, vendorId]);
        await withdraw(client, userId, vendorId, null, "unsaved");
        await client.query("COMMIT");
        res.json({ saved: false });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`DELETE /api/me/saved/${vendorId} failed:`, err);
        res.status(500).json({ error: "Could not remove the business" });
    } finally {
        client.release();
    }
});

router.get("/me/reviews", async (req, res) => {
    try {
        const userId = req.user.user_id;
        const result = await pool.query(
            `SELECT r.review_id, r.review_rating AS rating, r.review_body AS body, r.review_status AS status,
                    r.review_created_at AS created_at, r.review_reply AS reply, r.review_replied_at AS replied_at,
                    v.vendor_id, v.vendor_name, v.vendor_slug
             FROM reviews r
             JOIN vendors v ON v.vendor_id = r.vendor_id
             WHERE r.user_id = $1
             ORDER BY r.review_created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/me/reviews failed:", err);
        res.status(500).json({ error: "Could not load your reviews" });
    }
});

router.get("/me/businesses/:slug", async (req, res) => {
    try {
        const userId = req.user.user_id;
        const result = await pool.query(
            `SELECT v.vendor_id,
                    EXISTS (SELECT 1 FROM saved_businesses s WHERE s.user_id = $2 AND s.vendor_id = v.vendor_id) AS saved,
                    (SELECT json_build_object('rating', r.review_rating, 'body', r.review_body, 'status', r.review_status)
                     FROM reviews r WHERE r.user_id = $2 AND r.vendor_id = v.vendor_id) AS review
             FROM vendors v
             WHERE v.vendor_slug = $1 AND v.vendor_status = 'approved'`,
            [req.params.slug, userId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: "Business not found" });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`GET /api/me/businesses/${req.params.slug} failed:`, err);
        res.status(500).json({ error: "Could not load your details for this business" });
    }
});

module.exports = router;
