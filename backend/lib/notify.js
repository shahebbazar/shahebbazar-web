const pool = require("../db");

const DELAY_MINUTES = Number(process.env.NOTIFY_DELAY_MINUTES) || 5;
const WORKER_INTERVAL_MS = 60 * 1000;

// Writes an in-app alert, plus SMS and email fallbacks that go out only if the message is still unread later.
// `fallbacks` narrows them: updates about an event (KAN-298) send email only, not an SMS to everyone going.
async function notifyNewMessage(db, { userId, conversationId, messageId, from, preview, fallbacks = ["sms", "email"] }) {
    const payload = JSON.stringify({ conversation_id: conversationId, message_id: messageId, from, preview });
    const user = await db.query("SELECT user_email FROM users WHERE user_id = $1", [userId]);
    const channels = fallbacks.filter((channel) => channel !== "email" || user.rows[0]?.user_email);

    await db.query(
        `INSERT INTO notifications (user_id, notification_type, notification_channel, notification_payload,
                                    notification_status, notification_sent_at)
         VALUES ($1, 'message.new', 'in_app', $2, 'sent', NOW())`,
        [userId, payload]
    );
    for (const channel of channels) {
        await db.query(
            `INSERT INTO notifications (user_id, notification_type, notification_channel, notification_payload)
             VALUES ($1, 'message.new', $2, $3)`,
            [userId, channel, payload]
        );
    }
}

// Sends one SMS or email. No gateway is configured yet, so it is written to the server log.
async function deliver(row) {
    const to = row.notification_channel === "sms" ? row.user_phone : row.user_email;
    console.log(`[notify] ${row.notification_channel} to ${to}: new message from ${row.notification_payload.from}`);
}

// Sends queued fallbacks whose message is still unread after the delay, and skips the rest.
async function processQueue() {
    const due = await pool.query(
        `SELECT n.notification_id, n.notification_channel, n.notification_payload,
                u.user_phone, u.user_email,
                m.message_read_at IS NOT NULL AS already_read
         FROM notifications n
         JOIN users u ON u.user_id = n.user_id
         LEFT JOIN messages m ON m.message_id = (n.notification_payload->>'message_id')::int
         WHERE n.notification_status = 'queued'
           AND n.notification_created_at < NOW() - make_interval(mins => $1)
         ORDER BY n.notification_id
         LIMIT 50`,
        [DELAY_MINUTES]
    );

    for (const row of due.rows) {
        if (row.already_read) {
            await pool.query(
                `UPDATE notifications SET notification_status = 'skipped', notification_error = 'Read in the app'
                 WHERE notification_id = $1`,
                [row.notification_id]
            );
            continue;
        }
        try {
            await deliver(row);
            await pool.query(
                `UPDATE notifications SET notification_status = 'sent', notification_sent_at = NOW()
                 WHERE notification_id = $1`,
                [row.notification_id]
            );
        } catch (err) {
            await pool.query(
                `UPDATE notifications SET notification_status = 'failed', notification_error = $2
                 WHERE notification_id = $1`,
                [row.notification_id, String(err.message).slice(0, 500)]
            );
        }
    }
}

// Runs the queue every minute for as long as the API is up.
function startNotificationWorker() {
    const run = () => processQueue().catch((err) => console.error("[notify] queue run failed:", err.message));
    setInterval(run, WORKER_INTERVAL_MS).unref();
}

// Lists a user's in-app alerts with the unread count.
// A vendor gets alerts as a customer and for each business they run, so callers pick which:
// { vendorId } for one business, { asCustomer: true } for their own conversations.
function alertScope(scope) {
    const conversation = "SELECT 1 FROM conversations c WHERE c.conversation_id = (n.notification_payload->>'conversation_id')::int";
    if (scope.vendorId) return { sql: ` AND EXISTS (${conversation} AND c.vendor_id = $2)`, params: [scope.vendorId] };
    if (scope.asCustomer) return { sql: ` AND EXISTS (${conversation} AND c.user_id = n.user_id)`, params: [] };
    return { sql: "", params: [] };
}

async function listAlerts(userId, scope = {}, limit = 20) {
    const { sql, params } = alertScope(scope);
    const [rows, unread] = await Promise.all([
        pool.query(
            `SELECT n.notification_id AS id, n.notification_type AS type, n.notification_payload AS payload,
                    n.notification_read_at AS read_at, n.notification_created_at AS created_at
             FROM notifications n
             WHERE n.user_id = $1 AND n.notification_channel = 'in_app'${sql}
             ORDER BY n.notification_created_at DESC, n.notification_id DESC
             LIMIT ${Number(limit)}`,
            [userId, ...params]
        ),
        pool.query(
            `SELECT COUNT(*)::int AS count FROM notifications n
             WHERE n.user_id = $1 AND n.notification_channel = 'in_app' AND n.notification_read_at IS NULL${sql}`,
            [userId, ...params]
        ),
    ]);
    return { alerts: rows.rows, unread: unread.rows[0].count };
}

// Marks a user's in-app alerts as read, within the same scope as listAlerts.
async function markAlertsRead(userId, scope = {}) {
    const { sql, params } = alertScope(scope);
    await pool.query(
        `UPDATE notifications n SET notification_read_at = NOW()
         WHERE n.user_id = $1 AND n.notification_channel = 'in_app' AND n.notification_read_at IS NULL${sql}`,
        [userId, ...params]
    );
}

module.exports = { notifyNewMessage, startNotificationWorker, processQueue, listAlerts, markAlertsRead };
