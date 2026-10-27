const crypto = require("node:crypto");
const express = require("express");
const pool = require("../db");
const { normalisePhone } = require("../lib/phone");
const {
    SESSION_COOKIE_NAME,
    hashSessionToken,
    requireAuthenticatedUser,
} = require("../lib/middleware/auth");
const {
    OTP_ATTEMPT_LIMIT,
    SESSION_DURATION_DAYS,
    hashVerificationCode,
    hashesMatch,
    sessionCookieOptions,
    useVerificationCode,
    createSession,
} = require("../lib/verification");
const { validateVendorRegistration, createVendor, registeredMessage } = require("../lib/vendorRegistration");
const { WITHIN_GRACE, reactivate } = require("../lib/accountDeletion");
const { smsAdapter, codeMessage } = require("../integrations/sms");

const router = express.Router();

console.log("Authentication routes loaded.");

const ALLOWED_PURPOSES = new Set([
    "login",
    "register",
    "recover",
    "verify"
]);
const LOGIN_ROLES = new Set([
    "customer",
    "vendor",
    "admin",
]);

// Vendors can also use the customer login, since they keep every customer feature (KAN-253).
const PORTAL_ROLES = {
    customer: ["customer", "vendor"],
    vendor: ["vendor"],
    admin: ["admin"],
};

function portalError(expectedRole, actualRole) {
    if (expectedRole === "vendor" && actualRole === "customer") {
        return "This account has no business yet. Log in as a customer, then register your business.";
    }
    if (actualRole === "admin") return "This phone number belongs to an administrator. Use Administrator login.";
    return expectedRole === "admin"
        ? "This phone number is not an administrator account."
        : "This phone number belongs to a business account. Use Business owner login.";
}

/**
 * Test server sign-in (no SMS yet): when DEMO_LOGIN_CODE is set to six digits, every code issued is that
 * code instead of a random one, so the team can sign in to the demo accounts. Only for a server with demo
 * data: anyone who knows the code can sign in to any account. Unset everywhere else.
 */
const DEMO_LOGIN_CODE = /^\d{6}$/.test(process.env.DEMO_LOGIN_CODE ?? "") ? process.env.DEMO_LOGIN_CODE : null;
if (process.env.DEMO_LOGIN_CODE && !DEMO_LOGIN_CODE) {
    console.warn("DEMO_LOGIN_CODE is set but isn't six digits, so it is ignored.");
}
if (DEMO_LOGIN_CODE) {
    console.warn("DEMO_LOGIN_CODE is set: every sign-in code is the demo code. Use this only on a test server with demo data.");
}

