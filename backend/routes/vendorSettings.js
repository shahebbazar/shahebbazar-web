const express = require("express");
const pool = require("../db");
const { parseId, cleanText } = require("../lib/currentUser");
const { vendorOwnerOrAdmin } = require("../lib/middleware/auth");

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Loads the owner's contact details for a business.
async function ownerDetails(vendorId) {
    const result = await pool.query(
        `SELECT u.user_id, u.user_name, u.user_phone, u.user_email
         FROM vendors v JOIN users u ON u.user_id = v.user_id
         WHERE v.vendor_id = $1`,
        [vendorId]
    );
    return result.rows[0] ?? null;
}

router.get("/vendors/:vendorId/owner", ...vendorOwnerOrAdmin, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    if (!vendorId) return res.status(400).json({ error: "Invalid business id" });
    try {
        const owner = await ownerDetails(vendorId);
        if (!owner) return res.status(404).json({ error: "Business not found" });
        res.json(owner);
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/owner failed:`, err);
        res.status(500).json({ error: "Could not load the owner's details" });
    }
});

router.put("/vendors/:vendorId/owner", ...vendorOwnerOrAdmin, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    if (!vendorId) return res.status(400).json({ error: "Invalid business id" });
    const name = cleanText(req.body?.user_name) ?? "";
    const email = cleanText(req.body?.user_email) || null;
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Enter your name (2 to 100 characters)." });
    if (email && (email.length > 255 || !EMAIL.test(email))) return res.status(400).json({ error: "Enter a valid email address, or leave it empty." });

    try {
        const owner = await ownerDetails(vendorId);
        if (!owner) return res.status(404).json({ error: "Business not found" });
        await pool.query(
            "UPDATE users SET user_name = $2, user_email = $3, user_updated_at = NOW() WHERE user_id = $1",
            [owner.user_id, name, email ? email.toLowerCase() : null]
        );
        res.json(await ownerDetails(vendorId));
    } catch (err) {
        if (err.code === "23505") return res.status(409).json({ error: "That email address is already used by another account." });
        console.error(`PUT /api/vendors/${vendorId}/owner failed:`, err);
        res.status(500).json({ error: "Could not save your details. Try again." });
    }
});

module.exports = router;
