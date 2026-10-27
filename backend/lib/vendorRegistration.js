// New business registration: field checks and the vendor row. Used by POST /api/auth/register/vendor,
// which verifies the phone number first.
//
// Registering asks for what submitting a business for approval needs (a category, the area and a
// description, as on the dashboard's business form), so a new business can be approved as it is.

const { PHONE_ERROR, normalisePhone } = require("./phone");
const { getSetting } = require("./settings");
const { LIMITS } = require("./businessProfile");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (value) => (value === undefined || value === null ? "" : String(value).trim());
const id = (value) => (/^\d{1,10}$/.test(text(value)) ? Number(value) : null);

/** Returns { error } or the cleaned fields. */
function validateVendorRegistration(body) {
    const name = text(body?.vendor_name);
    const email = text(body?.vendor_email).toLowerCase() || null;
    const address = text(body?.vendor_address) || null;
    const description = text(body?.vendor_description);
    const categoryId = id(body?.category_id);
    const locationId = id(body?.location_id);

    if (!name) return { error: "Business name is required" };
    if (name.length > 255) return { error: "The business name is too long." };
    if (!text(body?.vendor_phone)) return { error: "Phone number is required" };
    const phone = normalisePhone(body.vendor_phone);
    if (!phone) return { error: PHONE_ERROR };
    if (email && (email.length > 255 || !EMAIL.test(email))) return { error: "Enter a valid email address." };
    if (categoryId === null) return { error: "Choose a category." };
    if (locationId === null) return { error: "Choose the area." };
    if (description.length < LIMITS.descriptionMin) {
        return { error: `Describe the business in at least ${LIMITS.descriptionMin} characters.` };
    }
    if (description.length > LIMITS.descriptionMax) {
        return { error: `Keep the description under ${LIMITS.descriptionMax} characters.` };
    }
    // NID is no longer collected (client decision, 20 October 2026); the columns stay for later use.
    return { name, phone, email, address, description, categoryId, locationId };
}

/** Checks the chosen category and area exist. Returns an error message or null. */
async function invalidChoice(db, fields) {
    const { rows } = await db.query(
        `SELECT EXISTS (SELECT 1 FROM categories WHERE category_id = $1 AND category_is_active) AS category,
                EXISTS (SELECT 1 FROM locations WHERE location_id = $2 AND location_type = 'area') AS area`,
        [fields.categoryId, fields.locationId]
    );
    if (!rows[0].category) return "Choose a category from the list.";
    if (!rows[0].area) return "Choose an area from the list.";
    return null;
}

/** The categories (grouped by top-level category) and areas a business chooses from. */
async function businessOptions(db) {
    const [categories, areas] = await Promise.all([
        db.query(
            `SELECT c.category_id AS id,
                    CASE WHEN c.category_parent_id IS NULL
                         THEN c.category_name || ' (general)' ELSE c.category_name END AS name,
                    COALESCE(p.category_name, c.category_name) AS parent
             FROM categories c
             LEFT JOIN categories p ON p.category_id = c.category_parent_id
             WHERE c.category_is_active AND (p.category_id IS NULL OR p.category_is_active)
             ORDER BY COALESCE(p.category_sort_order, c.category_sort_order),
                      COALESCE(p.category_id, c.category_id),
                      c.category_parent_id IS NOT NULL, c.category_sort_order, c.category_id`
        ),
        db.query(
            `SELECT a.location_id AS id, a.location_name AS name, city.location_name AS city
             FROM locations a
             JOIN locations city ON city.location_id = a.location_parent_id
             WHERE a.location_type = 'area'
             ORDER BY city.location_name, a.location_name`
        ),
    ]);
    return { categories: categories.rows, areas: areas.rows };
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

/**
 * Inserts the business for an existing user, inside the caller's transaction. It waits for an admin
 * unless business approval is switched off (KAN-293), in which case it is approved at once and the
 * automatic approval is recorded in the audit log.
 */
async function createVendor(client, userId, fields) {
    const slug = await uniqueSlug(client, slugify(fields.name));
    const needsApproval = await getSetting(client, "require_business_approval");
    const result = await client.query(
        `INSERT INTO vendors (
            user_id, vendor_name, vendor_slug, vendor_phone, vendor_email, vendor_address,
            vendor_description, location_id, vendor_status, vendor_verified_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text, CASE WHEN $9::text = 'approved' THEN NOW() END)
         RETURNING vendor_id, vendor_name, vendor_slug, vendor_phone, vendor_email, vendor_address,
                   vendor_description, location_id, vendor_status, vendor_created_at`,
        [
            userId, fields.name, slug, fields.phone, fields.email, fields.address,
            fields.description, fields.locationId, needsApproval ? "pending" : "approved",
        ]
    );
    const vendor = result.rows[0];
    await client.query("INSERT INTO vendor_categories (vendor_id, category_id) VALUES ($1, $2)", [vendor.vendor_id, fields.categoryId]);
    if (!needsApproval) {
        await client.query(
            `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
             VALUES ($1, 'vendor.auto_approve', 'vendor', $2, NULL, $3)`,
            [userId, vendor.vendor_id, JSON.stringify({ status: "approved", reason: "Business approval is switched off" })]
        );
    }
    return vendor;
}

/** What to tell the owner after registering. */
function registeredMessage(vendor) {
    return vendor.vendor_status === "approved"
        ? "Business registered. It is public now."
        : "Business registered. It appears publicly once an administrator approves it.";
}

module.exports = { validateVendorRegistration, invalidChoice, businessOptions, createVendor, registeredMessage };