const OTP_EXPIRY_MINUTES = 5;
const OTP_REQUEST_LIMIT = 3;
const OTP_REQUEST_WINDOW_MINUTES = 10;
// Generates and stores a verification code, and sends it by SMS (KAN-278, integrations/sms). Without an
// SMS provider configured (local development, tests), the code is printed to the API terminal instead.
// { phone, purpose, expectedRole, language? }: language "bn" sends the SMS in Bangla; for a sign-in, an
// account that prefers Bangla (My details) gets it in Bangla too.
router.post("/request-verification", async (req, res) => {
    const phone = normalisePhone(req.body?.phone);
    const purpose = req.body?.purpose;
    const expectedRole = req.body?.expectedRole;
    let language = req.body?.language === "bn" ? "bn" : "en";

    if (!phone) {
        return res.status(400).json({
            success: false,
            error: "Enter a Bangladesh mobile number, for example +8801712345678.",
        });
    }

    if (!ALLOWED_PURPOSES.has(purpose)) {
        return res.status(400).json({
            success: false,
            error: "Invalid verification purpose.",
        });
    }

    if (
        purpose === "login" &&
        !LOGIN_ROLES.has(expectedRole)
    ) {
        return res.status(400).json({
            success: false,
            error: "Choose a valid account type.",
        });
    }

    try {
        /*
         * For login requests, confirm that the account exists and
         * belongs to the selected portal before generating an OTP.
         */
        if (purpose === "login") {
            const userResult = await pool.query(
                `SELECT
                    user_role,
                    user_status,
                    user_language,
                    (${WITHIN_GRACE}) AS can_reactivate
                 FROM users
                 WHERE user_phone = $1
                 LIMIT 1`,
                [phone]
            );

            // A deleted account can sign in again during its 30 days, which brings it back.
            if (
                userResult.rowCount === 0 ||
                (userResult.rows[0].user_status !== "active" && !userResult.rows[0].can_reactivate)
            ) {
                return res.status(401).json({
                    success: false,
                    error:
                        "No active account is registered with this phone number.",
                });
            }

            const actualRole =
                userResult.rows[0].user_role;

            if (!PORTAL_ROLES[expectedRole].includes(actualRole)) {
                return res.status(403).json({
                    success: false,
                    error: portalError(expectedRole, actualRole),
                });
            }

            if (userResult.rows[0].user_language === "bn") language = "bn";
        }

        const recentRequests = await pool.query(
            `SELECT COUNT(*)::int AS request_count
             FROM otp_codes
             WHERE otp_phone = $1
               AND otp_purpose = $2
               AND otp_created_at >
                   NOW() - ($3 * INTERVAL '1 minute')`,
            [
                phone,
                purpose,
                OTP_REQUEST_WINDOW_MINUTES,
            ]
        );

        if (
            recentRequests.rows[0].request_count >=
            OTP_REQUEST_LIMIT
        ) {
            return res.status(429).json({
                success: false,
                error:
                    "Too many verification requests. " +
                    "Please try again later.",
            });
        }

        const code = DEMO_LOGIN_CODE ?? crypto
            .randomInt(0, 1000000)
            .toString()
            .padStart(6, "0");

        const codeHash = hashVerificationCode({
            phone,
            purpose,
            code,
        });

        const inserted = await pool.query(
            `INSERT INTO otp_codes (
                otp_phone,
                otp_code_hash,
                otp_purpose,
                otp_expires_at,
                otp_request_ip
             )
             VALUES (
                $1,
                $2,
                $3,
                NOW() + ($4 * INTERVAL '1 minute'),
                $5
             )
             RETURNING otp_id`,
            [
                phone,
                codeHash,
                purpose,
                OTP_EXPIRY_MINUTES,
                req.ip || null,
            ]
        );

        // The demo code is never sent: everyone on the test server already knows it.
        const sms = DEMO_LOGIN_CODE ? null : smsAdapter();
        if (sms && sms.name !== "console") {
            try {
                await sms.send({ to: phone, message: codeMessage(code, { language, minutes: OTP_EXPIRY_MINUTES }) });
            } catch (sendError) {
                // Not sent, so the code can't be used and shouldn't count towards the request limit.
                await pool.query("DELETE FROM otp_codes WHERE otp_id = $1", [inserted.rows[0].otp_id]);
                console.error(`[sms] sending the ${purpose} code to ${phone} failed: ${sendError.message}`);
                return res.status(502).json({
                    success: false,
                    error: "We couldn't send the code by SMS just now. Please try again in a minute.",
                });
            }
        } else if (
            process.env.NODE_ENV !== "production" &&
            process.env.MOCK_VERIFICATION_DELIVERY ===
            "console"
        ) {
            console.log("");
            console.log(
                `[mock verification] phone: ${phone}`
            );
            console.log(
                `[mock verification] purpose: ${purpose}`
            );
            console.log(
                `[mock verification] code: ${code}`
            );
            console.log("");
        }

        return res.status(201).json({
            success: true,
            message:
                "A verification code has been generated.",
        });
    } catch (error) {
        console.error(
            "POST /api/auth/request-verification failed:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to generate a verification code.",
        });
    }
});

