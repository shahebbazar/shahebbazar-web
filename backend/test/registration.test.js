// Registration of business owners and customers: both need a phone verification code.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { businessChoices, query, call, requestCode, requireApproval, startApi, stopApi } = require("./support/harness");

let choices; // a seeded category and area, and a description
before(async () => {
    await startApi();
    // A new business here waits for approval; settings.test.js covers registering with it off.
    await requireApproval();
    choices = await businessChoices();
});
after(stopApi);

const business = (phone, overrides = {}) => ({
    vendor_name: "Padma Test Sweets",
    vendor_email: null,
    vendor_phone: phone,
    vendor_address: "12 Station Road",
    ...choices,
    ...overrides,
});

const usersWithPhone = async (phone) => query("SELECT user_id FROM users WHERE user_phone = $1", [phone]);

describe("business registration", () => {
    it("the old unverified route is gone", async () => {
        const res = await call("POST", "/vendors", { json: business("+8801799000001") });
        assert.equal(res.status, 404);
        assert.equal((await usersWithPhone("+8801799000001")).length, 0);
    });

    it("refuses a registration without a code, and creates nothing", async () => {
        const res = await call("POST", "/auth/register/vendor", { json: business("+8801799000002") });
        assert.equal(res.status, 400);
        assert.match(res.data.error, /six-digit/);
        assert.equal((await usersWithPhone("+8801799000002")).length, 0);
    });

    it("refuses a wrong code, and creates nothing", async () => {
        const phone = "+8801799000003";
        const code = await requestCode(phone, "register");
        const wrong = code === "000000" ? "111111" : "000000";
        const res = await call("POST", "/auth/register/vendor", { json: { ...business(phone), code: wrong } });
        assert.equal(res.status, 401);
        assert.equal((await usersWithPhone(phone)).length, 0);
        const attempts = await query("SELECT otp_attempts FROM otp_codes WHERE otp_phone = $1 ORDER BY otp_id DESC LIMIT 1", [phone]);
        assert.equal(attempts[0].otp_attempts, 1, "the wrong guess is counted");
    });

    it("refuses a code that was sent to a different phone number", async () => {
        const code = await requestCode("+8801799000004", "register");
        const res = await call("POST", "/auth/register/vendor", { json: { ...business("+8801799000005"), code } });
        assert.equal(res.status, 401);
        assert.equal((await usersWithPhone("+8801799000005")).length, 0);
    });

    it("refuses a code requested for another purpose", async () => {
        const phone = "+8801799000006";
        const code = await requestCode(phone, "recover");
        const res = await call("POST", "/auth/register/vendor", { json: { ...business(phone), code } });
        assert.equal(res.status, 401);
        assert.equal((await usersWithPhone(phone)).length, 0);
    });

    describe("with the right code", () => {
        const phone = "+8801799000010";
        let res;
        let cookie;

        before(async () => {
            const code = await requestCode(phone, "register");
            res = await call("POST", "/auth/register/vendor", {
                json: { ...business(phone, { vendor_email: "Owner@Example.com" }), code },
            });
            cookie = (res.headers.get("set-cookie") || "").split(";")[0];
        });

        it("creates a verified vendor account and a pending business", async () => {
            assert.equal(res.status, 201, JSON.stringify(res.data));
            const [user] = await query(
                "SELECT user_role, user_email, user_phone_verified_at FROM users WHERE user_phone = $1",
                [phone]
            );
            assert.equal(user.user_role, "vendor");
            assert.equal(user.user_email, "owner@example.com");
            assert.ok(user.user_phone_verified_at, "the phone is marked verified");
            assert.equal(res.data.vendor.vendor_status, "pending");
            assert.equal(res.data.vendor.vendor_slug, "padma-test-sweets");
        });

        it("saves the category, area and description, so it can be approved without more details", async () => {
            const [vendor] = await query(
                `SELECT v.location_id, v.vendor_description, array_agg(vc.category_id) AS categories
                 FROM vendors v JOIN vendor_categories vc USING (vendor_id)
                 WHERE v.vendor_id = $1 GROUP BY 1, 2`,
                [res.data.vendor.vendor_id]
            );
            assert.deepEqual(vendor, {
                location_id: choices.location_id,
                vendor_description: choices.vendor_description,
                categories: [choices.category_id],
            });
        });

        it("signs the new owner in, with access to their own business only", async () => {
            assert.match(cookie, /^shaheb_session=/);
            const mine = await call("GET", "/vendor-account/businesses", { cookie });
            assert.deepEqual(mine.data.map((b) => b.vendor_id), [res.data.vendor.vendor_id]);
            assert.equal((await call("GET", `/vendors/${res.data.vendor.vendor_id}/dashboard`, { cookie })).status, 200);
            assert.equal((await call("GET", "/vendors/1/dashboard", { cookie })).status, 403);
        });

        it("the code is marked used", async () => {
            const [otp] = await query(
                "SELECT otp_consumed_at FROM otp_codes WHERE otp_phone = $1 AND otp_purpose = 'register' ORDER BY otp_id DESC LIMIT 1",
                [phone]
            );
            assert.ok(otp.otp_consumed_at);
        });

        it("the phone number cannot register again", async () => {
            const code = await requestCode(phone, "register");
            const again = await call("POST", "/auth/register/vendor", { json: { ...business(phone), code } });
            assert.equal(again.status, 409);
            assert.match(again.data.error, /already registered/);
        });

        it("a second business with the same name gets its own address", async () => {
            const other = "+8801799000011";
            const code = await requestCode(other, "register");
            const second = await call("POST", "/auth/register/vendor", { json: { ...business(other), code } });
            assert.equal(second.status, 201, JSON.stringify(second.data));
            assert.equal(second.data.vendor.vendor_slug, "padma-test-sweets-2");
        });
    });

    it("checks the business details before anything else", async () => {
        const cases = [
            [{ vendor_name: "" }, /Business name is required/],
            [{ vendor_phone: "not a phone" }, /Bangladesh mobile/],
            [{ vendor_phone: "0412345678" }, /Bangladesh mobile/],
            [{ vendor_email: "not-an-email" }, /valid email/],
            [{ category_id: undefined }, /Choose a category/],
            [{ location_id: "" }, /Choose the area/],
            [{ vendor_description: "Too short." }, /at least 20 characters/],
            [{ vendor_description: "x".repeat(501) }, /under 500 characters/],
            [{ category_id: 999999 }, /category from the list/],
            [{ location_id: 1 }, /area from the list/], // the country, not an area
        ];
        for (const [override, message] of cases) {
            const res = await call("POST", "/auth/register/vendor", { json: { ...business("+8801799000020", override), code: "123456" } });
            assert.equal(res.status, 400, JSON.stringify(override));
            assert.match(res.data.error, message);
        }
        const [otp] = await query("SELECT count(*)::int AS n FROM otp_codes WHERE otp_phone = '+8801799000020'");
        assert.equal(otp.n, 0, "no code was involved");
    });

    it("the form's categories and areas are public, grouped by main category", async () => {
        const res = await call("GET", "/auth/register/vendor/options");
        assert.equal(res.status, 200);
        assert.ok(res.data.categories.length > 0 && res.data.areas.length > 0);
        assert.ok(res.data.categories.every((c) => c.id && c.name && c.parent));
        assert.ok(res.data.areas.some((a) => a.id === choices.location_id));
    });
});

