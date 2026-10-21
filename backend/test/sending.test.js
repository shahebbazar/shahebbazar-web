// Marketing email sending (KAN-286): an approved campaign goes once to the customers who chose the
// business's email offers, uses one email campaign from the pass or the free plan, and every email
// carries the customer's own one-click unsubscribe link. Emails go to the console adapter here.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { query, call, startApi, stopApi, apiOutput } = require("./support/harness");
const { buildCampaignEmail } = require("../services/marketing/emailMessage");

const MANGO = 1; // Rajshahi Mango Traders: running pass, three email subscribers and one who unsubscribed (seed)
const OTHER = 6; // owned by "otherVendor": no pass, so the free plan
const path = (vendorId, rest = "") => `/vendors/${vendorId}/marketing${rest}`;

/** Creates a campaign, fills any placeholders and approves it. Returns the approved campaign. */
async function approvedCampaign(vendorId, as, title) {
    const listing = (await query(
        "SELECT listing_id FROM vendor_listings WHERE vendor_id = $1 AND listing_status = 'approved' ORDER BY listing_id LIMIT 1", [vendorId]
    ))[0].listing_id;
    let campaign = (await call("POST", path(vendorId, "/campaigns"), {
        as, json: { goal: "new_stock", language: "en", call_to_action: "visit", title, listing_ids: [listing] },
    })).data;
    let latest = campaign.versions[0];
    if (campaign.placeholders.length) {
        const fill = (text) => text.replace(/\[\[[^\]]+\]\]/g, "filled in");
        const c = latest.version_content;
        campaign = (await call("PUT", path(vendorId, `/campaigns/${campaign.campaign_id}/content`), {
            as, json: { email: { ...c.email, subject: fill(c.email.subject), body: fill(c.email.body) }, facebook: { ...c.facebook, text: fill(c.facebook.text) }, whatsapp: { ...c.whatsapp, text: fill(c.whatsapp.text) } },
        })).data;
        latest = campaign.versions[0];
    }
    const approved = await call("POST", path(vendorId, `/campaigns/${campaign.campaign_id}/approve`), { as, json: { version_id: latest.version_id } });
    assert.equal(approved.status, 200, JSON.stringify(approved.data));
    return approved.data;
}

const send = (vendorId, campaignId, as = "owner") => call("POST", path(vendorId, `/campaigns/${campaignId}/send`), { as });
const emailsUsed = async (vendorId) => (await query(
    "SELECT COALESCE(SUM(usage_quantity), 0)::int AS n FROM marketing_usage_events WHERE vendor_id = $1 AND usage_type = 'email_campaign'", [vendorId]
))[0].n;

before(startApi);
after(stopApi);

