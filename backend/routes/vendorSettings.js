const express = require("express");
const pool = require("../db");
const { parseId, cleanText } = require("../lib/currentUser");
const { normalisePhone } = require("../lib/phone");
const { requireVendorOwnership } = require("../lib/middleware/auth");
const { requireFeature } = require("../lib/access");

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const memberAccess = [requireFeature("business.settings"), requireVendorOwnership];
const teamAccess = [requireFeature("business.team"), requireVendorOwnership];
// Reading who runs the business: its members, or an admin (read-only).
const readAccess = [requireFeature("business.team.read"), requireVendorOwnership];

// The business in the URL. Admins pass requireVendorOwnership without req.vendor; null when it does not exist.
async function businessFor(req) {
    if (req.vendor) return req.vendor.vendor_id;
    const id = parseId(req.params.vendorId);
    const found = id && (await pool.query("SELECT 1 FROM vendors WHERE vendor_id = $1", [id])).rowCount;
    return found ? id : null;
}

// The business owner's details, shown to an admin.
async function ownerOf(vendorId) {
    const result = await pool.query(
        `SELECT u.user_id, u.user_name, u.user_phone, u.user_email, m.member_role
         FROM vendor_members m JOIN users u ON u.user_id = m.user_id
         WHERE m.vendor_id = $1 AND m.member_role = 'owner'`,
        [vendorId]
    );
    return result.rows[0] ?? null;
}

// Contact details of the person signed in. With several managers, each edits their own.
async function memberDetails(vendorId, userId) {
    const result = await pool.query(
        `SELECT u.user_id, u.user_name, u.user_phone, u.user_email, m.member_role
         FROM vendor_members m JOIN users u ON u.user_id = m.user_id
         WHERE m.vendor_id = $1 AND m.user_id = $2`,
        [vendorId, userId]
    );
    return result.rows[0] ?? null;
}

async function listMembers(vendorId) {
    const result = await pool.query(
        `SELECT u.user_id, u.user_name, u.user_phone, m.member_role, m.member_added_at AS added_at
         FROM vendor_members m JOIN users u ON u.user_id = m.user_id
         WHERE m.vendor_id = $1
         ORDER BY m.member_role = 'owner' DESC, m.member_added_at, u.user_id`,
        [vendorId]
    );
    return result.rows;
}

function ownerOnly(req, res, next) {
    if (req.vendor.member_role === "owner") return next();
    return res.status(403).json({ error: "Only the business owner can change who manages it." });
}

// A member sees their own details; an admin sees the owner's.
router.get("/vendors/:vendorId/owner", ...readAccess, async (req, res) => {
    try {
        const vendorId = await businessFor(req);
        if (!vendorId) return res.status(404).json({ error: "Business not found" });
        res.json(req.vendor ? await memberDetails(vendorId, req.user.user_id) : await ownerOf(vendorId));
    } catch (err) {
        console.error(`GET /api/vendors/${req.params.vendorId}/owner failed:`, err);
        res.status(500).json({ error: "Could not load your details" });
    }
});

router.put("/vendors/:vendorId/owner", ...memberAccess, async (req, res) => {
    const name = cleanText(req.body?.user_name) ?? "";
    const email = cleanText(req.body?.user_email) || null;
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Enter your name (2 to 100 characters)." });
    if (email && (email.length > 255 || !EMAIL.test(email))) return res.status(400).json({ error: "Enter a valid email address, or leave it empty." });

    try {
        await pool.query(
            "UPDATE users SET user_name = $2, user_email = $3, user_updated_at = NOW() WHERE user_id = $1",
            [req.user.user_id, name, email ? email.toLowerCase() : null]
        );
        res.json(await memberDetails(req.vendor.vendor_id, req.user.user_id));
    } catch (err) {
        if (err.code === "23505") return res.status(409).json({ error: "That email address is already used by another account." });
        console.error(`PUT /api/vendors/${req.vendor.vendor_id}/owner failed:`, err);
        res.status(500).json({ error: "Could not save your details. Try again." });
    }
});

// Team (KAN-252): the owner can let other accounts help run the business.

router.get("/vendors/:vendorId/members", ...readAccess, async (req, res) => {
    try {
        const vendorId = await businessFor(req);
        if (!vendorId) return res.status(404).json({ error: "Business not found" });
        res.json(await listMembers(vendorId));
    } catch (err) {
        console.error(`GET /api/vendors/${req.params.vendorId}/members failed:`, err);
        res.status(500).json({ error: "Could not load the team" });
    }
});

router.post("/vendors/:vendorId/members", ...teamAccess, ownerOnly, async (req, res) => {
    const phone = normalisePhone(req.body?.phone);
    if (!phone) return res.status(400).json({ error: "Enter a valid phone number." });
    const vendorId = req.vendor.vendor_id;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const user = await client.query(
            "SELECT user_id, user_role FROM users WHERE user_phone = $1 AND user_status = 'active' FOR UPDATE",
            [phone]
        );
        if (user.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "No Shahebbazar account uses that phone number. Ask them to register first." });
        }
        const { user_id: userId, user_role: role } = user.rows[0];
        if (role === "admin") {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "An administrator account cannot manage a business." });
        }

        const added = await client.query(
            `INSERT INTO vendor_members (vendor_id, user_id, member_role, member_added_by)
             VALUES ($1, $2, 'manager', $3)
             ON CONFLICT (vendor_id, user_id) DO NOTHING`,
            [vendorId, userId, req.user.user_id]
        );
        if (added.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "That person already helps run this business." });
        }
        // A customer added as a manager needs the business login.
        await client.query(
            "UPDATE users SET user_role = 'vendor', user_updated_at = NOW() WHERE user_id = $1 AND user_role = 'customer'",
            [userId]
        );
        await client.query("COMMIT");
        res.status(201).json(await listMembers(vendorId));
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`POST /api/vendors/${vendorId}/members failed:`, err);
        res.status(500).json({ error: "Could not add the manager. Try again." });
    } finally {
        client.release();
    }
});

router.delete("/vendors/:vendorId/members/:userId", ...teamAccess, ownerOnly, async (req, res) => {
    const vendorId = req.vendor.vendor_id;
    const userId = parseId(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid member" });
    try {
        const removed = await pool.query(
            "DELETE FROM vendor_members WHERE vendor_id = $1 AND user_id = $2 AND member_role = 'manager'",
            [vendorId, userId]
        );
        if (removed.rowCount === 0) return res.status(404).json({ error: "Manager not found. The owner cannot be removed." });
        res.json(await listMembers(vendorId));
    } catch (err) {
        console.error(`DELETE /api/vendors/${vendorId}/members/${userId} failed:`, err);
        res.status(500).json({ error: "Could not remove the manager. Try again." });
    }
});

module.exports = router;
