// Offers from businesses (KAN-284): consent, unsubscribe links and the audience a business may send to.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { PHONES, ROLES, query, testClient, call, signIn, startApi, stopApi, userIdOf } = require("./support/harness");
const { audienceFor, unsubscribeToken, unsubscribeUrl } = require("../services/marketing/consent");

let db;
let customerId; // has an email address (seed)
let customer2Id; // has no email address
let shop; // an approved business neither customer has saved
let pending; // a business awaiting approval

const consents = (as = "customer") => call("GET", "/me/consents", { as });
const choose = (vendorId, channels, as = "customer", source) =>
    call("PUT", `/me/consents/${vendorId}`, { as, json: { channels, ...(source ? { source } : {}) } });
const audience = async (vendorId, channel) => (await audienceFor(db, vendorId, channel)).map((r) => r.user_id);
const rows = (userId, vendorId) =>
    query(
        `SELECT consent_channel, consent_source, consent_withdrawn_at IS NOT NULL AS withdrawn, consent_withdrawn_source
         FROM marketing_consents WHERE user_id = $1 AND vendor_id = $2 ORDER BY consent_id`,
        [userId, vendorId]
    );

before(async () => {
    await startApi();
    db = await testClient();
    PHONES.customer2 = "+8801722000002";
    ROLES.customer2 = "customer";
    await signIn("customer2");
    customerId = await userIdOf("customer");
    customer2Id = await userIdOf("customer2");
    shop = (await query(
        `SELECT vendor_id, vendor_slug FROM vendors v WHERE vendor_status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM saved_businesses s WHERE s.vendor_id = v.vendor_id AND s.user_id IN ($1, $2))
         AND NOT EXISTS (SELECT 1 FROM marketing_consents c WHERE c.vendor_id = v.vendor_id)
         ORDER BY vendor_id LIMIT 1`,
        [customerId, customer2Id]
    ))[0];
    pending = (await query("SELECT vendor_id FROM vendors WHERE vendor_status = 'pending' LIMIT 1"))[0];
});
after(async () => {
    await db?.end();
    await stopApi();
});

describe("seed", () => {
    it("the demo customer gets SMS offers from the silk house, and saving the pharmacy gave no consent", async () => {
        const res = await consents();
        assert.equal(res.status, 200);
        assert.deepEqual(res.data.map((c) => [c.vendor_slug, c.channels]), [["shaheb-bazar-silk-house", ["sms"]]]);
        assert.equal((await call("GET", "/me", { as: "customer" })).data.offers_count, 1);
    });
});

describe("giving consent", () => {
    it("saving a business never gives consent by itself", async () => {
        assert.equal((await call("PUT", `/me/saved/${shop.vendor_id}`, { as: "customer" })).status, 200);
        assert.deepEqual(await rows(customerId, shop.vendor_id), []);
        const saved = (await call("GET", "/me/saved", { as: "customer" })).data.find((b) => b.vendor_id === shop.vendor_id);
        assert.deepEqual(saved.offer_channels, []);
    });

    it("ticking offers after saving records the choice and its source", async () => {
        const res = await choose(shop.vendor_id, ["sms", "email"], "customer", "save_prompt");
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.deepEqual(res.data.channels, ["email", "sms"]);
        assert.deepEqual(
            (await rows(customerId, shop.vendor_id)).map((r) => [r.consent_channel, r.consent_source, r.withdrawn]),
            [["sms", "save_prompt", false], ["email", "save_prompt", false]]
        );
        const saved = (await call("GET", "/me/saved", { as: "customer" })).data.find((b) => b.vendor_id === shop.vendor_id);
        assert.deepEqual(saved.offer_channels, ["email", "sms"]);
    });

    it("choosing the same channels again changes nothing", async () => {
        assert.equal((await choose(shop.vendor_id, ["email", "sms"])).status, 200);
        assert.equal((await rows(customerId, shop.vendor_id)).length, 2);
    });

    it("email needs an email address on the account; SMS does not", async () => {
        const res = await choose(shop.vendor_id, ["email"], "customer2");
        assert.equal(res.status, 400);
        assert.match(res.data.error, /no email address/);
        assert.deepEqual(await rows(customer2Id, shop.vendor_id), [], "nothing saved");
        assert.equal((await choose(shop.vendor_id, ["sms"], "customer2")).status, 200);
    });

    it("refuses unknown channels, duplicates, a missing list, unknown sources and bad ids", async () => {
        for (const channels of [["whatsapp"], ["sms", "sms"], "sms", undefined]) {
            assert.equal((await choose(shop.vendor_id, channels)).status, 400, JSON.stringify(channels));
        }
        assert.equal((await choose(shop.vendor_id, ["sms"], "customer", "import")).status, 400);
        assert.equal((await call("PUT", "/me/consents/abc", { as: "customer", json: { channels: [] } })).status, 400);
    });

    it("only approved businesses can be chosen", async () => {
        assert.equal((await choose(pending.vendor_id, ["sms"])).status, 404);
        assert.equal((await choose(999999, ["sms"])).status, 404);
    });

    it("needs a signed-in account", async () => {
        assert.equal((await call("GET", "/me/consents")).status, 401);
        assert.equal((await call("PUT", `/me/consents/${shop.vendor_id}`, { json: { channels: ["sms"] } })).status, 401);
    });
});

