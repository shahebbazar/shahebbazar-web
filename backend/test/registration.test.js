// Registration of business owners and customers: both need a phone verification code.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { query, call, requestCode, startApi, stopApi } = require("./support/harness");

before(startApi);
after(stopApi);

const business = (phone, overrides = {}) => ({
    vendor_name: "Padma Test Sweets",
    vendor_email: null,
    vendor_phone: phone,
    vendor_address: "12 Station Road",
    vendor_city: "Kazla",
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
            [{ vendor_phone: "not a phone" }, /valid phone/],
            [{ vendor_email: "not-an-email" }, /valid email/],
        ];
        for (const [override, message] of cases) {
            const res = await call("POST", "/auth/register/vendor", { json: { ...business("+8801799000020", override), code: "123456" } });
            assert.equal(res.status, 400, JSON.stringify(override));
            assert.match(res.data.error, message);
        }
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