router.post("/verify", async (req, res) => {
    const phone = normalisePhone(req.body?.phone);
    const purpose = req.body?.purpose;
    const expectedRole = req.body?.expectedRole;
    const code =
        typeof req.body?.code === "string"
            ? req.body.code.trim()
            : "";

    if (!phone) {
        return res.status(400).json({
            success: false,
            error: "Enter a Bangladesh mobile number, for example +8801712345678.",
        });
    }

    if (!ALLOWED_PURPOSES.has(purpose)) {
        return res.status(400).json({
            success: false,
            error: "Invalid verification purpose.",
        });
    }

    if (
        purpose === "login" &&
        !LOGIN_ROLES.has(expectedRole)
    ) {
        return res.status(400).json({
            success: false,
            error: "Choose a valid account type.",
        });
    }

    if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({
            success: false,
            error: "Enter the six-digit verification code.",
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const otpResult = await client.query(
            `SELECT
                otp_id,
                otp_code_hash,
                otp_attempts,
                otp_expires_at,
                otp_consumed_at
             FROM otp_codes
             WHERE otp_phone = $1
               AND otp_purpose = $2
             ORDER BY otp_created_at DESC
             LIMIT 1
             FOR UPDATE`,
            [phone, purpose]
        );

        if (otpResult.rowCount === 0) {
            await client.query("ROLLBACK");

            return res.status(401).json({
                success: false,
                error:
                    "The verification code is invalid or has expired.",
            });
        }

        const otp = otpResult.rows[0];

        const expired =
            new Date(otp.otp_expires_at).getTime() <=
            Date.now();

        const unavailable =
            otp.otp_consumed_at !== null ||
            expired ||
            otp.otp_attempts >= OTP_ATTEMPT_LIMIT;

        if (unavailable) {
            await client.query("ROLLBACK");

            return res.status(401).json({
                success: false,
                error:
                    "The verification code is invalid or has expired.",
            });
        }

        const submittedHash = hashVerificationCode({
            phone,
            purpose,
            code,
        });

        if (
            !hashesMatch(
                submittedHash,
                otp.otp_code_hash
            )
        ) {
            await client.query(
                `UPDATE otp_codes
                 SET
                    otp_attempts = otp_attempts + 1,
                    otp_consumed_at =
                        CASE
                            WHEN otp_attempts + 1 >= $2
                            THEN NOW()
                            ELSE otp_consumed_at
                        END
                 WHERE otp_id = $1`,
                [otp.otp_id, OTP_ATTEMPT_LIMIT]
            );

            await client.query("COMMIT");

            return res.status(401).json({
                success: false,
                error:
                    "The verification code is invalid or has expired.",
            });
        }

        if (purpose !== "login") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                error:
                    "This verification purpose is not available through the login endpoint.",
            });
        }

        const userResult = await client.query(
            `SELECT
                user_id,
                user_name,
                user_phone,
                user_email,
                user_role,
                user_status,
                (${WITHIN_GRACE}) AS can_reactivate
             FROM users
             WHERE user_phone = $1
             LIMIT 1
             FOR UPDATE`,
            [phone]
        );

        if (userResult.rowCount === 0) {
            await client.query("ROLLBACK");

            return res.status(401).json({
                success: false,
                error:
                    "No active account is registered with this phone number.",
            });
        }

        const user = userResult.rows[0];

        if (user.user_status !== "active" && !user.can_reactivate) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                error: "This account is not available.",
            });
        }
        if (!PORTAL_ROLES[expectedRole].includes(user.user_role)) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                error: portalError(expectedRole, user.user_role),
            });
        }

        await client.query(
            `UPDATE otp_codes
             SET
                otp_consumed_at = NOW(),
                otp_attempts = otp_attempts + 1
             WHERE otp_id = $1`,
            [otp.otp_id]
        );

        await client.query(
            `UPDATE users
             SET user_phone_verified_at =
                    COALESCE(
                        user_phone_verified_at,
                        NOW()
                    )
             WHERE user_id = $1`,
            [user.user_id]
        );

        // Signing in during the 30 days after deleting brings the account back.
        const reactivated = user.user_status === "deactivated" && await reactivate(client, user.user_id);

        const sessionToken = crypto
            .randomBytes(32)
            .toString("base64url");

        const sessionTokenHash =
            hashSessionToken(sessionToken);

        const sessionResult = await client.query(
            `INSERT INTO sessions (
                user_id,
                session_token_hash,
                session_expires_at,
                session_user_agent,
                session_ip
             )
             VALUES (
                $1,
                $2,
                NOW() + ($3 * INTERVAL '1 day'),
                $4,
                $5
             )
             RETURNING session_id`,
            [
                user.user_id,
                sessionTokenHash,
                SESSION_DURATION_DAYS,
                req.get("user-agent") || null,
                req.ip || null,
            ]
        );

        await client.query("COMMIT");

        res.cookie(
            SESSION_COOKIE_NAME,
            sessionToken,
            sessionCookieOptions()
        );

        return res.json({
            success: true,
            reactivated,
            session_id:
                sessionResult.rows[0].session_id,
            user: {
                user_id: user.user_id,
                user_name: user.user_name,
                user_phone: user.user_phone,
                user_email: user.user_email,
                user_role: user.user_role,
            },
        });
    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "POST /api/auth/verify failed:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to verify the code and create a session.",
        });
    } finally {
        client.release();
    }
});

