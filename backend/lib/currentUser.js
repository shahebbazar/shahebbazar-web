// The signed-in user is req.user (set by resolveSession in lib/middleware/auth.js).

// Parses a positive INT id from a route parameter, or returns null.
function parseId(raw) {
    const text = String(raw ?? "");
    return /^\d{1,10}$/.test(text) && Number(text) > 0 && Number(text) <= 2147483647 ? Number(text) : null;
}

// Trims a text field and returns null when it is not a string.
function cleanText(value) {
    return typeof value === "string" ? value.trim() : null;
}

module.exports = { parseId, cleanText };
