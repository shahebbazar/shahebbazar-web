// The public site's address, for links the API writes (unsubscribe links, campaign text).
/** e.g. "https://shahebbazar.com", without a trailing slash. */
function siteUrl() {
    const site = process.env.PUBLIC_SITE_URL || (process.env.CORS_ORIGIN || "http://localhost:3000").split(",")[0];
    return site.trim().replace(/\/$/, "");
}

/** The API's public address, for links in emails (one-click unsubscribe). e.g. "https://api.shahebbazar.com". */
function apiUrl() {
    const api = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`;
    return api.trim().replace(/\/$/, "");
}

/** A full address for a stored upload path such as "uploads/x.jpg", for images in emails. */
function assetUrl(storedPath) {
    if (!storedPath) return null;
    if (/^https?:\/\//i.test(storedPath)) return storedPath;
    return `${apiUrl()}/${String(storedPath).replace(/^\/+/, "").replace(/\\/g, "/")}`;
}

module.exports = { siteUrl, apiUrl, assetUrl };