describe("sending a campaign by email", () => {
    let campaign;
    let output;

    const listingId = async () => (await query("SELECT listing_id FROM vendor_listings WHERE vendor_id = 1 AND listing_status = 'approved' LIMIT 1"))[0].listing_id;

    it("a campaign with parts still marked [[like this]] can't be sent", async () => {
        // An offer without the offer written in has a placeholder.
        const draft = (await call("POST", path(MANGO, "/campaigns"), {
            as: "owner", json: { goal: "offer", language: "en", call_to_action: "visit", listing_ids: [await listingId()] },
        })).data;
        assert.ok(draft.placeholders.length > 0);
        const res = await send(MANGO, draft.campaign_id);
        assert.equal(res.status, 409);
        assert.equal(res.data.code, "placeholders");
        assert.equal((await query("SELECT campaign_status FROM marketing_campaigns WHERE campaign_id = $1", [draft.campaign_id]))[0].campaign_status, "draft");
    });

    it("a draft is sent without a separate approval step; the version sent is recorded as approved by the sender", async () => {
        const draft = (await call("POST", path(MANGO, "/campaigns"), {
            as: "owner", json: { goal: "new_stock", language: "en", call_to_action: "visit", title: "Straight from a draft", listing_ids: [await listingId()] },
        })).data;
        assert.deepEqual([draft.status, draft.send.can_send], ["draft", true]);
        const res = await send(MANGO, draft.campaign_id);
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.campaign.status, "sent");
        assert.equal(res.data.campaign.approved_version_id, draft.versions[0].version_id);
        const [row] = await query(
            `SELECT c.campaign_approved_at IS NOT NULL AS approved, u.user_phone FROM marketing_campaigns c
             JOIN users u ON u.user_id = c.campaign_approved_by WHERE c.campaign_id = $1`, [draft.campaign_id]
        );
        assert.deepEqual(row, { approved: true, user_phone: "+8801711000005" });
    });

    it("before sending, the editor is told who it goes to and that the pass covers it", async () => {
        campaign = await approvedCampaign(MANGO, "owner", "Mango season");
        assert.deepEqual(campaign.send, { audience: 3, plan: "active", left_after: campaign.send.left_after, can_send: true, reason: null });
        assert.equal((await call("GET", path(MANGO, "/workspace"), { as: "owner" })).data.email_subscribers, 3);
    });

    it("goes once to each customer who chose email offers, uses one email campaign, and is recorded", async () => {
        const usedBefore = await emailsUsed(MANGO);
        const from = apiOutput().length;
        const res = await send(MANGO, campaign.campaign_id);
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.deepEqual([res.data.sent, res.data.failed], [3, 0]);
        assert.equal(res.data.campaign.status, "sent");
        assert.deepEqual(res.data.campaign.send.results, { sent: 3, failed: 0 });
        assert.ok(res.data.campaign.send.sent_at);

        const rows = await query("SELECT send_address, send_status, send_provider, send_provider_message_id FROM marketing_sends WHERE campaign_id = $1 ORDER BY send_address", [campaign.campaign_id]);
        assert.deepEqual(rows.map((r) => r.send_address), ["rumana.akter@example.com", "sajid.rahman@example.com", "tania.sultana@example.com"], "not the customer who unsubscribed");
        assert.ok(rows.every((r) => r.send_status === "sent" && r.send_provider === "console" && r.send_provider_message_id));

        assert.equal(await emailsUsed(MANGO), usedBefore + 1, "one campaign, not one per email");
        const audit = await query("SELECT audit_after FROM audit_logs WHERE audit_action = 'campaign.send' AND audit_target_id = $1", [campaign.campaign_id]);
        assert.equal(audit.length, 1);
        assert.deepEqual([audit[0].audit_after.sent, audit[0].audit_after.provider], [3, "console"]);

        output = apiOutput().slice(from);
        assert.match(output, /\[mock email\] from: Rajshahi Mango Traders via Shaheb Bazar <offers@shahebbazar\.com>/);
        assert.equal(output.match(/\[mock email\] to: /g).length, 3);
    });

    it("can't be sent twice, edited or deleted once sent", async () => {
        assert.match((await send(MANGO, campaign.campaign_id)).data.error, /already been sent/);
        const c = campaign.versions[0].version_content;
        assert.equal((await call("PUT", path(MANGO, `/campaigns/${campaign.campaign_id}/content`), { as: "owner", json: c })).status, 409);
        assert.equal((await call("DELETE", path(MANGO, `/campaigns/${campaign.campaign_id}`), { as: "owner" })).status, 409);
        assert.equal((await query("SELECT COUNT(*)::int AS n FROM marketing_sends WHERE campaign_id = $1", [campaign.campaign_id]))[0].n, 3);
    });

    it("each email's unsubscribe link stops that customer's email offers from this business", async () => {
        const token = output.match(/\[mock email\] unsubscribe: \S+\/unsubscribe\/(\S+)/)[1];
        const res = await call("POST", `/unsubscribe/${token}`);
        assert.equal(res.status, 200);
        assert.equal(res.data.subscribed, false);
        assert.equal((await call("GET", path(MANGO, "/workspace"), { as: "owner" })).data.email_subscribers, 2);
    });

    it("only the business's owners and managers can send", async () => {
        const other = await approvedCampaign(MANGO, "owner", "Not sent");
        for (const as of ["admin", "customer", "otherVendor"]) assert.equal((await send(MANGO, other.campaign_id, as)).status, 403, as);
        assert.equal((await call("POST", path(MANGO, `/campaigns/${other.campaign_id}/send`))).status, 401);
    });
});