router.post("/register/customer", async (req, res) => {
    const name =
        typeof req.body?.name === "string"
            ? req.body.name.trim()
            : "";

    const phone = normalisePhone(req.body?.phone);

    const email =
        typeof req.body?.email === "string" &&
            req.body.email.trim()
            ? req.body.email.trim().toLowerCase()
            : null;

    const code =
        typeof req.body?.code === "string"
            ? req.body.code.trim()
            : "";

    // Registering on the Bangla page makes Bangla the account's language (later codes and offers).
    const language = req.body?.language === "bn" ? "bn" : "en";

    if (!name) {
        return res.status(400).json({
            success: false,
            error: "Enter your full name.",
        });
    }

    if (name.length > 120) {
        return res.status(400).json({
            success: false,
            error: "The name is too long.",
        });
    }

    if (!phone) {
        return res.status(400).json({
            success: false,
            error: "Enter a Bangladesh mobile number, for example +8801712345678.",
        });
    }

    if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return res.status(400).json({
            success: false,
            error: "Enter a valid email address.",
        });
    }

    if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({
            success: false,
            error: "Enter the six-digit verification code.",
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const existingUserResult = await client.query(
            `SELECT
                user_id,
                user_phone,
                user_email
             FROM users
             WHERE user_phone = $1
                OR ($2::text IS NOT NULL AND user_email = $2)
             LIMIT 1`,
            [phone, email]
        );

        if (existingUserResult.rowCount > 0) {
            const existingUser =
                existingUserResult.rows[0];

            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                error:
                    existingUser.user_phone === phone
                        ? "That phone number is already registered."
                        : "That email address is already registered.",
            });
        }

        if (!(await useVerificationCode(client, { phone, purpose: "register", code }))) {
            // Commit so a wrong guess still counts towards the attempt limit.
            await client.query("COMMIT");

            return res.status(401).json({
                success: false,
                error:
                    "The verification code is invalid or has expired.",
            });
        }

        const userResult = await client.query(
            `INSERT INTO users (
                user_name,
                user_phone,
                user_email,
                user_role,
                user_phone_verified_at,
                user_language
             )
             VALUES (
                $1,
                $2,
                $3,
                'customer',
                NOW(),
                $4
             )
             RETURNING
                user_id,
                user_name,
                user_phone,
                user_email,
                user_role`,
            [name, phone, email, language]
        );

        const user = userResult.rows[0];

        const sessionToken = await createSession(client, user.user_id, req);

        await client.query("COMMIT");

        res.cookie(
            SESSION_COOKIE_NAME,
            sessionToken,
            sessionCookieOptions()
        );

        return res.status(201).json({
            success: true,
            user,
        });
    } catch (error) {
        await client.query("ROLLBACK");

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                error:
                    "That phone number or email address is already registered.",
            });
        }

        console.error(
            "POST /api/auth/register/customer failed:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to create the customer account.",
        });
    } finally {
        client.release();
    }
});

// Registers a business owner: the phone is verified with a "register" code first, then the
// account and its pending business are created together and the owner is signed in.

