// Schema verification.

const pool = require("../db");

// Every object is defined in the consolidated baseline; the versioned files in database/legacy/ are not loaded.
const SCHEMA_FILE = "database/baseline/schema.sql";

/** Required tables and views, mapped to the SQL file that defines them. */
const REQUIRED_OBJECTS = Object.fromEntries(
    [
        // Accounts and sign-in
        "users", "sessions", "otp_codes",
        // Taxonomy and businesses
        "locations", "categories", "vendors", "vendor_categories", "vendor_opening_hours",
        "vendor_facts", "vendor_payment_methods", "vendor_photos", "vendor_social_links", "vendor_members",
        // Products and services
        "vendor_listings", "listing_photos",
        // Quotations and messaging
        "quote_requests", "quote_responses", "conversations", "messages", "notifications",
        // Reviews, moderation and saved businesses
        "reviews", "reports", "audit_logs", "saved_businesses",
        // Analytics and events
        "search_logs", "vendor_profile_views", "vendor_search_impressions", "events",
        // Views
        "v_business_cards", "v_moderation_queue", "v_search_trends_daily", "v_active_users_daily",
    ].map((name) => [name, SCHEMA_FILE])
);

// Required columns, as "table.column", that the API relies on beyond the tables existing.
const REQUIRED_COLUMNS = Object.fromEntries(
    [
        "reviews.review_reply",
        "vendors.vendor_nid_reference",
        "vendors.vendor_nid_status",
        "vendors.vendor_nid_submitted_at",
        "vendors.vendor_nid_verified_at",
        "vendors.vendor_nid_verified_by",
    ].map((name) => [name, SCHEMA_FILE])
);

// Checks all required objects in a single query.
async function verifySchema() {
    const names = Object.keys(REQUIRED_OBJECTS);

    const { rows } = await pool.query(
        `SELECT n AS name, to_regclass(n) IS NOT NULL AS present
         FROM unnest($1::text[]) AS n`,
        [names]
    );

    const columns = await pool.query(
        `SELECT c AS name, EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = split_part(c, '.', 1) AND column_name = split_part(c, '.', 2)
         ) AS present
         FROM unnest($1::text[]) AS c`,
        [Object.keys(REQUIRED_COLUMNS)]
    );

    const missing = [
        ...rows.filter((row) => !row.present).map((row) => ({ name: row.name, file: REQUIRED_OBJECTS[row.name] })),
        ...columns.rows.filter((row) => !row.present).map((row) => ({ name: row.name, file: REQUIRED_COLUMNS[row.name] })),
    ];

    return {
        ok: missing.length === 0,
        missing,
        missingFiles: [...new Set(missing.map((item) => item.file))],
    };
}

// Logs schema status at startup so an incomplete database is reported before the first request fails.
async function reportSchemaAtStartup() {
    try {
        const result = await verifySchema();

        if (result.ok) {
            console.log("Database schema verified.");
            return;
        }

        console.warn("");
        console.warn("  WARNING: required database objects are missing.");
        console.warn("");
        for (const { name, file } of result.missing) {
            console.warn(`    ${name.padEnd(24)} defined in ${file}`);
        }
        console.warn("");
        console.warn("  Load:  npm run db:load     (from the repository root)");
        console.warn("  Reset: npm run db:reset");
        console.warn("");
    } catch (err) {
        // Connection failures are reported by /api/health; avoid duplicating them.
        console.warn(`Schema verification skipped: ${err.message}`);
    }
}

module.exports = { verifySchema, reportSchemaAtStartup };
