// Marketing consent (KAN-284): a customer's permission for one business to send them offers.
//
// The only place that gives or withdraws consent, builds a business's audience and signs
// unsubscribe links. Saving a business never gives consent by itself. Withdrawing keeps the row
// (consent_withdrawn_at), so there is a record of when consent was given and withdrawn, and how.

const crypto = require("crypto");
const { siteUrl } = require("../../lib/site");

const CHANNELS = ["email", "sms"];

/** The channels this customer currently gets offers on from this business. */
async function activeChannels(db, userId, vendorId) {
    const result = await db.query(
        `SELECT consent_channel FROM marketing_consents
         WHERE user_id = $1 AND vendor_id = $2 AND consent_withdrawn_at IS NULL
         ORDER BY consent_channel`,
        [userId, vendorId]
    );
    return result.rows.map((row) => row.consent_channel);
}

/** Withdraws active consent for one channel, or every channel when channel is null. Returns how many were withdrawn. */
async function withdraw(db, userId, vendorId, channel, source) {
    const result = await db.query(
        `UPDATE marketing_consents
         SET consent_withdrawn_at = now(), consent_withdrawn_source = $4
         WHERE user_id = $1 AND vendor_id = $2 AND consent_withdrawn_at IS NULL
           AND ($3::text IS NULL OR consent_channel = $3)`,
        [userId, vendorId, channel, source]
    );
    return result.rowCount;
}

/** Withdraws one channel for every business, e.g. when the customer removes their email address. */
async function withdrawChannelEverywhere(db, userId, channel, source) {
    const result = await db.query(
        `UPDATE marketing_consents
         SET consent_withdrawn_at = now(), consent_withdrawn_source = $3
         WHERE user_id = $1 AND consent_channel = $2 AND consent_withdrawn_at IS NULL`,
        [userId, channel, source]
    );
    return result.rowCount;
}

/**
 * Makes the customer's active channels for this business exactly `channels`: gives the new ones
 * and withdraws the rest. Run inside a transaction. Returns the active channels afterwards.
 */
async function setChannels(db, userId, vendorId, channels, source) {
    const current = await activeChannels(db, userId, vendorId);
    for (const channel of current.filter((c) => !channels.includes(c))) {
        await withdraw(db, userId, vendorId, channel, "account");
    }
    for (const channel of channels.filter((c) => !current.includes(c))) {
        await db.query(
            `INSERT INTO marketing_consents (user_id, vendor_id, consent_channel, consent_source)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, vendor_id, consent_channel) WHERE consent_withdrawn_at IS NULL DO NOTHING`,
            [userId, vendorId, channel, source]
        );
    }
    return activeChannels(db, userId, vendorId);
}

/**
 * Everyone a business may send offers to on one channel: active consent, an active account, and
 * an address for the channel. Campaign sending (Stage 4) must use only this list.
 */
async function audienceFor(db, vendorId, channel) {
    if (!CHANNELS.includes(channel)) throw new Error(`Unknown channel "${channel}"`);
    const result = await db.query(
        `SELECT u.user_id, u.user_name,
                CASE WHEN $2 = 'email' THEN u.user_email ELSE u.user_phone END AS address
         FROM marketing_consents c
         JOIN users u ON u.user_id = c.user_id
         WHERE c.vendor_id = $1 AND c.consent_channel = $2 AND c.consent_withdrawn_at IS NULL
           AND u.user_status = 'active'
           AND ($2 <> 'email' OR u.user_email IS NOT NULL)
         ORDER BY u.user_id`,
        [vendorId, channel]
    );
    return result.rows;
}

// ---------- unsubscribe links ----------

// Signed with UNSUBSCRIBE_SECRET, or a key derived from OTP_HASH_SECRET so existing setups work.
function signingKey() {
    const secret = process.env.UNSUBSCRIBE_SECRET || process.env.OTP_HASH_SECRET;
    if (!secret) throw new Error("UNSUBSCRIBE_SECRET (or OTP_HASH_SECRET) is not configured.");
    return crypto.createHmac("sha256", secret).update("shahebbazar:unsubscribe").digest();
}

function signature(userId, vendorId, channel) {
    return crypto
        .createHmac("sha256", signingKey())
        .update(`${userId}:${vendorId}:${channel}`)
        .digest("base64url")
        .slice(0, 32);
}

/**
 * A token that withdraws this customer's consent for one business and channel. It does not
 * expire, because links in old emails must keep working, and it always acts on the current consent.
 */
function unsubscribeToken(userId, vendorId, channel) {
    return `${userId}.${vendorId}.${channel}.${signature(userId, vendorId, channel)}`;
}

/** Returns { userId, vendorId, channel } for a genuine token, otherwise null. */
function readUnsubscribeToken(token) {
    const match = /^(\d{1,10})\.(\d{1,10})\.(email|sms)\.([A-Za-z0-9_-]{32})$/.exec(String(token ?? ""));
    if (!match) return null;
    const [, user, vendor, channel, sig] = match;
    const expected = signature(Number(user), Number(vendor), channel);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { userId: Number(user), vendorId: Number(vendor), channel };
}

/** The page a customer opens from an offer to stop offers from that business on that channel. */
function unsubscribeUrl(userId, vendorId, channel) {
    return `${siteUrl()}/unsubscribe/${unsubscribeToken(userId, vendorId, channel)}`;
}

module.exports = {
    CHANNELS,
    activeChannels,
    withdraw,
    withdrawChannelEverywhere,
    setChannels,
    audienceFor,
    unsubscribeToken,
    readUnsubscribeToken,
    unsubscribeUrl,
};
