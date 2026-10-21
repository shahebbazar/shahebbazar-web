// The public site's address, for links the API writes (unsubscribe links, campaign text).

/** e.g. "https://shahebbazar.com", without a trailing slash. */
function siteUrl() {
    const site = process.env.PUBLIC_SITE_URL || (process.env.CORS_ORIGIN || "http://localhost:3000").split(",")[0];
    return site.trim().replace(/\/$/, "");
}

module.exports = { siteUrl };
