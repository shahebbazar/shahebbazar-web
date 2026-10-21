// Facebook and WhatsApp posts and marketing results (KAN-287): the owner posts a campaign
// themselves and marks it as posted, with an optional link; the results add up what the business's
// marketing did, on every plan.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { ORIGIN, query, call, startApi, stopApi } = require("./support/harness");
const { validatePostUrl } = require("../services/marketing/posts");
const { buildCampaignEmail } = require("../services/marketing/emailMessage");

const MANGO = 1; // Rajshahi Mango Traders: running pass and three email subscribers (seed)
const OTHER = 6; // owned by "otherVendor": no pass, so the free plan
const path = (vendorId, rest = "") => `/vendors/${vendorId}/marketing${rest}`;

/** Creates a campaign with every [[placeholder]] filled in. */
async function readyCampaign(vendorId, as, title) {
    const listing = (await query(
        "SELECT listing_id FROM vendor_listings WHERE vendor_id = $1 AND listing_status = 'approved' ORDER BY listing_id LIMIT 1", [vendorId]
    ))[0].listing_id;
    const campaign = (await call("POST", path(vendorId, "/campaigns"), {
        as, json: { goal: "new_stock", language: "en", call_to_action: "visit", title, listing_ids: [listing] },
    })).data;
    if (!campaign.placeholders.length) return campaign;
    const fill = (text) => text.replace(/\[\[[^\]]+\]\]/g, "filled in");
    const c = campaign.versions[0].version_content;
    return (await call("PUT", path(vendorId, `/campaigns/${campaign.campaign_id}/content`), {
        as, json: { email: { ...c.email, subject: fill(c.email.subject), body: fill(c.email.body) }, facebook: { ...c.facebook, text: fill(c.facebook.text) }, whatsapp: { ...c.whatsapp, text: fill(c.whatsapp.text) } },
    })).data;
}

const mark = (vendorId, campaignId, channel, url, as = "owner") =>
    call("PUT", path(vendorId, `/campaigns/${campaignId}/posts/${channel}`), { as, json: url === undefined ? {} : { url } });
const results = (vendorId, as = "owner", days) => call("GET", path(vendorId, `/results${days ? `?days=${days}` : ""}`), { as });

before(startApi);
after(stopApi);

