// Facebook and WhatsApp posts (KAN-287): Shaheb Bazar isn't connected to either, so the owner posts
// the campaign's text themselves and marks it as posted, with a link to the post if they have one.
// Routes are in routes/campaigns.js.

const POST_CHANNELS = ["facebook", "whatsapp"];
const URL_MAX = 500;

// Where a link to a post can point: Facebook's own sites, or WhatsApp's (a channel or a wa.me link).
const HOSTS = {
    facebook: ["facebook.com", "fb.com", "fb.watch"],
    whatsapp: ["whatsapp.com", "wa.me"],
};
const NAMES = { facebook: "Facebook", whatsapp: "WhatsApp" };

/** Checks the optional link to a post. Returns { url } (null when left empty) or { error }. */
function validatePostUrl(channel, value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return { url: null };
    if (text.length > URL_MAX) return { error: `The link is too long (${URL_MAX} characters at most).` };
    let url;
    try {
        url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
        return { error: "Enter the link to your post, or leave it empty." };
    }
    const host = url.hostname.toLowerCase();
    const allowed = HOSTS[channel].some((h) => host === h || host.endsWith(`.${h}`));
    if (!["http:", "https:"].includes(url.protocol) || !allowed) {
        return { error: `That isn't a ${NAMES[channel]} link. Paste the link to your post, or leave it empty.` };
    }
    return { url: url.toString() };
}

/** A campaign's posts by channel: { facebook, whatsapp }, each null until marked as posted. */
async function postsOf(db, campaignId) {
    const rows = (await db.query(
        `SELECT p.post_channel, p.post_url, p.post_marked_at, u.user_name AS marked_by, v.version_number
         FROM marketing_campaign_posts p
         LEFT JOIN users u ON u.user_id = p.post_marked_by
         LEFT JOIN marketing_campaign_versions v ON v.version_id = p.post_version_id
         WHERE p.campaign_id = $1`,
        [campaignId]
    )).rows;
    const posts = { facebook: null, whatsapp: null };
    for (const r of rows) {
        posts[r.post_channel] = { url: r.post_url, posted_at: r.post_marked_at, marked_by: r.marked_by, version_number: r.version_number };
    }
    return posts;
}

module.exports = { POST_CHANNELS, validatePostUrl, postsOf };
