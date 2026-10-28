const pool = require("../db");
const { primaryCategorySlug } = require("./primaryCategory");

// Business membership (KAN-250): owners and managers who can run a business.

/** The user's role in the business ("owner" or "manager"), or null when they are not a member. */
async function memberRole(userId, vendorId, db = pool) {
    const result = await db.query(
        "SELECT member_role FROM vendor_members WHERE vendor_id = $1 AND user_id = $2",
        [vendorId, userId]
    );
    return result.rows[0]?.member_role ?? null;
}

/** Everyone who runs the business, owner first. */
async function businessMemberIds(vendorId, db = pool) {
    const result = await db.query(
        `SELECT user_id FROM vendor_members
         WHERE vendor_id = $1
         ORDER BY member_role = 'owner' DESC, member_added_at, user_id`,
        [vendorId]
    );
    return result.rows.map((row) => row.user_id);
}

/**
 * The businesses a user runs, for the account switcher: approved ones first, then the rest, each in
 * alphabetical order. The dashboard opens the first one when none is remembered (KAN-334), so that is
 * an approved business whenever they have one.
 */
async function memberBusinesses(userId, db = pool) {
    const result = await db.query(
        // The logo, and the main category for its picture when there is none (KAN-333).
        `SELECT v.vendor_id, v.vendor_name, v.vendor_slug, v.vendor_status, m.member_role,
                v.vendor_logo_url AS vendor_logo, ${primaryCategorySlug("v")} AS vendor_category_slug
         FROM vendor_members m
         JOIN vendors v ON v.vendor_id = m.vendor_id
         WHERE m.user_id = $1
         ORDER BY v.vendor_status = 'approved' DESC, lower(v.vendor_name), v.vendor_id`,
        [userId]
    );
    return result.rows;
}

module.exports = { memberRole, businessMemberIds, memberBusinesses };
