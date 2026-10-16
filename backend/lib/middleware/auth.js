const crypto = require("crypto");
const pool = require("../../db");

const SESSION_COOKIE_NAME = "shaheb_session";

function hashSessionToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

function readCookie(req, name) {
    const header = req.headers.cookie;

    if (!header) {
        return null;
    }

    const cookies = header.split(";");

    for (const cookie of cookies) {
        const separator = cookie.indexOf("=");

        if (separator === -1) {
            continue;
        }

        const key = cookie.slice(0, separator).trim();
        const value = cookie.slice(separator + 1).trim();

        if (key === name) {
            try {
                return decodeURIComponent(value);
            } catch {
                return null;
            }
        }
    }

    return null;
}

async function resolveSession(req, res, next) {
    req.user = null;
    req.session = null;

    const token = readCookie(req, SESSION_COOKIE_NAME);

    if (!token) {
        return next();
    }

    try {
        const tokenHash = hashSessionToken(token);

        const result = await pool.query(
            `SELECT
                s.session_id,
                s.session_expires_at,
                u.user_id,
                u.user_name,
                u.user_phone,
                u.user_email,
                u.user_role,
                u.user_status
             FROM sessions s
             JOIN users u ON u.user_id = s.user_id
             WHERE s.session_token_hash = $1
               AND s.session_expires_at > NOW()
               AND u.user_status = 'active'
             LIMIT 1`,
            [tokenHash]
        );

        if (result.rowCount === 0) {
            return next();
        }

        const row = result.rows[0];

        req.session = {
            session_id: row.session_id,
            session_expires_at: row.session_expires_at
        };

        req.user = {
            user_id: row.user_id,
            user_name: row.user_name,
            user_phone: row.user_phone,
            user_email: row.user_email,
            user_role: row.user_role
        };

        return next();
    } catch (error) {
        console.error("Session resolution failed:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to verify the current session"
        });
    }
}

function requireAuthenticatedUser(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: "Authentication required"
        });
    }

    return next();
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: "Authentication required"
            });
        }

        if (!allowedRoles.includes(req.user.user_role)) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to perform this action"
            });
        }

        return next();
    };
}

async function requireVendorOwnership(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: "Authentication required"
        });
    }

    if (req.user.user_role === "admin") {
        return next();
    }

    if (req.user.user_role !== "vendor") {
        return res.status(403).json({
            success: false,
            error: "Vendor access required"
        });
    }

    const rawVendorId =
        req.params.vendorId ??
        req.params.vendor_id;

    const vendorId = Number(rawVendorId);

    if (!Number.isInteger(vendorId) || vendorId <= 0) {
        return res.status(400).json({
            success: false,
            error: "Invalid vendor id"
        });
    }

    try {
        const result = await pool.query(
            `SELECT vendor_id
             FROM vendors
             WHERE vendor_id = $1
               AND user_id = $2
             LIMIT 1`,
            [vendorId, req.user.user_id]
        );

        if (result.rowCount === 0) {
            return res.status(403).json({
                success: false,
                error: "You do not own this business"
            });
        }

        req.vendor = {
            vendor_id: result.rows[0].vendor_id
        };

        return next();
    } catch (error) {
        console.error("Vendor ownership check failed:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to verify business ownership"
        });
    }
}

// Allows admins, or the vendor who owns the business the listing belongs to.
// Sets req.listing and req.vendor for the route.
async function requireListingOwnership(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: "Authentication required"
        });
    }

    if (req.user.user_role !== "admin" && req.user.user_role !== "vendor") {
        return res.status(403).json({
            success: false,
            error: "Vendor access required"
        });
    }

    const raw = String(req.params.listingId ?? "");
    const listingId = /^\d{1,10}$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : 0;

    if (listingId <= 0) {
        return res.status(400).json({
            success: false,
            error: "Invalid listing id"
        });
    }

    try {
        const result = await pool.query(
            `SELECT l.listing_id, l.vendor_id, v.user_id
             FROM vendor_listings l
             JOIN vendors v ON v.vendor_id = l.vendor_id
             WHERE l.listing_id = $1`,
            [listingId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: "Listing not found."
            });
        }

        const row = result.rows[0];

        if (req.user.user_role !== "admin" && row.user_id !== req.user.user_id) {
            return res.status(403).json({
                success: false,
                error: "You do not own this listing"
            });
        }

        req.listing = { listing_id: row.listing_id, vendor_id: row.vendor_id };
        req.vendor = { vendor_id: row.vendor_id };

        return next();
    } catch (error) {
        console.error("Listing ownership check failed:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to verify listing ownership"
        });
    }
}

module.exports = {
    SESSION_COOKIE_NAME,
    hashSessionToken,
    resolveSession,
    requireAuthenticatedUser,
    requireRole,
    requireVendorOwnership,
    requireListingOwnership
};