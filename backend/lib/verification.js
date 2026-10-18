// Verification codes and sessions, shared by sign-in and the registration routes.

const crypto = require("node:crypto");
const { hashSessionToken } = require("./middleware/auth");

const OTP_ATTEMPT_LIMIT = 5;
const SESSION_DURATION_DAYS = 7;
const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Creates a one-way hash using the code and a private server secret.
function hashVerificationCode({ phone, purpose, code }) {
    const secret = process.env.OTP_HASH_SECRET;
    if (!secret) {
        throw new Error("OTP_HASH_SECRET is not configured.");
    }
    return crypto.createHmac("sha256", secret).update(`${phone}:${purpose}:${code}`).digest("hex");
}

function hashesMatch(first, second) {
    if (typeof first !== "string" || typeof second !== "string") return false;
    const firstBuffer = Buffer.from(first, "hex");
    const secondBuffer = Buffer.from(second, "hex");
    if (firstBuffer.length === 0 || firstBuffer.length !== secondBuffer.length) return false;
    return crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function sessionCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_DURATION_MS,
    };
}

/**
 * Checks the latest code for phone + purpose inside the caller's transaction and, when it
 * matches, marks it used. Returns true on success. On a wrong code the failed attempt is
 * recorded, so the caller should COMMIT (not roll back) before answering 401.
 */
async function useVerificationCode(client, { phone, purpose, code }) {
    const result = await client.query(
        `SELECT otp_id, otp_code_hash, otp_attempts, otp_expires_at, otp_consumed_at
         FROM otp_codes
         WHERE otp_phone = $1 AND otp_purpose = $2
         ORDER BY otp_created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [phone, purpose]
    );
    const otp = result.rows[0];
    if (
        !otp ||
        otp.otp_consumed_at !== null ||
        new Date(otp.otp_expires_at).getTime() <= Date.now() ||
        otp.otp_attempts >= OTP_ATTEMPT_LIMIT
    ) {
        return false;
    }

    if (!hashesMatch(hashVerificationCode({ phone, purpose, code }), otp.otp_code_hash)) {
        await client.query(
            `UPDATE otp_codes
             SET otp_attempts = otp_attempts + 1,
                 otp_consumed_at = CASE WHEN otp_attempts + 1 >= $2 THEN NOW() ELSE otp_consumed_at END
             WHERE otp_id = $1`,
            [otp.otp_id, OTP_ATTEMPT_LIMIT]
        );
        return false;
    }

    await client.query(
        "UPDATE otp_codes SET otp_consumed_at = NOW(), otp_attempts = otp_attempts + 1 WHERE otp_id = $1",
        [otp.otp_id]
    );
    return true;
}

/** Creates a session row inside the caller's transaction and returns the raw token for the cookie. */
async function createSession(client, userId, req) {
    const token = crypto.randomBytes(32).toString("base64url");
    await client.query(
        `INSERT INTO sessions (user_id, session_token_hash, session_expires_at, session_user_agent, session_ip)
         VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'), $4, $5)`,
        [userId, hashSessionToken(token), SESSION_DURATION_DAYS, req.get("user-agent") || null, req.ip || null]
    );
    return token;
}

module.exports = {
    OTP_ATTEMPT_LIMIT,
    SESSION_DURATION_DAYS,
    hashVerificationCode,
    hashesMatch,
    sessionCookieOptions,
    useVerificationCode,
    createSession,
};
