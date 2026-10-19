// Marketing passes (KAN-283, Stage 1): admin activation and management, sponsored placement that
// ends with the pass, and the entitlement rules. Runs against the real API and a throwaway
// database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { query, testClient, call, startApi, stopApi, userIdOf } = require("./support/harness");
const { checkEntitlement, useEntitlement } = require("../services/marketing/entitlements");

let db;
before(async () => {
    await startApi();
    db = await testClient();
});
after(async () => {
    await db?.end();
    await stopApi();
});

const packageId = async (days) =>
    (await query("SELECT package_id FROM marketing_packages WHERE package_duration_days = $1", [days]))[0].package_id;

/** Is the business in the paid "Sponsored" slot when searched by its own name? */
async function sponsored(vendor) {
    const res = await call("GET", `/businesses?q=${encodeURIComponent(vendor.vendor_name)}`);
    assert.equal(res.status, 200);
    return {
        sponsored: res.data.sponsored.some((b) => b.vendor_id === vendor.vendor_id),
        organic: res.data.results.some((b) => b.vendor_id === vendor.vendor_id),
    };
}

/** Runs useEntitlement in a transaction, as a real paid action would. */
async function spend(vendorId, action, quantity = 1) {
    await db.query("BEGIN");
    try {
        const result = await useEntitlement(db, vendorId, action, { quantity, reference: "test" });
        await db.query("COMMIT");
        return result;
    } catch (err) {
        await db.query("ROLLBACK");
        throw err;
    }
}

const lastAudit = async (action) =>
    (await query("SELECT * FROM audit_logs WHERE audit_action = $1 ORDER BY audit_id DESC LIMIT 1", [action]))[0];

describe("seed data", () => {
    it("has the three proposed passes", async () => {
        const rows = await query(
            "SELECT package_duration_days AS days, package_price_bdt::int AS price, package_email_campaign_limit AS emails FROM marketing_packages ORDER BY 1"
        );
        assert.deepEqual(rows, [
            { days: 7, price: 299, emails: 1 },
            { days: 30, price: 999, emails: 4 },
            { days: 90, price: 2499, emails: 12 },
        ]);
    });

    it("every seeded featured business has a running pass that ends when its placement does", async () => {
        const mismatched = await query(
            `SELECT v.vendor_slug FROM vendors v
             WHERE v.vendor_is_featured AND NOT EXISTS (
                 SELECT 1 FROM vendor_marketing_subscriptions s
                 WHERE s.vendor_id = v.vendor_id AND s.subscription_status = 'active'
                   AND s.subscription_ends_at = v.vendor_featured_until)`
        );
        assert.deepEqual(mismatched, []);
        assert.ok((await call("GET", "/home")).data.featured.length > 0, "the home page still has featured businesses");
    });
});

