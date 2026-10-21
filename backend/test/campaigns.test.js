// Marketing workspace (KAN-285): campaign briefs, template drafts, versions and approval.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { query, call, startApi, stopApi, userIdOf } = require("./support/harness");
const { couponOf } = require("../services/marketing/campaigns");

const MANGO = 1; // Rajshahi Mango Traders, owned by "owner", with a running pass (seed)
const OTHER = 6; // owned by "otherVendor"
const base = `/vendors/${MANGO}/marketing`;

let khirsapat, fazli, otherListing, pendingListing;

const create = (brief, as = "owner", vendorId = MANGO) =>
    call("POST", `/vendors/${vendorId}/marketing/campaigns`, { as, json: brief });
const brief = (over = {}) => ({ goal: "new_stock", language: "en", call_to_action: "visit", listing_ids: [khirsapat, fazli], ...over });
const edit = (id, content, as = "owner") => call("PUT", `${base}/campaigns/${id}/content`, { as, json: content });
const approve = (id, versionId, as = "owner") => call("POST", `${base}/campaigns/${id}/approve`, { as, json: { version_id: versionId } });
const latest = (campaign) => campaign.versions[0];

before(async () => {
    await startApi();
    const id = async (slug) => (await query("SELECT listing_id FROM vendor_listings WHERE listing_slug = $1", [slug]))[0].listing_id;
    khirsapat = await id("khirsapat-mango");
    fazli = await id("fazli-mango-wholesale");
    otherListing = (await query("SELECT listing_id FROM vendor_listings WHERE vendor_id <> $1 AND listing_status = 'approved' LIMIT 1", [MANGO]))[0].listing_id;
    pendingListing = (await query(
        `INSERT INTO vendor_listings (vendor_id, category_id, listing_title, listing_slug, listing_status)
         VALUES ($1, (SELECT min(category_id) FROM categories), 'Pending Mango', 'pending-mango-test', 'pending') RETURNING listing_id`,
        [MANGO]
    ))[0].listing_id;
});
after(stopApi);

describe("workspace", () => {
    it("shows the pass, readiness, approved products only, and no campaigns yet", async () => {
        const res = await call("GET", `${base}/workspace`, { as: "owner" });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.pass.status, "active");
        assert.equal(res.data.can_create, true);
        assert.ok(res.data.readiness.checks.some((c) => c.key === "listings" && c.done));
        const ids = res.data.listings.map((l) => l.listing_id);
        assert.ok(ids.includes(khirsapat) && ids.includes(fazli));
        assert.ok(!ids.includes(pendingListing), "pending listings can't be promoted");
        assert.deepEqual(res.data.campaigns, []);
    });

    it("a business without a pass is on the free plan and can still write campaigns", async () => {
        await query("DELETE FROM vendor_marketing_subscriptions WHERE vendor_id = $1", [OTHER]);
        const res = await call("GET", `/vendors/${OTHER}/marketing/workspace`, { as: "otherVendor" });
        assert.equal(res.status, 200);
        assert.equal(res.data.pass, null);
        assert.equal(res.data.plan, "free");
        assert.equal(res.data.free_emails_per_month, 1);
        assert.equal(res.data.can_create, true);
        const listing = (await query("SELECT listing_id FROM vendor_listings WHERE vendor_id = $1 AND listing_status = 'approved' LIMIT 1", [OTHER]))[0];
        const made = await create({ ...brief(), listing_ids: [listing.listing_id] }, "otherVendor", OTHER);
        assert.equal(made.status, 201, JSON.stringify(made.data));
    });

    it("an admin's suspension stops drafting, and says why", async () => {
        await query(
            `INSERT INTO vendor_marketing_subscriptions (vendor_id, package_id, subscription_status, subscription_starts_at,
                 subscription_ends_at, subscription_price_bdt)
             VALUES ($1, (SELECT min(package_id) FROM marketing_packages), 'suspended', now() - INTERVAL '1 day', now() + INTERVAL '6 days', 299)`,
            [OTHER]
        );
        const res = await call("GET", `/vendors/${OTHER}/marketing/workspace`, { as: "otherVendor" });
        assert.equal(res.data.plan, "suspended");
        assert.equal(res.data.can_create, false);
        assert.match(res.data.cannot_create_reason, /suspended/);
        const listing = (await query("SELECT listing_id FROM vendor_listings WHERE vendor_id = $1 AND listing_status = 'approved' LIMIT 1", [OTHER]))[0];
        const made = await create({ ...brief(), listing_ids: [listing.listing_id] }, "otherVendor", OTHER);
        assert.equal(made.status, 403);
        assert.match(made.data.error, /suspended/);
    });

    it("a business whose pass ended is on the ended plan and can still write campaigns", async () => {
        await query("UPDATE vendor_marketing_subscriptions SET subscription_status = 'active', subscription_ends_at = now() - INTERVAL '1 hour' WHERE vendor_id = $1", [OTHER]);
        const res = await call("GET", `/vendors/${OTHER}/marketing/workspace`, { as: "otherVendor" });
        assert.deepEqual([res.data.plan, res.data.ended_emails_per_week, res.data.can_create], ["ended", 1, true]);
    });
});

