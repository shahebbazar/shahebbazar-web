// Deleting a customer account: 30 days deactivated first, then the personal details are removed.
//
// Deactivating signs the customer out everywhere and stops offers (audiences only include active
// accounts), but keeps everything, so signing in again within the 30 days brings the account back as
// it was. After that, removeExpired anonymises it: the row stays so the reviews and messages businesses
// already have still make sense, shown as from a "Former customer", and the mobile number is freed.
const pool = require("../db");
const { withdrawChannelEverywhere } = require("../services/marketing/consent");
const { removeUnreferencedFiles } = require("./uploads");

const GRACE_DAYS = 30;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

// Whether the user runs a business, which has to be handed over before the account can go.
async function runsBusiness(db, userId) {
    const result = await db.query(
        "SELECT 1 FROM vendors WHERE user_id = $1 UNION SELECT 1 FROM vendor_members WHERE user_id = $1 LIMIT 1",
        [userId]
    );
    return result.rowCount > 0;
}

// Starts the 30 days. Run inside a transaction. Returns the date the details will be removed.
async function deactivate(db, userId) {
    const result = await db.query(
        `UPDATE users SET user_status = 'deactivated', user_deactivated_at = NOW(), user_updated_at = NOW()
         WHERE user_id = $1 AND user_status = 'active'
         RETURNING user_deactivated_at + ($2 * INTERVAL '1 day') AS removed_on`,
        [userId, GRACE_DAYS]
    );
    await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await db.query(
        `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
         VALUES ($1, 'account.deactivate', 'user', $1, NULL, NULL)`,
        [userId]
    );
    return result.rows[0]?.removed_on ?? null;
}

// Brings back an account deactivated less than 30 days ago (on signing in). Returns true if it did.
async function reactivate(db, userId) {
    const result = await db.query(
        `UPDATE users SET user_status = 'active', user_deactivated_at = NULL, user_updated_at = NOW()
         WHERE user_id = $1 AND user_status = 'deactivated'
           AND user_deactivated_at > NOW() - ($2 * INTERVAL '1 day')`,
        [userId, GRACE_DAYS]
    );
    if (result.rowCount) {
        await db.query(
            `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
             VALUES ($1, 'account.reactivate', 'user', $1, NULL, NULL)`,
            [userId]
        );
    }
    return result.rowCount > 0;
}

// The SQL for "still within the 30 days", for sign-in checks.
const WITHIN_GRACE = `user_status = 'deactivated' AND user_deactivated_at > NOW() - (${GRACE_DAYS} * INTERVAL '1 day')`;

// Removes the personal details of one account. Run inside a transaction.
async function anonymise(db, userId) {
    const before = await db.query("SELECT user_avatar_url FROM users WHERE user_id = $1 FOR UPDATE", [userId]);
    await withdrawChannelEverywhere(db, userId, "email", "account");
    await withdrawChannelEverywhere(db, userId, "sms", "account");
    await db.query("DELETE FROM saved_businesses WHERE user_id = $1", [userId]);
    await db.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
    await db.query("UPDATE conversations SET conversation_status = 'closed' WHERE user_id = $1 AND conversation_status = 'open'", [userId]);
    await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await db.query(
        `UPDATE users SET user_status = 'deleted', user_name = 'Former customer', user_email = NULL,
                user_phone = 'deleted-' || user_id, user_password_hash = NULL, user_avatar_url = NULL,
                location_id = NULL, user_phone_verified_at = NULL, user_updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
    );
    await db.query(
        `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
         VALUES (NULL, 'account.delete', 'user', $1, NULL, NULL)`,
        [userId]
    );
    return before.rows[0]?.user_avatar_url ?? null;
}

// Anonymises every account deactivated more than 30 days ago. Returns how many.
async function removeExpired() {
    const due = await pool.query(
        `SELECT user_id FROM users
         WHERE user_status = 'deactivated' AND user_deactivated_at <= NOW() - ($1 * INTERVAL '1 day')`,
        [GRACE_DAYS]
    );
    for (const { user_id: userId } of due.rows) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const photo = await anonymise(client, userId);
            await client.query("COMMIT");
            await removeUnreferencedFiles(pool, [photo]);
        } catch (err) {
            await client.query("ROLLBACK").catch(() => { });
            console.error(`[accounts] removing account ${userId} failed:`, err.message);
        } finally {
            client.release();
        }
    }
    return due.rowCount;
}

// Checks once at start, then every hour, for as long as the API is up.
function startAccountRemoval() {
    const run = () => removeExpired().catch((err) => console.error("[accounts] removal run failed:", err.message));
    run();
    setInterval(run, PURGE_INTERVAL_MS).unref();
}

module.exports = { GRACE_DAYS, WITHIN_GRACE, runsBusiness, deactivate, reactivate, removeExpired, startAccountRemoval };
