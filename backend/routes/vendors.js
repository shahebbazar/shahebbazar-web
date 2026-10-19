const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                vendor_id,
                vendor_name,
                vendor_name_bn,
                vendor_slug,
                vendor_description,
                vendor_phone,
                vendor_email,
                vendor_address,
                location_id,
                vendor_logo_url,
                vendor_cover_url,
                vendor_business_type,
                vendor_status,
                (vendor_is_featured AND vendor_featured_until > now()) AS vendor_is_featured,
                vendor_created_at
             FROM vendors
             WHERE vendor_status = 'approved'
             ORDER BY vendor_name ASC`
        );

        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/vendors failed:", err);
        res.status(500).json({ error: "Unable to retrieve vendors" });
    }
});

// Businesses register through POST /api/auth/register/vendor, which verifies the phone number first.

module.exports = router;