describe("activating and managing a pass", () => {
    let vendor;
    let pass;

    before(async () => {
        // An approved business that is not featured and has no pass.
        vendor = (await query(
            `SELECT vendor_id, vendor_name FROM vendors v
             WHERE vendor_status = 'approved' AND NOT vendor_is_featured
               AND NOT EXISTS (SELECT 1 FROM vendor_marketing_subscriptions s WHERE s.vendor_id = v.vendor_id)
             ORDER BY vendor_id LIMIT 1`
        ))[0];
        assert.ok(vendor, "the seed has an approved business without a pass");
    });

    it("the admin page lists the passes and the business as able to get one", async () => {
        const res = await call("GET", "/admin/marketing", { as: "admin" });
        assert.equal(res.status, 200);
        assert.equal(res.data.packages.length, 3);
        const row = res.data.businesses.find((b) => b.vendor_id === vendor.vendor_id);
        assert.equal(row.has_active_pass, false);
    });

    it("before a pass: not sponsored, and no paid action is allowed", async () => {
        assert.deepEqual(await sponsored(vendor), { sponsored: false, organic: true });
        const check = await checkEntitlement(db, vendor.vendor_id, "email_campaign");
        assert.equal(check.allowed, false);
        assert.match(check.reason, /no Marketing pass/);
    });

    it("an admin activates a 30-day pass; it is recorded against that admin", async () => {
        const res = await call("POST", "/admin/marketing/subscriptions", {
            as: "admin",
            json: { vendor_id: vendor.vendor_id, package_id: await packageId(30) },
        });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        pass = res.data;
        assert.equal(pass.status, "active");
        assert.equal(pass.days_left, 30);
        assert.deepEqual(pass.allowances.email_campaign, { limit: 4, used: 0, left: 4 });
        const entry = await lastAudit("marketing.activate");
        assert.equal(entry.audit_actor_user_id, await userIdOf("admin"));
        assert.equal(entry.audit_target_id, pass.subscription_id);
    });

    it("the business is now in the Sponsored slot and not repeated in the ordinary results", async () => {
        assert.deepEqual(await sponsored(vendor), { sponsored: true, organic: false });
    });

    it("a second pass cannot be activated while one is running", async () => {
        const res = await call("POST", "/admin/marketing/subscriptions", {
            as: "admin",
            json: { vendor_id: vendor.vendor_id, package_id: await packageId(7) },
        });
        assert.equal(res.status, 409);
        assert.match(res.data.error, /Extend it instead/);
    });

    it("extending adds days and moves the sponsored end date with it", async () => {
        const res = await call("POST", `/admin/marketing/subscriptions/${pass.subscription_id}/extend`, { as: "admin", json: { days: 7 } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const addedMs = new Date(res.data.subscription_ends_at) - new Date(pass.ends_at);
        assert.equal(Math.round(addedMs / 86400000), 7);
        const v = (await query("SELECT vendor_featured_until FROM vendors WHERE vendor_id = $1", [vendor.vendor_id]))[0];
        assert.equal(new Date(v.vendor_featured_until).getTime(), new Date(res.data.subscription_ends_at).getTime());
        assert.ok(await lastAudit("marketing.extend"));
    });

    it("paid actions use the allowance and stop when it is used up", async () => {
        const first = await checkEntitlement(db, vendor.vendor_id, "email_campaign");
        assert.equal(first.allowed, true);
        assert.equal(first.left, 3);
        for (let i = 0; i < 4; i++) assert.equal((await spend(vendor.vendor_id, "email_campaign")).allowed, true);
        const fifth = await spend(vendor.vendor_id, "email_campaign");
        assert.equal(fifth.allowed, false);
        assert.match(fifth.reason, /allowance is used up \(4 included\)/);
        const owner = await call("GET", `/vendors/${vendor.vendor_id}/marketing`, { as: "admin" });
        assert.deepEqual(owner.data.pass.allowances.email_campaign, { limit: 4, used: 4, left: 0 });
    });

    it("suspending removes sponsored placement and blocks paid actions; resuming restores both", async () => {
        let res = await call("POST", `/admin/marketing/subscriptions/${pass.subscription_id}/suspend`, {
            as: "admin", json: { reason: "Payment query" },
        });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal((await sponsored(vendor)).sponsored, false);
        const check = await checkEntitlement(db, vendor.vendor_id, "ai_action");
        assert.equal(check.allowed, false);
        assert.match(check.reason, /suspended/);
        assert.equal((await lastAudit("marketing.suspend")).audit_after.reason, "Payment query");

        res = await call("POST", `/admin/marketing/subscriptions/${pass.subscription_id}/resume`, { as: "admin" });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal((await sponsored(vendor)).sponsored, true);
        assert.equal((await checkEntitlement(db, vendor.vendor_id, "ai_action")).allowed, true);
    });

    it("an end date in the past ends sponsored placement at once; history and results stay", async () => {
        const res = await call("POST", `/admin/marketing/subscriptions/${pass.subscription_id}/end-now`, { as: "admin" });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.status, "expired");
        assert.deepEqual(await sponsored(vendor), { sponsored: false, organic: true });
        const status = await call("GET", `/vendors/${vendor.vendor_id}/marketing`, { as: "admin" });
        assert.equal(status.data.pass.status, "expired");
        assert.equal(status.data.pass.allowances.email_campaign.used, 4, "usage history is kept");
    });

    it("after expiry: one free email a week, nothing else", async () => {
        const free = await spend(vendor.vendor_id, "email_campaign");
        assert.equal(free.allowed, true);
        assert.equal(free.free, true);
        const again = await spend(vendor.vendor_id, "email_campaign");
        assert.equal(again.allowed, false);
        assert.match(again.reason, /ended on .* free allowance of 1 email a week is used up/);
        const ai = await checkEntitlement(db, vendor.vendor_id, "ai_action");
        assert.equal(ai.allowed, false);
        assert.match(ai.reason, /Renew it to continue/);
    });

    it("an expired pass cannot be extended, suspended or ended again", async () => {
        for (const [action, json] of [["extend", { days: 7 }], ["suspend", {}], ["end-now", {}]]) {
            const res = await call("POST", `/admin/marketing/subscriptions/${pass.subscription_id}/${action}`, { as: "admin", json });
            assert.equal(res.status, 409, `${action}: ${JSON.stringify(res.data)}`);
        }
    });

    it("a new pass can be activated after expiry, and cancelling it ends placement for good", async () => {
        const res = await call("POST", "/admin/marketing/subscriptions", {
            as: "admin", json: { vendor_id: vendor.vendor_id, package_id: await packageId(7) },
        });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.days_left, 7);
        assert.equal((await sponsored(vendor)).sponsored, true);

        const cancel = await call("POST", `/admin/marketing/subscriptions/${res.data.subscription_id}/cancel`, {
            as: "admin", json: { reason: "Requested by the owner" },
        });
        assert.equal(cancel.status, 200);
        assert.equal((await sponsored(vendor)).sponsored, false);
        assert.match((await checkEntitlement(db, vendor.vendor_id, "email_campaign")).reason, /cancelled/);
        const resume = await call("POST", `/admin/marketing/subscriptions/${res.data.subscription_id}/resume`, { as: "admin" });
        assert.equal(resume.status, 409);
    });
});

