// New business registration: field checks and the vendor row. Used by POST /api/auth/register/vendor,
// which verifies the phone number first.

const { normalisePhone } = require("./phone");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (value) => (value === undefined || value === null ? "" : String(value).trim());

/** Returns { error } or the cleaned fields. */
function validateVendorRegistration(body) {
    const name = text(body?.vendor_name);
    const email = text(body?.vendor_email).toLowerCase() || null;
    const address = text(body?.vendor_address) || null;
    const city = text(body?.vendor_city) || null;
    const nidReference = text(body?.vendor_nid_reference);

    if (!name) return { error: "Business name is required" };
    if (name.length > 255) return { error: "The business name is too long." };
    if (!text(body?.vendor_phone)) return { error: "Phone number is required" };
    const phone = normalisePhone(body.vendor_phone);
    if (!phone) return { error: "Enter a valid phone number" };
    if (email && (email.length > 255 || !EMAIL.test(email))) return { error: "Enter a valid email address." };
    if (!nidReference) return { error: "NID reference is required" };
    if (nidReference.length > 50) return { error: "The NID reference is too long." };

    return { name, phone, email, address, city, nidReference };
}

// Converts a business name to a URL slug.
function slugify(value) {
    return String(value)
        .normalize("NFKD")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

// Finds a free slug, appending -2, -3 ... on collision, by reading the taken values first.
async function uniqueSlug(client, base) {
    const stem = base || "vendor";
    const { rows } = await client.query(
        `SELECT vendor_slug FROM vendors
         WHERE vendor_slug = $1 OR vendor_slug LIKE $1 || '-%'`,
        [stem]
    );
    const taken = new Set(rows.map((r) => r.vendor_slug));
    if (!taken.has(stem)) return stem;
    let n = 2;
    while (taken.has(`${stem}-${n}`)) n += 1;
    return `${stem}-${n}`;
}

// Resolves a free-text city or area to a locations row; an unknown place simply leaves it unset.
async function resolveLocation(client, city) {
    if (!city) return null;
    const { rows } = await client.query(
        `SELECT location_id FROM locations
         WHERE location_name ILIKE $1 OR location_slug = $2
         ORDER BY CASE location_type WHEN 'area' THEN 1 WHEN 'city' THEN 2 ELSE 3 END
         LIMIT 1`,
        [city, slugify(city)]
    );
    return rows.length ? rows[0].location_id : null;
}

/** Inserts the pending business for an existing user, inside the caller's transaction. */
async function createVendor(client, userId, fields) {
    const locationId = await resolveLocation(client, fields.city);
    const slug = await uniqueSlug(client, slugify(fields.name));
    const result = await client.query(
        `INSERT INTO vendors (
            user_id, vendor_name, vendor_slug, vendor_phone, vendor_email, vendor_address,
            location_id, vendor_nid_reference, vendor_nid_status, vendor_nid_submitted_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
         RETURNING vendor_id, vendor_name, vendor_slug, vendor_phone, vendor_email, vendor_address,
                   location_id, vendor_status, vendor_nid_status, vendor_nid_submitted_at, vendor_created_at`,
        [userId, fields.name, slug, fields.phone, fields.email, fields.address, locationId, fields.nidReference]
    );
    return result.rows[0];
}

module.exports = { validateVendorRegistration, createVendor };
