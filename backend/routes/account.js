const express = require("express");
const pool = require("../db");
const { parseId, cleanText } = require("../lib/currentUser");
const { requireFeature } = require("../lib/access");

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
            `SELECT u.user_id, u.user_name, u.user_phone, u.user_email,
                    (SELECT COUNT(*)::int FROM saved_businesses s WHERE s.user_id = u.user_id) AS saved_count,
                    (SELECT COUNT(*)::int FROM reviews r WHERE r.user_id = u.user_id) AS review_count,
                    (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.conversation_id = m.conversation_id
                     WHERE c.user_id = u.user_id AND m.sender_user_id <> u.user_id AND m.message_read_at IS NULL) AS unread_messages
             FROM users u WHERE u.user_id = $1`,
            [userId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("GET /api/me failed:", err);
        res.status(500).json({ error: "Could not load your account" });
    }
});

// The customer's own details (KAN-294): { name, email }. Email is optional; an empty one removes it.
// The phone number is the sign-in and is not changed here.
router.put("/me/profile", async (req, res) => {
    const name = cleanText(req.body?.name) ?? "";
    const email = (cleanText(req.body?.email) || "").toLowerCase() || null;
    const errors = {};
    if (name.length < 2 || name.length > 120) errors.name = "Enter your name (2 to 120 characters).";
    if (email && (email.length > 255 || !EMAIL.test(email))) errors.email = "Enter a valid email address, or leave it empty.";
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });

    try {
        const result = await pool.query(
            `UPDATE users SET user_name = $2, user_email = $3, user_updated_at = NOW() WHERE user_id = $1
             RETURNING user_name, user_phone, user_email`,
            [req.user.user_id, name, email]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === "23505") {
            return res.status(409).json({ error: "That email address is already used by another account.", errors: { email: "Already used by another account." } });
        }
        console.error("PUT /api/me/profile failed:", err);
        res.status(500).json({ error: "Could not save your details. Try again." });
    }
});

router.get("/me/saved", async (req, res) => {
    try {
        const userId = req.user.user_id;
        const result = await pool.query(
            `SELECT ${CARD_COLUMNS}, s.saved_at
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

router.delete("/me/saved/:vendorId", async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    if (!vendorId) return res.status(400).json({ error: "Invalid business id" });
    try {
        const userId = req.user.user_id;
        await pool.query("DELETE FROM saved_businesses WHERE user_id = $1 AND vendor_id = $2", [userId, vendorId]);
        res.json({ saved: false });
    } catch (err) {
        console.error(`DELETE /api/me/saved/${vendorId} failed:`, err);
        res.status(500).json({ error: "Could not remove the business" });
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