describe("the audience a business may send to", () => {
    it("contains only customers with active consent for that channel", async () => {
        assert.deepEqual(await audience(shop.vendor_id, "email"), [customerId]);
        assert.deepEqual(await audience(shop.vendor_id, "sms"), [customerId, customer2Id]);
        const [sms] = await audienceFor(db, shop.vendor_id, "sms");
        assert.equal(sms.address, PHONES.customer);
        const [email] = await audienceFor(db, shop.vendor_id, "email");
        assert.equal(email.address, "imran.customer@example.com");
    });

    it("leaves out suspended accounts and email consent without an address", async () => {
        await query("UPDATE users SET user_status = 'suspended' WHERE user_id = $1", [customer2Id]);
        try {
            assert.deepEqual(await audience(shop.vendor_id, "sms"), [customerId]);
        } finally {
            await query("UPDATE users SET user_status = 'active' WHERE user_id = $1", [customer2Id]);
        }
        const before = (await query("SELECT user_email FROM users WHERE user_id = $1", [customerId]))[0].user_email;
        await query("UPDATE users SET user_email = NULL WHERE user_id = $1", [customerId]);
        try {
            assert.deepEqual(await audience(shop.vendor_id, "email"), []);
        } finally {
            await query("UPDATE users SET user_email = $2 WHERE user_id = $1", [customerId, before]);
        }
    });

    it("refuses an unknown channel", async () => {
        await assert.rejects(audienceFor(db, shop.vendor_id, "fax"), /Unknown channel/);
    });
});

describe("withdrawing consent", () => {
    it("the account page can stop one channel, keeping the record", async () => {
        const res = await choose(shop.vendor_id, ["sms"]);
        assert.deepEqual(res.data.channels, ["sms"]);
        assert.deepEqual(await audience(shop.vendor_id, "email"), []);
        const email = (await rows(customerId, shop.vendor_id)).find((r) => r.consent_channel === "email");
        assert.deepEqual([email.withdrawn, email.consent_withdrawn_source], [true, "account"]);
    });

    it("giving consent again adds a new record", async () => {
        await choose(shop.vendor_id, ["email", "sms"]);
        const emails = (await rows(customerId, shop.vendor_id)).filter((r) => r.consent_channel === "email");
        assert.deepEqual(emails.map((r) => r.withdrawn), [true, false]);
    });

    it("removing the saved business stops all its offers", async () => {
        assert.equal((await call("DELETE", `/me/saved/${shop.vendor_id}`, { as: "customer" })).status, 200);
        assert.deepEqual(await audience(shop.vendor_id, "email"), []);
        assert.ok(!(await audience(shop.vendor_id, "sms")).includes(customerId));
        const active = (await rows(customerId, shop.vendor_id)).filter((r) => !r.withdrawn);
        assert.deepEqual(active, []);
        const last = (await rows(customerId, shop.vendor_id)).at(-1);
        assert.equal(last.consent_withdrawn_source, "unsaved");
    });

    it("one customer's choices never change another's", async () => {
        assert.deepEqual(await audience(shop.vendor_id, "sms"), [customer2Id]);
    });
});

