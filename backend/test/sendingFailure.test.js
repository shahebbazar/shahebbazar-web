// Marketing email sending when the provider is down (KAN-286): the API points at an SMTP server
// that refuses connections. Nothing is sent, no allowance is used, and the campaign can be sent later.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { query, call, startApi, stopApi } = require("./support/harness");

before(() => startApi({ MARKETING_EMAIL_ENABLED: "true", SMTP_HOST: "127.0.0.1", SMTP_PORT: "9" }));
after(stopApi);

describe("a provider failure", () => {
    it("leaves the campaign unsent and uses no allowance", async () => {
        const listing = (await query("SELECT listing_id FROM vendor_listings WHERE vendor_id = 1 AND listing_status = 'approved' LIMIT 1"))[0].listing_id;
        const campaign = (await call("POST", "/vendors/1/marketing/campaigns", {
            as: "owner", json: { goal: "new_stock", language: "en", call_to_action: "visit", listing_ids: [listing] },
        })).data;
        const approved = await call("POST", `/vendors/1/marketing/campaigns/${campaign.campaign_id}/approve`, {
            as: "owner", json: { version_id: campaign.versions[0].version_id },
        });
        assert.equal(approved.status, 200, JSON.stringify(approved.data));
        const used = async () => (await query("SELECT COUNT(*)::int AS n FROM marketing_usage_events WHERE vendor_id = 1"))[0].n;
        const usedBefore = await used();

        const res = await call("POST", `/vendors/1/marketing/campaigns/${campaign.campaign_id}/send`, { as: "owner" });
        assert.equal(res.status, 502);
        assert.match(res.data.error, /nothing was sent and no allowance was used/);

        assert.equal(await used(), usedBefore);
        assert.equal((await query("SELECT COUNT(*)::int AS n FROM marketing_sends"))[0].n, 0);
        const after = (await call("GET", `/vendors/1/marketing/campaigns/${campaign.campaign_id}`, { as: "owner" })).data;
        assert.equal(after.status, "approved");
        assert.equal(after.send.can_send, true, "it can be tried again");
    });
});
