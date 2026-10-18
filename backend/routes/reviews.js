const express = require("express");
const pool = require("../db");
const {
    parseId,
    cleanText,
} = require("../lib/currentUser");

const {
    requireAuthenticatedUser,
    requireRole,
    vendorOwnerOrAdmin,
    vendorOwnerOnly,
} = require("../lib/middleware/auth");

const router = express.Router();
const REVIEW_MAX = 2000;
const REPLY_MAX = 1000;

router.post(
    "/businesses/:slug/reviews",
    requireAuthenticatedUser,
    requireRole("customer"),
    async (req, res) => {
        const rating = Number(req.body?.rating);
        const body = cleanText(req.body?.body) || null;
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Choose a rating from 1 to 5 stars." });
        }
        if (body && body.length > REVIEW_MAX) {
            return res.status(400).json({ error: `Keep the review under ${REVIEW_MAX} characters.` });
        }

        try {
            const userId = req.user.user_id;
            //if (!userId) return res.status(500).json({ error: "No customer account exists to review from." });
            const vendor = await pool.query(
                "SELECT vendor_id, user_id FROM vendors WHERE vendor_slug = $1 AND vendor_status = 'approved'",
                [req.params.slug]
            );
            if (vendor.rowCount === 0) return res.status(404).json({ error: "Business not found" });
            if (vendor.rows[0].user_id === userId) return res.status(403).json({ error: "You cannot review your own business." });

            const existing = await pool.query(
                "SELECT review_status FROM reviews WHERE vendor_id = $1 AND user_id = $2",
                [vendor.rows[0].vendor_id, userId]
            );
            if (["hidden", "removed"].includes(existing.rows[0]?.review_status)) {
                return res.status(409).json({ error: "Your review was taken down by a moderator and cannot be edited." });
            }

            const result = await pool.query(
                `INSERT INTO reviews (vendor_id, user_id, review_rating, review_body, review_status)
             VALUES ($1, $2, $3, $4, 'published')
             ON CONFLICT (vendor_id, user_id) DO UPDATE
                 SET review_rating = EXCLUDED.review_rating,
                     review_body = EXCLUDED.review_body,
                     review_status = 'published',
                     review_created_at = NOW()
             RETURNING review_id, review_rating AS rating, review_body AS body, review_status AS status`,
                [vendor.rows[0].vendor_id, userId, rating, body]
            );
            res.status(existing.rowCount ? 200 : 201).json(result.rows[0]);
        } catch (err) {
            console.error(`POST /api/businesses/${req.params.slug}/reviews failed:`, err);
            res.status(500).json({ error: "Could not save your review. Try again." });
        }
    }
);

router.get("/vendors/:vendorId/reviews", ...vendorOwnerOrAdmin, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    if (!vendorId) return res.status(400).json({ error: "Invalid business id" });
    try {
        const vendor = await pool.query("SELECT 1 FROM vendors WHERE vendor_id = $1", [vendorId]);
        if (vendor.rowCount === 0) return res.status(404).json({ error: "Business not found" });
        const result = await pool.query(
            `SELECT r.review_id, r.review_rating AS rating, r.review_body AS body, r.review_status AS status,
                    r.review_created_at AS created_at, r.review_reply AS reply, r.review_replied_at AS replied_at,
                    u.user_name AS author
             FROM reviews r
             JOIN users u ON u.user_id = r.user_id
             WHERE r.vendor_id = $1 AND r.review_status IN ('published', 'pending')
             ORDER BY (r.review_reply IS NULL AND r.review_body IS NOT NULL) DESC, r.review_created_at DESC`,
            [vendorId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/reviews failed:`, err);
        res.status(500).json({ error: "Could not load reviews" });
    }
});

// Replies are posted as the business, so only its owner can write them.
router.put("/vendors/:vendorId/reviews/:reviewId/reply", ...vendorOwnerOnly, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const reviewId = parseId(req.params.reviewId);
    if (!vendorId || !reviewId) return res.status(400).json({ error: "Invalid id" });
    const reply = cleanText(req.body?.reply) || null;
    if (reply && reply.length > REPLY_MAX) {
        return res.status(400).json({ error: `Keep the reply under ${REPLY_MAX} characters.` });
    }
    try {
        const result = await pool.query(
            `UPDATE reviews
             SET review_reply = $3, review_replied_at = CASE WHEN $3::text IS NULL THEN NULL ELSE NOW() END
             WHERE review_id = $2 AND vendor_id = $1 AND review_status IN ('published', 'pending')
             RETURNING review_id, review_reply AS reply, review_replied_at AS replied_at`,
            [vendorId, reviewId, reply]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: "Review not found" });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`PUT /api/vendors/${vendorId}/reviews/${reviewId}/reply failed:`, err);
        res.status(500).json({ error: "Could not save the reply. Try again." });
    }
});

module.exports = router;