describe("email address and email offers", () => {
    const save = (body, as = "customer2") => call("PUT", "/me/profile", { as, json: body });

    it("a customer without an email can add one, and then choose email offers", async () => {
        assert.equal((await choose(shop.vendor_id, ["sms", "email"], "customer2")).status, 400);
        const res = await save({ name: "  Farhana Yasmin ", email: "  Farhana.Y@Example.COM " });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.deepEqual([res.data.user_name, res.data.user_email], ["Farhana Yasmin", "farhana.y@example.com"]);
        assert.equal((await call("GET", "/me", { as: "customer2" })).data.user_email, "farhana.y@example.com");
        assert.equal((await choose(shop.vendor_id, ["sms", "email"], "customer2")).status, 200);
        assert.ok((await audience(shop.vendor_id, "email")).includes(customer2Id));
    });

    it("removing the email stops email offers from every business, keeping SMS", async () => {
        const res = await save({ name: "Farhana Yasmin", email: "" });
        assert.equal(res.status, 200);
        assert.equal(res.data.user_email, null);
        assert.ok(!(await audience(shop.vendor_id, "email")).includes(customer2Id));
        assert.ok((await audience(shop.vendor_id, "sms")).includes(customer2Id));
        const email = (await rows(customer2Id, shop.vendor_id)).filter((r) => r.consent_channel === "email").at(-1);
        assert.deepEqual([email.withdrawn, email.consent_withdrawn_source], [true, "account"]);
    });

    it("a business owner removing their email in settings also stops their email offers", async () => {
        const ownerId = await userIdOf("owner");
        await query("UPDATE users SET user_email = 'owner.offers@example.com' WHERE user_id = $1", [ownerId]);
        assert.equal((await choose(shop.vendor_id, ["email"], "owner")).status, 200);
        const form = (await call("GET", "/vendors/1/owner", { as: "owner" })).data;
        const res = await call("PUT", "/vendors/1/owner", { as: "owner", json: { user_name: form.user_name, user_email: "" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.ok(!(await audience(shop.vendor_id, "email")).includes(ownerId));
    });
});

describe("unsubscribe link", () => {
    let token;
    before(async () => {
        await call("PUT", `/me/saved/${shop.vendor_id}`, { as: "customer" });
        await choose(shop.vendor_id, ["email", "sms"]);
        token = unsubscribeToken(customerId, shop.vendor_id, "email");
    });

    it("the link points at the site's unsubscribe page", () => {
        assert.match(unsubscribeUrl(customerId, shop.vendor_id, "email"), new RegExp(`/unsubscribe/${token.replace(/\./g, "\\.")}$`));
    });

    it("opening it shows the business and changes nothing (mail scanners open links)", async () => {
        const res = await call("GET", `/unsubscribe/${token}`);
        assert.equal(res.status, 200);
        assert.equal(res.data.business.vendor_slug, shop.vendor_slug);
        assert.deepEqual([res.data.channel, res.data.subscribed], ["email", true]);
        assert.deepEqual(await audience(shop.vendor_id, "email"), [customerId]);
    });

    it("confirming stops that channel at once, without signing in, and leaves the other channel", async () => {
        const res = await call("POST", `/unsubscribe/${token}`);
        assert.equal(res.status, 200);
        assert.equal(res.data.subscribed, false);
        assert.deepEqual(await audience(shop.vendor_id, "email"), [], "the next send skips them");
        assert.ok((await audience(shop.vendor_id, "sms")).includes(customerId));
        const email = (await rows(customerId, shop.vendor_id)).filter((r) => r.consent_channel === "email").at(-1);
        assert.equal(email.consent_withdrawn_source, "unsubscribe_link");
    });

    it("using it again is harmless and reports that offers are already stopped", async () => {
        assert.equal((await call("POST", `/unsubscribe/${token}`)).status, 200);
        const res = await call("GET", `/unsubscribe/${token}`);
        assert.equal(res.data.subscribed, false);
    });

    it("an old link still works after the customer opts in again", async () => {
        await choose(shop.vendor_id, ["email", "sms"]);
        await call("POST", `/unsubscribe/${token}`);
        assert.deepEqual(await audience(shop.vendor_id, "email"), []);
    });

    it("a changed or made-up link is refused", async () => {
        const sms = unsubscribeToken(customerId, shop.vendor_id, "sms");
        const [user, vendor, , sig] = sms.split(".");
        for (const bad of [
            `${user}.${vendor}.email.${sig}`, // signature for SMS used on email
            `${customer2Id}.${vendor}.sms.${sig}`, // another customer
            `${user}.${vendor}.sms.${"A".repeat(32)}`,
            "nonsense",
        ]) {
            assert.equal((await call("GET", `/unsubscribe/${bad}`)).status, 404, bad);
            assert.equal((await call("POST", `/unsubscribe/${bad}`)).status, 404, bad);
        }
        assert.ok((await audience(shop.vendor_id, "sms")).includes(customerId), "nothing was changed");
    });
});