describe("the free plan", () => {
    it("a business with no one to send to is told so, and uses nothing", async () => {
        const campaign = await approvedCampaign(OTHER, "otherVendor", "Nobody yet");
        assert.equal(campaign.send.can_send, false);
        assert.match(campaign.send.reason, /No customers have chosen/);
        const res = await send(OTHER, campaign.campaign_id, "otherVendor");
        assert.equal(res.status, 409);
        assert.equal(res.data.code, "no_audience");
        assert.equal(await emailsUsed(OTHER), 0);
    });

    it("a business without a pass sends one free email a month; the admin setting changes how many", async () => {
        await query(
            `INSERT INTO marketing_consents (user_id, vendor_id, consent_channel, consent_source)
             SELECT user_id, $1, 'email', 'save_prompt' FROM users WHERE user_phone = '+8801722000001'`, [OTHER]
        );
        const first = await approvedCampaign(OTHER, "otherVendor", "Free one");
        assert.deepEqual([first.send.can_send, first.send.plan, first.send.left_after], [true, "free", 0]);
        assert.equal((await send(OTHER, first.campaign_id, "otherVendor")).status, 200);
        const usage = await query("SELECT subscription_id, usage_is_free FROM marketing_usage_events WHERE vendor_id = $1", [OTHER]);
        assert.deepEqual(usage, [{ subscription_id: null, usage_is_free: true }]);
        assert.deepEqual((await call("GET", path(OTHER, "/workspace"), { as: "otherVendor" })).data.free_emails, { limit: 1, used: 1, left: 0 });

        const second = await approvedCampaign(OTHER, "otherVendor", "Second");
        assert.equal(second.send.can_send, false);
        assert.match(second.send.reason, /free plan's email for \w+ is used/);
        const refused = await send(OTHER, second.campaign_id, "otherVendor");
        assert.equal(refused.status, 409);
        assert.equal(refused.data.code, "allowance");

        const setting = (value) => call("PUT", "/admin/settings/free_marketing_emails_per_month", { as: "admin", json: { value } });
        assert.equal((await setting(-1)).status, 400);
        assert.equal((await setting(2.5)).status, 400);
        assert.equal((await setting("2")).status, 400);
        const changed = await setting(2);
        assert.equal(changed.status, 200);
        assert.deepEqual([changed.data.setting.value, changed.data.setting.type, changed.data.setting.group], [2, "integer", "marketing"]);
        assert.equal((await send(OTHER, second.campaign_id, "otherVendor")).status, 200, "allowed once the admin raised it");
        assert.equal((await setting(1)).status, 200);
    });
});

describe("the email itself", () => {
    const campaign = {
        vendor_id: 1,
        campaign_language: "en",
        campaign_source_snapshot: {
            business: { name: "Rajshahi Mango Traders", name_bn: "রাজশাহী আম ব্যবসায়ী" },
            listings: [{ photo_url: "uploads/mango.jpg" }, { photo_url: null }],
        },
    };
    const recipient = { user_id: 42, user_name: "Rumana", address: "rumana@example.com" };
    const content = (over = {}) => ({ email: { subject: "Fresh <mangoes>", body: "Hello & welcome\n\nSee https://example.com/x.", photos: true, ...over } });

    it("comes from the business via Shaheb Bazar, replies to the business, and has one-click unsubscribe", () => {
        const email = buildCampaignEmail({ campaign, content: content(), recipient, replyTo: "shop@example.com" });
        assert.deepEqual(email.from, { name: "Rajshahi Mango Traders via Shaheb Bazar", address: "offers@shahebbazar.com" });
        assert.equal(email.replyTo, "shop@example.com");
        assert.match(email.html, /<strong>Rajshahi Mango Traders<\/strong> <span[^>]*>via Shaheb Bazar<\/span>/, "shown at the top of the email too");
        assert.match(email.headers["List-Unsubscribe"], /^<https?:\/\/[^>]+\/api\/unsubscribe\/42\.1\.email\.[\w-]{32}>$/);
        assert.equal(email.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
        assert.match(email.text, /Unsubscribe: \S+\/unsubscribe\/42\.1\.email\./);
        assert.match(email.html, /<a href="[^"]+\/unsubscribe\/42\.1\.email\.[^"]+"[^>]*>Unsubscribe<\/a>/);
    });

    it("escapes the wording, links web addresses, and shows photos only when kept", () => {
        const email = buildCampaignEmail({ campaign, content: content(), recipient });
        assert.match(email.html, /Hello &amp; welcome/);
        assert.match(email.html, /<a href="https:\/\/example\.com\/x"/);
        assert.equal((email.html.match(/<img /g) || []).length, 1, "the product without a photo adds none");
        assert.match(email.html, /src="https?:\/\/[^"]+\/uploads\/mango\.jpg"/);
        assert.equal(email.subject, "Fresh <mangoes>", "the subject is plain text");
        const without = buildCampaignEmail({ campaign, content: content({ photos: false }), recipient });
        assert.doesNotMatch(without.html, /<img /);
    });

    it("writes the footer in Bangla for a Bangla campaign", () => {
        const email = buildCampaignEmail({ campaign: { ...campaign, campaign_language: "bn" }, content: content(), recipient });
        assert.equal(email.from.name, "রাজশাহী আম ব্যবসায়ী via Shaheb Bazar");
        assert.match(email.text, /আর অফার চাই না: /);
    });
});