describe("rules and validation", () => {
    it("only approved businesses can be given a pass", async () => {
        const pending = (await query("SELECT vendor_id FROM vendors WHERE vendor_status = 'pending' LIMIT 1"))[0];
        const res = await call("POST", "/admin/marketing/subscriptions", {
            as: "admin", json: { vendor_id: pending.vendor_id, package_id: await packageId(30) },
        });
        assert.equal(res.status, 400);
        assert.match(res.data.error, /Only approved businesses/);
    });

    it("two simultaneous activations for the same business give one pass, not two", async () => {
        const vendor = (await query(
            `SELECT vendor_id FROM vendors v WHERE vendor_status = 'approved'
               AND NOT EXISTS (SELECT 1 FROM vendor_marketing_subscriptions s WHERE s.vendor_id = v.vendor_id)
             ORDER BY vendor_id LIMIT 1`
        ))[0];
        const body = { vendor_id: vendor.vendor_id, package_id: await packageId(30) };
        const results = await Promise.all([1, 2].map(() => call("POST", "/admin/marketing/subscriptions", { as: "admin", json: body })));
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        const live = await query(
            "SELECT COUNT(*)::int AS n FROM vendor_marketing_subscriptions WHERE vendor_id = $1 AND subscription_status = 'active'",
            [vendor.vendor_id]
        );
        assert.equal(live[0].n, 1);
    });

    it("an end date must be after the pass started; a future end date moves sponsored placement", async () => {
        const pass = (await query(
            "SELECT subscription_id, vendor_id, subscription_starts_at FROM vendor_marketing_subscriptions WHERE subscription_status = 'active' ORDER BY subscription_id LIMIT 1"
        ))[0];
        const before = new Date(new Date(pass.subscription_starts_at).getTime() - 86400000).toISOString();
        const bad = await call("POST", `/admin/marketing/subscriptions/${pass.subscription_id}/end-date`, { as: "admin", json: { ends_at: before } });
        assert.equal(bad.status, 400);
        const future = new Date(Date.now() + 10 * 86400000).toISOString();
        const ok = await call("POST", `/admin/marketing/subscriptions/${pass.subscription_id}/end-date`, { as: "admin", json: { ends_at: future } });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        const v = (await query("SELECT vendor_featured_until FROM vendors WHERE vendor_id = $1", [pass.vendor_id]))[0];
        assert.equal(new Date(v.vendor_featured_until).toISOString(), future);
    });

    it("sponsored placement ends on its own when the date passes, with no admin action", async () => {
        const vendor = (await query(
            `SELECT v.vendor_id, v.vendor_name FROM vendors v
             JOIN vendor_marketing_subscriptions s ON s.vendor_id = v.vendor_id AND s.subscription_status = 'active'
             WHERE v.vendor_is_featured ORDER BY v.vendor_id LIMIT 1`
        ))[0];
        assert.equal((await sponsored(vendor)).sponsored, true);
        // Time passing, simulated: the stored flag stays true, only the dates are in the past.
        await query(
            `UPDATE vendor_marketing_subscriptions SET subscription_starts_at = now() - INTERVAL '31 days', subscription_ends_at = now() - INTERVAL '1 day'
             WHERE vendor_id = $1 AND subscription_status = 'active'`, [vendor.vendor_id]
        );
        await query("UPDATE vendors SET vendor_featured_until = now() - INTERVAL '1 day' WHERE vendor_id = $1", [vendor.vendor_id]);
        assert.deepEqual(await sponsored(vendor), { sponsored: false, organic: true });
        assert.equal((await checkEntitlement(db, vendor.vendor_id, "ai_action")).status, "expired");
    });

    it("bad input is refused with a clear message", async () => {
        const id = (await query("SELECT subscription_id FROM vendor_marketing_subscriptions ORDER BY subscription_id LIMIT 1"))[0].subscription_id;
        assert.equal((await call("POST", "/admin/marketing/subscriptions", { as: "admin", json: {} })).status, 400);
        assert.equal((await call("POST", `/admin/marketing/subscriptions/${id}/extend`, { as: "admin", json: { days: 0 } })).status, 400);
        assert.equal((await call("POST", `/admin/marketing/subscriptions/${id}/explode`, { as: "admin" })).status, 404);
        assert.equal((await call("POST", "/admin/marketing/subscriptions/999999/suspend", { as: "admin" })).status, 404);
    });

    it("a pending pass allows nothing", async () => {
        const vendor = (await query(
            `SELECT vendor_id FROM vendors v WHERE vendor_status = 'approved'
               AND NOT EXISTS (SELECT 1 FROM vendor_marketing_subscriptions s WHERE s.vendor_id = v.vendor_id)
             ORDER BY vendor_id LIMIT 1`
        ))[0];
        await query(
            `INSERT INTO vendor_marketing_subscriptions (vendor_id, package_id, subscription_status, subscription_price_bdt)
             VALUES ($1, $2, 'pending', 999)`,
            [vendor.vendor_id, await packageId(30)]
        );
        const check = await checkEntitlement(db, vendor.vendor_id, "email_campaign");
        assert.equal(check.allowed, false);
        assert.match(check.reason, /waiting to be activated/);
    });
});

describe("the owner's view of their pass", () => {
    it("the owner can read their own business's pass", async () => {
        const res = await call("GET", "/vendors/1/marketing", { as: "owner" });
        assert.equal(res.status, 200);
        assert.ok("pass" in res.data);
    });
});
