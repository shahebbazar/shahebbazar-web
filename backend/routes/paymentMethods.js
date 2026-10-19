const express = require("express");
const router = express.Router();
const pool = require("../db");
const { requireVendorOwnership } = require("../lib/middleware/auth");
const { requireFeature } = require("../lib/access");

// Must match the CHECK constraint on vendor_payment_methods.payment_method.
const METHODS = [
    "cash",
    "cash_on_delivery",
    "bank_transfer",
    "bkash",
    "nagad",
    "rocket",
    "card",
];

const NOTE_MAX_LENGTH = 120;

// 8+ digits in a row: blocks phone, wallet and account numbers in notes.
const ACCOUNT_NUMBER_PATTERN = /[0-9০-৯]{8,}/;

router.get("/businesses/:slug/payment-methods", async (req, res) => {
    const { slug } = req.params;

    try {
        // LEFT JOIN so a business with no methods still returns a row.
        const result = await pool.query(
            `SELECT pm.payment_method, pm.payment_note
             FROM vendors v
             LEFT JOIN vendor_payment_methods pm ON pm.vendor_id = v.vendor_id
             WHERE v.vendor_slug = $1 AND v.vendor_status = 'approved'
             ORDER BY pm.payment_sort_order, pm.payment_method_id`,
            [slug]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Business not found" });
        }

        res.json(result.rows.filter((row) => row.payment_method !== null));
    } catch (err) {
        console.error(`GET /api/businesses/${slug}/payment-methods failed:`, err);
        res.status(500).json(errorBody("Could not load payment methods", err));
    }
});

// The vendor routes below are for the owner of :vendorId, or an admin.
const ownerAccess = [
    requireFeature("business.payments"),
    requireVendorOwnership,
];

router.get("/vendors/:vendorId/payment-methods", ...ownerAccess, async (req, res) => {
    
    const vendorId = parseVendorId(req.params.vendorId);
    if (vendorId === null) {
        return res.status(400).json({ error: "Invalid vendor id" });
    }

    try {
        const result = await pool.query(
            `SELECT v.vendor_id, v.vendor_name, v.vendor_slug, v.vendor_status,
                    pm.payment_method, pm.payment_note
             FROM vendors v
             LEFT JOIN vendor_payment_methods pm ON pm.vendor_id = v.vendor_id
             WHERE v.vendor_id = $1
             ORDER BY pm.payment_sort_order, pm.payment_method_id`,
            [vendorId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Vendor not found" });
        }

        const { vendor_name, vendor_slug, vendor_status } = result.rows[0];

        res.json({
            vendor: { vendor_id: vendorId, vendor_name, vendor_slug, vendor_status },
            methods: result.rows
                .filter((row) => row.payment_method !== null)
                .map(({ payment_method, payment_note }) => ({ payment_method, payment_note })),
        });
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/payment-methods failed:`, err);
        res.status(500).json(errorBody("Could not load payment methods", err));
    }
});

// Replaces the vendor's whole set; array order becomes display order.
router.put("/vendors/:vendorId/payment-methods", ...ownerAccess, async (req, res) => {
    const vendorId = parseVendorId(req.params.vendorId);
    if (vendorId === null) {
        return res.status(400).json({ error: "Invalid vendor id" });
    }

    const parsed = parseMethods(req.body?.methods);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // FOR UPDATE makes concurrent saves run one after the other.
        const vendor = await client.query(
            "SELECT vendor_id FROM vendors WHERE vendor_id = $1 FOR UPDATE",
            [vendorId]
        );

        if (vendor.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Vendor not found" });
        }

        await client.query("DELETE FROM vendor_payment_methods WHERE vendor_id = $1", [vendorId]);

        if (parsed.methods.length > 0) {
            await client.query(
                `INSERT INTO vendor_payment_methods
                     (vendor_id, payment_method, payment_note, payment_sort_order)
                 SELECT $1, m.method, m.note, (m.position - 1)::smallint
                 FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS m(method, note, position)`,
                [
                    vendorId,
                    parsed.methods.map((m) => m.payment_method),
                    parsed.methods.map((m) => m.payment_note),
                ]
            );
        }

        await client.query("COMMIT");

        res.json(parsed.methods);
    } catch (err) {
        await client.query("ROLLBACK");
        console.error(`PUT /api/vendors/${vendorId}/payment-methods failed:`, err);
        res.status(500).json(errorBody("Could not save payment methods", err));
    } finally {
        client.release();
    }
});

function parseVendorId(raw) {
    if (!/^\d+$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseMethods(input) {
    if (!Array.isArray(input)) {
        return { error: "methods must be an array" };
    }

    const seen = new Set();
    const methods = [];

    for (const item of input) {
        const method = item?.payment_method;

        if (!METHODS.includes(method)) {
            return { error: `Unknown payment method: ${String(method)}` };
        }
        if (seen.has(method)) {
            return { error: `Payment method listed twice: ${method}` };
        }
        seen.add(method);

        const rawNote = item.payment_note;
        if (rawNote !== undefined && rawNote !== null && typeof rawNote !== "string") {
            return { error: `Note for ${method} must be text` };
        }

        const note = rawNote ? rawNote.trim() : "";

        if (note.length > NOTE_MAX_LENGTH) {
            return { error: `Note for ${method} must be ${NOTE_MAX_LENGTH} characters or fewer` };
        }
        if (ACCOUNT_NUMBER_PATTERN.test(note.replace(/[\s+-]/g, ""))) {
            return {
                error: `Note for ${method} looks like it contains a phone or account number. Customers should confirm payment details with the business directly.`,
            };
        }

        methods.push({ payment_method: method, payment_note: note || null });
    }

    return { methods };
}

// Hides database details in production.
function errorBody(message, err) {
    if (process.env.NODE_ENV === "production") return { error: message };
    return { error: message, detail: err.message };
}

module.exports = router;