// Registers a business.
//
// Signed out:
// The phone must first be verified with a "register" OTP. A new vendor
// account and its first pending business are then created together.
//
// Signed in (KAN-249):
// A customer or existing vendor can add a business to the same account.
// No second account or registration OTP is required.
router.post("/register/vendor", async (req, res) => {
    const fields = validateVendorRegistration(req.body);

    if (fields.error) {
        return res.status(400).json({
            success: false,
            error: fields.error,
        });
    }

    // KAN-249: add a business to the account that is already signed in.
    if (req.user) {
        if (req.user.user_role === "admin") {
            return res.status(403).json({
                success: false,
                error:
                    "Administrator accounts cannot register a business.",
            });
        }

        if (
            req.user.user_role !== "customer" &&
            req.user.user_role !== "vendor"
        ) {
            return res.status(403).json({
                success: false,
                error:
                    "This account cannot register a business.",
            });
        }

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // Lock and re-read the account so the role cannot change
            // underneath this registration transaction.
            const userResult = await client.query(
                `SELECT
                    user_id,
                    user_name,
                    user_phone,
                    user_email,
                    user_role,
                    user_status
                 FROM users
                 WHERE user_id = $1
                 LIMIT 1
                 FOR UPDATE`,
                [req.user.user_id]
            );

            if (userResult.rowCount === 0) {
                await client.query("ROLLBACK");

                return res.status(401).json({
                    success: false,
                    error: "Authentication required.",
                });
            }

            const currentUser = userResult.rows[0];

            if (currentUser.user_status !== "active") {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    success: false,
                    error: "This account is not available.",
                });
            }

            if (currentUser.user_role === "admin") {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    success: false,
                    error:
                        "Administrator accounts cannot register a business.",
                });
            }

            let user = currentUser;

            // A customer becomes a vendor but keeps the same user_id,
            // session and customer data.
            if (currentUser.user_role === "customer") {
                const upgradedUserResult =
                    await client.query(
                        `UPDATE users
                         SET user_role = 'vendor'
                         WHERE user_id = $1
                         RETURNING
                            user_id,
                            user_name,
                            user_phone,
                            user_email,
                            user_role`,
                        [currentUser.user_id]
                    );

                user = upgradedUserResult.rows[0];
            }

            const vendor = await createVendor(
                client,
                currentUser.user_id,
                fields
            );

            await client.query("COMMIT");

            return res.status(201).json({
                success: true,
                message: registeredMessage(vendor),
                user,
                vendor,
            });
        } catch (error) {
            await client
                .query("ROLLBACK")
                .catch(() => {});

            console.error(
                "POST /api/auth/register/vendor for signed-in account failed:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to register the business.",
            });
        } finally {
            client.release();
        }
    }

    // Existing signed-out registration flow.
    // Keep OTP verification before creating a new account.
    const code =
        typeof req.body?.code === "string"
            ? req.body.code.trim()
            : "";

    if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({
            success: false,
            error:
                "Enter the six-digit verification code.",
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const existing = await client.query(
            `SELECT user_phone
             FROM users
             WHERE user_phone = $1
                OR (
                    $2::text IS NOT NULL
                    AND user_email = $2
                )
             LIMIT 1`,
            [fields.phone, fields.email]
        );

        if (existing.rowCount > 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                error:
                    existing.rows[0].user_phone ===
                    fields.phone
                        ? "That phone number is already registered. Sign in instead."
                        : "That email address is already registered.",
            });
        }

        if (
            !(await useVerificationCode(client, {
                phone: fields.phone,
                purpose: "register",
                code,
            }))
        ) {
            // Commit so a wrong guess still counts towards
            // the attempt limit.
            await client.query("COMMIT");

            return res.status(401).json({
                success: false,
                error:
                    "The verification code is invalid or has expired.",
            });
        }

        const userResult = await client.query(
            `INSERT INTO users (
                user_name,
                user_phone,
                user_email,
                user_role,
                user_phone_verified_at
             )
             VALUES (
                $1,
                $2,
                $3,
                'vendor',
                NOW()
             )
             RETURNING
                user_id,
                user_name,
                user_phone,
                user_email,
                user_role`,
            [
                fields.name,
                fields.phone,
                fields.email,
            ]
        );

        const user = userResult.rows[0];

        const vendor = await createVendor(
            client,
            user.user_id,
            fields
        );

        const sessionToken = await createSession(
            client,
            user.user_id,
            req
        );

        await client.query("COMMIT");

        res.cookie(
            SESSION_COOKIE_NAME,
            sessionToken,
            sessionCookieOptions()
        );

        return res.status(201).json({
            success: true,
            message: registeredMessage(vendor),
            user,
            vendor,
        });
    } catch (error) {
        await client
            .query("ROLLBACK")
            .catch(() => {});

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                error:
                    "That phone number or email address is already registered.",
            });
        }

        console.error(
            "POST /api/auth/register/vendor failed:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to register the business.",
        });
    } finally {
        client.release();
    }
});

router.post(
    "/logout",
    requireAuthenticatedUser,
    async (req, res) => {
        try {
            if (req.session?.session_id) {
                await pool.query(
                    `DELETE FROM sessions
                     WHERE session_id = $1`,
                    [req.session.session_id]
                );
            }

            res.clearCookie(
                SESSION_COOKIE_NAME,
                {
                    httpOnly: true,
                    secure:
                        process.env.NODE_ENV ===
                        "production",
                    sameSite: "lax",
                    path: "/",
                }
            );

            return res.json({
                success: true,
            });
        } catch (error) {
            console.error(
                "POST /api/auth/logout failed:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Unable to log out.",
            });
        }
    }
);
module.exports = router;