describe("creating a campaign writes drafts from saved facts only", () => {
    let campaign;

    it("creates version 1 from the templates, with a sensible default name", async () => {
        const res = await create(brief());
        assert.equal(res.status, 201, JSON.stringify(res.data));
        campaign = res.data;
        assert.equal(campaign.title, "New stock: Khirsapat Mango (Himsagar)");
        assert.equal(campaign.status, "draft");
        assert.equal(campaign.versions.length, 1);
        assert.equal(latest(campaign).version_method, "template");
    });

    it("the drafts name the business and products, with real prices and the business page", async () => {
        const { email, facebook, whatsapp } = latest(campaign).version_content;
        assert.equal(email.subject, "Just in at Rajshahi Mango Traders: Khirsapat Mango (Himsagar) and more");
        assert.match(email.body, /Khirsapat Mango \(Himsagar\): ৳2,800–৳4,200 per maund/);
        assert.match(email.body, /Fazli Mango Wholesale/);
        assert.match(email.body, /\/business\/rajshahi-mango-traders/);
        assert.match(facebook.text, /#Rajshahi #ShahebBazar/);
        assert.match(whatsapp.text, /^\*Just in at Rajshahi Mango Traders!\*/);
        assert.deepEqual(campaign.placeholders, []);
    });

    it("each goal writes a different message", async () => {
        const drafts = {};
        for (const goal of ["new_stock", "offer", "event", "reminder"]) {
            const res = await create(brief({ goal, listing_ids: [khirsapat], offer: goal === "reminder" ? null : "our Eid mango fair",
                starts_on: "2026-11-01", ends_on: "2026-11-03" }));
            assert.equal(res.status, 201, JSON.stringify(res.data));
            drafts[goal] = latest(res.data).version_content.email;
        }
        assert.equal(new Set(Object.values(drafts).map((d) => d.subject)).size, 4, "four different subjects");
        assert.match(drafts.new_stock.body, /Here's what's new:/);
        assert.match(drafts.new_stock.body, /\n\nour Eid mango fair\n/, "the owner's own words, with nothing put in front");
        assert.match(drafts.offer.body, /Good news from Rajshahi Mango Traders: our Eid mango fair[\s\S]*Offer runs 1 November to 3 November\./);
        assert.match(drafts.event.body, /invites you to our Eid mango fair\.\n\nWhen: 1 November to 3 November\nWhere: Shaheb Bazar Road, Rajshahi/);
        assert.ok(!/Visit us at/.test(drafts.event.body), "an event doesn't repeat the address");
        assert.match(drafts.reminder.body, /Customer favourites:/);
    });

    it("an event without details or a date is marked for the owner to fill in", async () => {
        const res = await create(brief({ goal: "event", listing_ids: [khirsapat] }));
        assert.equal(res.data.placeholders.length, 2);
        assert.ok(res.data.placeholders.some((p) => /Add the date/.test(p)));
        assert.ok(res.data.placeholders.some((p) => /Say what the event is/.test(p)));
    });

    it("never invents a price: a product without one gets none, and a warning", async () => {
        await query("UPDATE vendor_listings SET listing_price = NULL, listing_price_max = NULL WHERE listing_id = $1", [fazli]);
        try {
            const res = await create(brief({ listing_ids: [fazli] }));
            const body = latest(res.data).version_content.email.body;
            assert.match(body, /• Fazli Mango Wholesale\n/);
            assert.ok(!/Fazli Mango Wholesale: ৳/.test(body));
            assert.ok(res.data.warnings.some((w) => /Fazli Mango Wholesale has no price/.test(w)));
        } finally {
            await query("UPDATE vendor_listings SET listing_price = 1600, listing_price_max = NULL WHERE listing_id = $1", [fazli]);
        }
    });

    it("writes Bangla drafts with the business's Bangla name and Bangla digits", async () => {
        const res = await create(brief({ language: "bn", listing_ids: [khirsapat] }));
        const { email } = latest(res.data).version_content;
        assert.match(email.subject, /রাজশাহী আম ব্যবসায়ী/);
        assert.match(email.body, /খিরসাপাত আম: ৳২,৮০০–৳৪,২০০ \(প্রতি maund\)/);
        assert.match(email.body, /আমাদের দোকানে আসুন: Shaheb Bazar Road, Rajshahi।/, "the area is not repeated in Bangla");
    });

    it("keeps the facts as they were when the campaign was made", async () => {
        await query("UPDATE vendor_listings SET listing_price = 9999, listing_price_max = 12000 WHERE listing_id = $1", [khirsapat]);
        try {
            const res = await call("GET", `${base}/campaigns/${campaign.campaign_id}`, { as: "owner" });
            assert.equal(res.data.snapshot.listings[0].price, 2800);
            assert.match(latest(res.data).version_content.email.body, /৳2,800/);
        } finally {
            await query("UPDATE vendor_listings SET listing_price = 2800, listing_price_max = 4200 WHERE listing_id = $1", [khirsapat]);
        }
    });
});

describe("the brief is checked", () => {
    it("refuses bad goals, languages, actions, dates and product choices", async () => {
        for (const [over, field] of [
            [{ goal: "sale" }, "goal"],
            [{ language: "fr" }, "language"],
            [{ call_to_action: "email" }, "call_to_action"],
            [{ listing_ids: [] }, "listing_ids"],
            [{ listing_ids: [khirsapat, fazli, khirsapat] }, "listing_ids"],
            [{ listing_ids: [1, 2, 3, 4] }, "listing_ids"],
            [{ starts_on: "2026-11-10", ends_on: "2026-11-01" }, "ends_on"],
            [{ starts_on: "next week" }, "starts_on"],
            [{ offer: "x".repeat(201) }, "offer"],
        ]) {
            const res = await create(brief(over));
            assert.equal(res.status, 400, JSON.stringify(over));
            assert.ok(res.data.errors[field], `${field} error for ${JSON.stringify(over)}`);
        }
    });

    it("only this business's approved products can be promoted", async () => {
        for (const ids of [[otherListing], [pendingListing], [999999]]) {
            const res = await create(brief({ listing_ids: ids }));
            assert.equal(res.status, 400, JSON.stringify(ids));
        }
    });
});

describe("editing and approving", () => {
    let campaign;

    it("an offer with no offer text is marked [[like this]], and can't be approved yet", async () => {
        const res = await create(brief({ goal: "offer", listing_ids: [khirsapat] }));
        campaign = res.data;
        assert.equal(campaign.placeholders.length, 1);
        assert.match(campaign.placeholders[0], /Describe your offer/);
        const refused = await approve(campaign.campaign_id, latest(campaign).version_id);
        assert.equal(refused.status, 400);
        assert.deepEqual(refused.data.placeholders, campaign.placeholders);
    });

    it("saving edits makes a new version and keeps the old one", async () => {
        const content = latest(campaign).version_content;
        const fill = (t) => t.replace(/\[\[[^\]]+\]\]/g, "10% off Khirsapat this week");
        const res = await edit(campaign.campaign_id, {
            email: { subject: fill(content.email.subject), body: fill(content.email.body) },
            facebook: { text: fill(content.facebook.text) },
            whatsapp: { text: fill(content.whatsapp.text) },
        });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        campaign = res.data;
        assert.deepEqual(campaign.versions.map((v) => [v.version_number, v.version_method]), [[2, "manual"], [1, "template"]]);
        assert.deepEqual(campaign.placeholders, []);
        assert.match(campaign.versions[1].version_content.email.subject, /\[\[/, "version 1 is unchanged");
    });

    it("only the latest version can be approved", async () => {
        const res = await approve(campaign.campaign_id, campaign.versions[1].version_id);
        assert.equal(res.status, 409);
    });

    it("approving locks the latest version and records who approved it", async () => {
        const res = await approve(campaign.campaign_id, latest(campaign).version_id);
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.status, "approved");
        assert.equal(res.data.approved_version_id, latest(campaign).version_id);
        const [audit] = await query("SELECT audit_actor_user_id, audit_after FROM audit_logs WHERE audit_action = 'campaign.approve' ORDER BY audit_id DESC LIMIT 1");
        assert.equal(audit.audit_actor_user_id, await userIdOf("owner"));
        assert.equal(audit.audit_after.version, 2);
        assert.equal((await approve(campaign.campaign_id, latest(campaign).version_id)).status, 409, "already approved");
        campaign = res.data;
    });

    it("editing an approved campaign makes version 3 and needs approving again; version 2 stays as approved", async () => {
        const c = latest(campaign).version_content;
        const res = await edit(campaign.campaign_id, { ...c, email: { ...c.email, subject: `${c.email.subject} (this week only)` } });
        assert.equal(res.data.status, "draft");
        assert.equal(latest(res.data).version_number, 3);
        assert.equal(res.data.approved_version_id, campaign.approved_version_id);
        const [v2] = await query("SELECT version_content FROM marketing_campaign_versions WHERE version_id = $1", [campaign.approved_version_id]);
        assert.ok(!v2.version_content.email.subject.includes("this week only"));
    });

    it("refuses empty or overlong wording", async () => {
        const c = latest(campaign).version_content;
        assert.equal((await edit(campaign.campaign_id, { ...c, email: { ...c.email, subject: "  " } })).status, 400);
        assert.equal((await edit(campaign.campaign_id, { ...c, whatsapp: { text: "x".repeat(1001) } })).status, 400);
        assert.equal((await edit(campaign.campaign_id, {})).status, 400);
    });
});

describe("photos in each channel", () => {
    it("drafts include photos everywhere; the owner can leave them out of one channel, which saves as a new version", async () => {
        const campaign = (await create(brief({ listing_ids: [fazli] }))).data;
        const c = latest(campaign).version_content;
        assert.deepEqual([c.email.photos, c.facebook.photos, c.whatsapp.photos], [true, true, true]);
        const saved = await edit(campaign.campaign_id, { ...c, whatsapp: { ...c.whatsapp, photos: false } });
        assert.equal(saved.status, 200, JSON.stringify(saved.data));
        const v2 = latest(saved.data);
        assert.equal(v2.version_number, 2);
        assert.deepEqual([v2.version_content.email.photos, v2.version_content.facebook.photos, v2.version_content.whatsapp.photos], [true, true, false]);
        // Anything other than false keeps photos on.
        const v3 = latest((await edit(campaign.campaign_id, { ...c, email: { subject: c.email.subject, body: c.email.body } })).data);
        assert.equal(v3.version_content.email.photos, true);
    });
});

describe("coupon codes for offers", () => {
    const LAST_DAY = "2099-12-31";

    it("an offer can carry a coupon code, tidied to capitals, valid until the offer's last day, which every draft mentions", async () => {
        const res = await create(brief({ goal: "offer", offer: "10% off Khirsapat", coupon_code: " mango10 ", ends_on: LAST_DAY, listing_ids: [khirsapat] }));
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.deepEqual(res.data.coupon, { code: "MANGO10", starts_on: null, ends_on: LAST_DAY, status: "active" });
        const c = latest(res.data).version_content;
        for (const text of [c.email.body, c.facebook.text, c.whatsapp.text]) {
            assert.match(text, /Use code MANGO10 when you visit or order, until 31 December./);
        }
        const listed = (await call("GET", `${base}/workspace`, { as: "owner" })).data.campaigns.find((x) => x.campaign_id === res.data.campaign_id);
        assert.equal(listed.coupon.status, "active");
    });

    it("refuses a bad code, a code on a goal other than offer, and a coupon with no last day or one already passed", async () => {
        assert.equal((await create(brief({ goal: "offer", offer: "x", coupon_code: "no spaces!", ends_on: LAST_DAY }))).status, 400);
        assert.equal((await create(brief({ goal: "new_stock", coupon_code: "MANGO11", ends_on: LAST_DAY }))).data.errors.coupon_code, "A coupon code is only for offers.");
        assert.match((await create(brief({ goal: "offer", offer: "x", coupon_code: "MANGO12" }))).data.errors.ends_on, /needs a last day/);
        assert.match((await create(brief({ goal: "offer", offer: "x", coupon_code: "MANGO13", ends_on: "2020-01-31" }))).data.errors.ends_on, /has passed/);
    });

    it("the same code can be used again on a later offer", async () => {
        const again = await create(brief({ goal: "offer", offer: "Next month", coupon_code: "MANGO10", ends_on: LAST_DAY }));
        assert.equal(again.status, 201, JSON.stringify(again.data));
    });

    it("a coupon is upcoming before the start day and expired after the last day", async () => {
        const res = await create(brief({ goal: "offer", offer: "x", coupon_code: "LATER", starts_on: "2099-12-01", ends_on: LAST_DAY }));
        assert.equal(res.data.coupon.status, "upcoming");
        await query("UPDATE marketing_campaigns SET campaign_starts_on = NULL, campaign_ends_on = current_date - 2 WHERE campaign_id = $1", [res.data.campaign_id]);
        const after = await call("GET", `${base}/campaigns/${res.data.campaign_id}`, { as: "owner" });
        assert.equal(after.data.coupon.status, "expired");
    });

    it("works out the status from the day in Bangladesh", () => {
        const row = { campaign_coupon_code: "X10", campaign_starts_on: "2026-11-01", campaign_ends_on: "2026-11-07" };
        assert.equal(couponOf(row, "2026-10-31").status, "upcoming");
        assert.equal(couponOf(row, "2026-11-01").status, "active");
        assert.equal(couponOf(row, "2026-11-07").status, "active", "the last day still counts");
        assert.equal(couponOf(row, "2026-11-08").status, "expired");
        assert.equal(couponOf({ campaign_coupon_code: null }), null);
    });

    it("a campaign without a coupon has none", async () => {
        assert.equal((await create(brief({ listing_ids: [fazli] }))).data.coupon, null);
    });
});

describe("deleting, sent campaigns and access", () => {
    it("a draft can be deleted; a sent campaign is kept and can't be edited", async () => {
        const made = (await create(brief({ listing_ids: [fazli] }))).data;
        assert.equal((await call("DELETE", `${base}/campaigns/${made.campaign_id}`, { as: "owner" })).status, 204);
        assert.equal((await call("GET", `${base}/campaigns/${made.campaign_id}`, { as: "owner" })).status, 404);

        const sent = (await create(brief({ listing_ids: [fazli] }))).data;
        await query("UPDATE marketing_campaigns SET campaign_status = 'sent' WHERE campaign_id = $1", [sent.campaign_id]);
        assert.equal((await call("DELETE", `${base}/campaigns/${sent.campaign_id}`, { as: "owner" })).status, 409);
        assert.equal((await edit(sent.campaign_id, latest(sent).version_content)).status, 409);
    });

    it("an admin can look but not change; other people can't see it at all", async () => {
        const [campaign] = await query("SELECT campaign_id FROM marketing_campaigns WHERE vendor_id = $1 LIMIT 1", [MANGO]);
        const path = `${base}/campaigns/${campaign.campaign_id}`;
        assert.equal((await call("GET", path, { as: "admin" })).status, 200);
        assert.equal((await create(brief(), "admin")).status, 403);
        assert.equal((await call("GET", path, { as: "otherVendor" })).status, 403);
        assert.equal((await call("GET", path, { as: "customer" })).status, 403);
        assert.equal((await call("GET", path)).status, 401);
        assert.equal((await call("GET", `/vendors/${OTHER}/marketing/campaigns/${campaign.campaign_id}`, { as: "otherVendor" })).status, 404,
            "another business's campaign id under your own business");
    });
});