describe("links to a post", () => {
    it("accepts Facebook and WhatsApp links, adding https:// if left off, and nothing at all", () => {
        assert.deepEqual(validatePostUrl("facebook", ""), { url: null });
        assert.deepEqual(validatePostUrl("facebook", "  "), { url: null });
        assert.deepEqual(validatePostUrl("facebook", "facebook.com/mango/posts/123"), { url: "https://facebook.com/mango/posts/123" });
        assert.equal(validatePostUrl("facebook", "https://m.facebook.com/story.php?id=1").url, "https://m.facebook.com/story.php?id=1");
        assert.equal(validatePostUrl("facebook", "https://fb.watch/abc/").url, "https://fb.watch/abc/");
        assert.equal(validatePostUrl("whatsapp", "https://whatsapp.com/channel/0029Va").url, "https://whatsapp.com/channel/0029Va");
    });

    it("refuses links to other sites or the wrong channel", () => {
        assert.match(validatePostUrl("facebook", "https://example.com/post").error, /isn't a Facebook link/);
        assert.match(validatePostUrl("facebook", "https://notfacebook.com/x").error, /isn't a Facebook link/);
        assert.match(validatePostUrl("whatsapp", "https://facebook.com/x").error, /isn't a WhatsApp link/);
        assert.match(validatePostUrl("facebook", "javascript:alert(1)").error, /isn't a Facebook link|Enter the link/);
        assert.match(validatePostUrl("facebook", `https://facebook.com/${"x".repeat(600)}`).error, /too long/);
    });
});

describe("marking a campaign as posted", () => {
    let campaign;

    it("isn't allowed while parts are still marked [[like this]]", async () => {
        const listing = (await query("SELECT listing_id FROM vendor_listings WHERE vendor_id = 1 AND listing_status = 'approved' LIMIT 1"))[0].listing_id;
        // An offer without the offer written in has a placeholder.
        const draft = (await call("POST", path(MANGO, "/campaigns"), {
            as: "owner", json: { goal: "offer", language: "en", call_to_action: "visit", listing_ids: [listing] },
        })).data;
        assert.ok(draft.placeholders.length > 0);
        const res = await mark(MANGO, draft.campaign_id, "facebook");
        assert.equal(res.status, 400);
        assert.match(res.data.error, /\[\[like this\]\]/);
        assert.deepEqual(draft.posts, { facebook: null, whatsapp: null });
    });

    it("records the channel, the link and the version posted, without sending or approving anything", async () => {
        campaign = await readyCampaign(MANGO, "owner", "Posted on Facebook");
        const res = await mark(MANGO, campaign.campaign_id, "facebook", "facebook.com/rajshahimango/posts/1");
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.posts.facebook.url, "https://facebook.com/rajshahimango/posts/1");
        assert.equal(res.data.posts.facebook.version_number, campaign.versions[0].version_number);
        assert.ok(res.data.posts.facebook.posted_at);
        assert.equal(res.data.posts.whatsapp, null);
        assert.equal(res.data.status, "draft", "posting isn't sending");

        const audit = await query("SELECT audit_after FROM audit_logs WHERE audit_action = 'campaign.post' AND audit_target_id = $1", [campaign.campaign_id]);
        assert.deepEqual(audit.map((a) => a.audit_after.channel), ["facebook"]);
    });

    it("works without a link, and marking again changes the link", async () => {
        const whatsapp = await mark(MANGO, campaign.campaign_id, "whatsapp");
        assert.equal(whatsapp.status, 200);
        assert.deepEqual([whatsapp.data.posts.whatsapp.url, Boolean(whatsapp.data.posts.whatsapp.posted_at)], [null, true]);

        const again = await mark(MANGO, campaign.campaign_id, "facebook", "https://www.facebook.com/rajshahimango/posts/2");
        assert.equal(again.data.posts.facebook.url, "https://www.facebook.com/rajshahimango/posts/2");
        assert.equal((await query("SELECT COUNT(*)::int AS n FROM marketing_campaign_posts WHERE campaign_id = $1", [campaign.campaign_id]))[0].n, 2);
    });

    it("refuses a link to another site, and an unknown channel", async () => {
        const res = await mark(MANGO, campaign.campaign_id, "facebook", "https://example.com/x");
        assert.equal(res.status, 400);
        assert.match(res.data.errors.url, /isn't a Facebook link/);
        assert.equal((await mark(MANGO, campaign.campaign_id, "instagram")).status, 404);
    });

    it("shows in the campaign list, and a posted campaign is kept: it can't be deleted", async () => {
        const listed = (await call("GET", path(MANGO, "/workspace"), { as: "owner" })).data.campaigns.find((c) => c.campaign_id === campaign.campaign_id);
        assert.deepEqual(listed.posted_on, ["facebook", "whatsapp"]);
        const res = await call("DELETE", path(MANGO, `/campaigns/${campaign.campaign_id}`), { as: "owner" });
        assert.equal(res.status, 409);
        assert.match(res.data.error, /sent or posted/);
    });

    it("can be undone, for a mistake", async () => {
        const res = await call("DELETE", path(MANGO, `/campaigns/${campaign.campaign_id}/posts/whatsapp`), { as: "owner" });
        assert.equal(res.status, 200);
        assert.equal(res.data.posts.whatsapp, null);
        assert.ok(res.data.posts.facebook);
        assert.equal((await query("SELECT COUNT(*)::int AS n FROM audit_logs WHERE audit_action = 'campaign.unpost' AND audit_target_id = $1", [campaign.campaign_id]))[0].n, 1);
    });

    it("can also be marked after the email has gone", async () => {
        const sent = await readyCampaign(MANGO, "owner", "Emailed then posted");
        assert.equal((await call("POST", path(MANGO, `/campaigns/${sent.campaign_id}/send`), { as: "owner" })).status, 200);
        const res = await mark(MANGO, sent.campaign_id, "whatsapp");
        assert.equal(res.status, 200);
        assert.deepEqual([res.data.status, Boolean(res.data.posts.whatsapp)], ["sent", true]);
    });

    it("only the business's owners and managers can mark it", async () => {
        for (const as of ["admin", "customer", "otherVendor"]) assert.equal((await mark(MANGO, campaign.campaign_id, "whatsapp", undefined, as)).status, 403, as);
        assert.equal((await call("PUT", path(MANGO, `/campaigns/${campaign.campaign_id}/posts/whatsapp`), { json: {} })).status, 401);
        assert.equal((await call("DELETE", path(MANGO, `/campaigns/${campaign.campaign_id}/posts/facebook`), { as: "otherVendor" })).status, 403);
    });
});

describe("visits from a campaign's links", () => {
    const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
    // Each visit uses its own browser string, so the 30-minute repeat-visit rule doesn't merge them.
    let n = 0;
    const visit = (body) => fetch(`${ORIGIN}/api/track/view`, {
        method: "POST", headers: { "Content-Type": "text/plain", "User-Agent": `${BROWSER} v${++n}` }, body: JSON.stringify(body),
    });
    const lastView = async () => (await query("SELECT view_source, view_campaign_id FROM vendor_profile_views ORDER BY view_id DESC LIMIT 1"))[0];
    let campaign;

    it("are counted for the campaign and channel", async () => {
        campaign = await readyCampaign(MANGO, "owner", "Visits check");
        await visit({ slug: "rajshahi-mango-traders", source: "email", campaign: campaign.campaign_id });
        assert.deepEqual(await lastView(), { view_source: "email", view_campaign_id: campaign.campaign_id });
        await visit({ slug: "rajshahi-mango-traders", source: "whatsapp", campaign: campaign.campaign_id });
        await visit({ slug: "rajshahi-mango-traders", source: "whatsapp", campaign: campaign.campaign_id });
        const detail = (await call("GET", path(MANGO, `/campaigns/${campaign.campaign_id}`), { as: "owner" })).data;
        assert.deepEqual(detail.visits, { email: 1, facebook: 0, whatsapp: 2 });
    });

    it("ignore another business's campaign, and a campaign on other sources", async () => {
        await visit({ slug: "uttara-light-engineering", source: "email", campaign: campaign.campaign_id });
        assert.deepEqual(await lastView(), { view_source: "email", view_campaign_id: null }, "Mango's campaign isn't counted for another business");
        await visit({ slug: "rajshahi-mango-traders", source: "search", campaign: campaign.campaign_id });
        assert.deepEqual(await lastView(), { view_source: "search", view_campaign_id: null });
        await visit({ slug: "rajshahi-mango-traders", source: "facebook", campaign: "12; DROP TABLE users" });
        assert.deepEqual(await lastView(), { view_source: "facebook", view_campaign_id: null });
    });

    it("show in the results by source, in the total, and against the campaign", async () => {
        const res = (await results(MANGO)).data;
        assert.ok(res.visits_by_source.email.current >= 1);
        assert.ok(res.visits_by_source.whatsapp.current >= 2);
        const sum = Object.values(res.visits_by_source).reduce((s, v) => s + v.current, 0);
        assert.equal(res.marketing_visits.current, sum);
    });

    it("are what the email's links carry: the channel and the campaign", async () => {
        const [row] = await query("SELECT * FROM marketing_campaigns WHERE campaign_id = $1", [campaign.campaign_id]);
        const email = buildCampaignEmail({
            campaign: row, content: campaign.versions[0].version_content, recipient: { user_id: 1, user_name: "Test", address: "t@example.com" },
        });
        const tracked = `/business/rajshahi-mango-traders?from=email&amp;c=${campaign.campaign_id}`;
        assert.ok(email.html.includes(`${tracked}"`), "the View our page button");
        assert.ok(email.html.includes(`${tracked}#services"`), "the product cards");
        assert.match(email.text, new RegExp(`/business/rajshahi-mango-traders\\?from=email&c=${campaign.campaign_id}\\n`), "the page address written in the message");
        assert.doesNotMatch(email.html, /\/business\/rajshahi-mango-traders["#<]/, "no untracked link to the page is left");
    });
});

describe("marketing results", () => {
    it("add up sponsored views, visits from shared links and search appearances against the period before", async () => {
        // The seed has sixty days of analytics, so compare with the figures before these are added.
        const [base, base7] = [(await results(OTHER, "otherVendor")).data, (await results(OTHER, "otherVendor", 7)).data];
        const today = (await query("SELECT COALESCE(SUM(impression_count), 0)::int AS n FROM vendor_search_impressions WHERE vendor_id = $1 AND impression_day = CURRENT_DATE", [OTHER]))[0].n;
        const old = (await query("SELECT COALESCE(SUM(impression_count), 0)::int AS n FROM vendor_search_impressions WHERE vendor_id = $1 AND impression_day = CURRENT_DATE - 35", [OTHER]))[0].n;
        await query(
            `INSERT INTO vendor_profile_views (vendor_id, view_source, view_created_at) VALUES
                 ($1, 'sponsored', now()), ($1, 'sponsored', now()), ($1, 'share', now()),
                 ($1, 'sponsored', now() - INTERVAL '40 days'), ($1, 'search', now())`,
            [OTHER]
        );
        await query(
            `INSERT INTO vendor_search_impressions (vendor_id, impression_day, impression_count) VALUES ($1, CURRENT_DATE, 5), ($1, CURRENT_DATE - 35, 2)
             ON CONFLICT (vendor_id, impression_day) DO UPDATE SET impression_count = EXCLUDED.impression_count`,
            [OTHER]
        );
        const res = await results(OTHER, "otherVendor");
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.days, 30);
        const plus = (figure, current, previous) => ({ current: figure.current + current, previous: figure.previous + previous });
        assert.deepEqual(res.data.sponsored_views, plus(base.sponsored_views, 2, 1));
        assert.deepEqual(res.data.shared_link_views, plus(base.shared_link_views, 1, 0));
        assert.deepEqual(res.data.search_appearances, plus(base.search_appearances, 5 - today, 2 - old));
        assert.deepEqual((await results(OTHER, "otherVendor", 7)).data.sponsored_views, plus(base7.sponsored_views, 2, 0));
        assert.equal((await results(OTHER, "otherVendor", 12)).data.days, 30, "only 7, 30 or 90 days");
    });

    it("count emails sent, new subscribers, unsubscribes and posts, and list the recent campaigns", async () => {
        const res = (await results(MANGO)).data;
        assert.equal(res.email.campaigns_sent, 1);
        assert.equal(res.email.emails_sent, 3);
        assert.equal(res.email.emails_failed, 0);
        assert.ok(res.email.subscribed >= 0 && res.email.unsubscribed >= 1, "the seed has one customer who unsubscribed");
        assert.deepEqual(res.posts, { facebook: 1, whatsapp: 1 });
        assert.deepEqual(res.recent.map((r) => r.campaign_title), ["Emailed then posted", "Posted on Facebook"]);
        assert.deepEqual(res.recent[0].posted_on, ["whatsapp"]);
        assert.equal(res.recent[0].emails_sent, 3);
    });

    it("stay visible after a pass ends", async () => {
        const [pass] = await query("SELECT subscription_id FROM vendor_marketing_subscriptions WHERE vendor_id = $1 AND subscription_status = 'active'", [MANGO]);
        assert.equal((await call("POST", `/admin/marketing/subscriptions/${pass.subscription_id}/end-now`, { as: "admin" })).status, 200);
        const res = await results(MANGO);
        assert.equal(res.status, 200);
        assert.equal(res.data.email.emails_sent, 3);
        assert.equal((await call("GET", path(MANGO, "/workspace"), { as: "owner" })).data.plan, "ended");
    });

    it("are for the business's owners and managers; an admin can look", async () => {
        assert.equal((await results(MANGO, "admin")).status, 200);
        for (const as of ["customer", "otherVendor"]) assert.equal((await results(MANGO, as)).status, 403, as);
        assert.equal((await call("GET", path(MANGO, "/results"))).status, 401);
    });
});