describe("customer registration still works", () => {
    it("creates a verified customer and signs them in", async () => {
        const phone = "+8801799000030";
        const code = await requestCode(phone, "register");
        const res = await call("POST", "/auth/register/customer", { json: { name: "Test Customer", phone, code } });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.user.user_role, "customer");
        const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
        assert.equal((await call("GET", "/me", { cookie })).status, 200);
        assert.equal((await query("SELECT user_language FROM users WHERE user_phone = $1", [phone]))[0].user_language, "en");
    });

    it("registering on the Bangla page makes Bangla the account's language", async () => {
        const phone = "+8801799000032";
        const code = await requestCode(phone, "register");
        const res = await call("POST", "/auth/register/customer", { json: { name: "বাংলা গ্রাহক", phone, code, language: "bn" } });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal((await query("SELECT user_language FROM users WHERE user_phone = $1", [phone]))[0].user_language, "bn");
    });

    it("an unknown language is saved as English", async () => {
        const phone = "+8801799000033";
        const code = await requestCode(phone, "register");
        const res = await call("POST", "/auth/register/customer", { json: { name: "Test Customer", phone, code, language: "fr" } });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal((await query("SELECT user_language FROM users WHERE user_phone = $1", [phone]))[0].user_language, "en");
    });

    it("refuses a wrong code", async () => {
        const phone = "+8801799000031";
        const code = await requestCode(phone, "register");
        const res = await call("POST", "/auth/register/customer", {
            json: { name: "Test Customer", phone, code: code === "000000" ? "111111" : "000000" },
        });
        assert.equal(res.status, 401);
        assert.equal((await usersWithPhone(phone)).length, 0);
    });
});
