// Sign-in codes, login portals and sessions.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { PHONES, query, call, requestCode, startApi, stopApi } = require("./support/harness");

before(startApi);
after(stopApi);

const login = (phone, code, expectedRole) =>
    call("POST", "/auth/verify", { json: { phone, purpose: "login", expectedRole, code } });
const ask = (json) => call("POST", "/auth/request-verification", { json });
const sessionOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];
const wrong = (code) => (code === "000000" ? "111111" : "000000");

describe("requesting a code", () => {
    it("checks the phone, the purpose and the portal", async () => {
        assert.equal((await ask({ phone: "not a phone", purpose: "login", expectedRole: "customer" })).status, 400);
        assert.equal((await ask({ phone: PHONES.customer, purpose: "hack", expectedRole: "customer" })).status, 400);
        assert.equal((await ask({ phone: PHONES.customer, purpose: "login" })).status, 400, "login needs a portal");
        assert.equal((await ask({ phone: PHONES.customer, purpose: "login", expectedRole: "superuser" })).status, 400);
    });

    it("refuses a login code for a number with no account, or a suspended account", async () => {
        assert.equal((await ask({ phone: "+8801799555001", purpose: "login", expectedRole: "customer" })).status, 401);
        await query("UPDATE users SET user_status = 'suspended' WHERE user_phone = '+8801722000002'");
        try {
            assert.equal((await ask({ phone: "+8801722000002", purpose: "login", expectedRole: "customer" })).status, 401);
        } finally {
            await query("UPDATE users SET user_status = 'active' WHERE user_phone = '+8801722000002'");
        }
    });

    it("sends each account to the right portal", async () => {
        const customerAsBusiness = await ask({ phone: PHONES.customer, purpose: "login", expectedRole: "vendor" });
        assert.equal(customerAsBusiness.status, 403);
        assert.match(customerAsBusiness.data.error, /no business yet/);
        const adminAsCustomer = await ask({ phone: PHONES.admin, purpose: "login", expectedRole: "customer" });
        assert.equal(adminAsCustomer.status, 403);
        assert.match(adminAsCustomer.data.error, /Administrator login/);
        assert.equal((await ask({ phone: PHONES.owner, purpose: "login", expectedRole: "admin" })).status, 403);
    });

    it("lets a business owner use the customer login, with the same account", async () => {
        const code = await requestCode(PHONES.otherVendor, "login", "customer");
        const res = await login(PHONES.otherVendor, code, "customer");
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.user.user_role, "vendor");
    });

    it("allows 3 code requests per number and purpose in 10 minutes", async () => {
        const phone = "+8801799555002";
        for (let i = 0; i < 3; i++) assert.equal((await ask({ phone, purpose: "register" })).status, 201);
        const fourth = await ask({ phone, purpose: "register" });
        assert.equal(fourth.status, 429);
        assert.equal((await ask({ phone, purpose: "recover" })).status, 201, "the limit is per purpose");
    });

    it("stores only a hash of the code", async () => {
        const phone = "+8801799555003";
        const code = await requestCode(phone, "register");
        const [row] = await query("SELECT * FROM otp_codes WHERE otp_phone = $1 ORDER BY otp_id DESC LIMIT 1", [phone]);
        assert.ok(!JSON.stringify(row).includes(`"${code}"`), "the plain code is not stored");
        assert.match(row.otp_code_hash, /^[0-9a-f]{64}$/);
    });
});

describe("using a code", () => {
    it("rejects a wrong code and counts the attempt", async () => {
        const code = await requestCode(PHONES.customer, "login", "customer");
        const res = await login(PHONES.customer, wrong(code), "customer");
        assert.equal(res.status, 401);
        const [row] = await query("SELECT otp_attempts FROM otp_codes WHERE otp_phone = $1 ORDER BY otp_id DESC LIMIT 1", [PHONES.customer]);
        assert.equal(row.otp_attempts, 1);
        assert.equal((await login(PHONES.customer, code, "customer")).status, 200, "the right code still works afterwards");
    });

    it("locks the code after 5 wrong guesses, even for the right code", async () => {
        const code = await requestCode(PHONES.owner, "login", "vendor");
        for (let i = 0; i < 5; i++) assert.equal((await login(PHONES.owner, wrong(code), "vendor")).status, 401);
        assert.equal((await login(PHONES.owner, code, "vendor")).status, 401);
    });

    it("a code works once", async () => {
        await query("DELETE FROM otp_codes WHERE otp_phone = $1", [PHONES.admin]);
        const code = await requestCode(PHONES.admin, "login", "admin");
        assert.equal((await login(PHONES.admin, code, "admin")).status, 200);
        assert.equal((await login(PHONES.admin, code, "admin")).status, 401);
    });

    it("an expired code is refused", async () => {
        await query("DELETE FROM otp_codes WHERE otp_phone = $1", [PHONES.otherVendor]);
        const code = await requestCode(PHONES.otherVendor, "login", "vendor");
        await query("UPDATE otp_codes SET otp_expires_at = now() - INTERVAL '1 minute' WHERE otp_phone = $1", [PHONES.otherVendor]);
        assert.equal((await login(PHONES.otherVendor, code, "vendor")).status, 401);
    });

    it("only the latest code counts", async () => {
        const phone = "+8801722000002";
        await query("DELETE FROM otp_codes WHERE otp_phone = $1", [phone]);
        const first = await requestCode(phone, "login", "customer");
        const second = await requestCode(phone, "login", "customer");
        if (first !== second) assert.equal((await login(phone, first, "customer")).status, 401);
        assert.equal((await login(phone, second, "customer")).status, 200);
    });

    it("a malformed code is refused before it is checked", async () => {
        assert.equal((await login(PHONES.customer, "12ab56", "customer")).status, 400);
        assert.equal((await login(PHONES.customer, "1234567", "customer")).status, 400);
    });
});

describe("sessions", () => {
    let cookie;
    let header;
    before(async () => {
        const phone = "+8801722000002";
        await query("DELETE FROM otp_codes WHERE otp_phone = $1", [phone]);
        const code = await requestCode(phone, "login", "customer");
        const res = await login(phone, code, "customer");
        assert.equal(res.status, 200);
        cookie = sessionOf(res);
        header = res.headers.get("set-cookie") ?? "";
    });

    it("sets an HTTP-only, SameSite=Lax session cookie", () => {
        assert.match(header, /shaheb_session=/);
        assert.match(header, /HttpOnly/i);
        assert.match(header, /SameSite=Lax/i);
    });

    it("stores only a hash of the session token", async () => {
        const token = decodeURIComponent(cookie.split("=")[1]);
        assert.equal((await query("SELECT 1 FROM sessions WHERE session_token_hash = $1", [token])).length, 0);
        const hash = crypto.createHash("sha256").update(token).digest("hex");
        assert.equal((await query("SELECT 1 FROM sessions WHERE session_token_hash = $1", [hash])).length, 1);
    });

    it("/auth/me returns the account without secrets", async () => {
        const res = await call("GET", "/auth/me", { cookie });
        assert.equal(res.status, 200);
        assert.equal(res.data.user.user_phone, "+8801722000002");
        const text = JSON.stringify(res.data);
        for (const secret of ["password", "token", "hash"]) assert.ok(!text.includes(secret), secret);
    });

    it("/auth/me includes the account's language, for the signed-in pages (KAN-328)", async () => {
        const [{ user_id, user_language }] = await query("SELECT user_id, user_language FROM users WHERE user_phone = '+8801722000002'");
        await query("UPDATE users SET user_language = 'bn' WHERE user_id = $1", [user_id]);
        try {
            assert.equal((await call("GET", "/auth/me", { cookie })).data.user.user_language, "bn");
        } finally {
            await query("UPDATE users SET user_language = $2 WHERE user_id = $1", [user_id, user_language]);
        }
    });

    it("a made-up or tampered cookie is not accepted", async () => {
        assert.equal((await call("GET", "/auth/me", { cookie: "shaheb_session=made-up" })).status, 401);
        assert.equal((await call("GET", "/auth/me", { cookie: `${cookie}x` })).status, 401);
        assert.equal((await call("GET", "/auth/me")).status, 401);
    });

    it("a session stops working when the account is suspended", async () => {
        await query("UPDATE users SET user_status = 'suspended' WHERE user_phone = '+8801722000002'");
        try {
            assert.equal((await call("GET", "/auth/me", { cookie })).status, 401);
        } finally {
            await query("UPDATE users SET user_status = 'active' WHERE user_phone = '+8801722000002'");
        }
        assert.equal((await call("GET", "/auth/me", { cookie })).status, 200);
    });

    it("an expired session is refused", async () => {
        const token = decodeURIComponent(cookie.split("=")[1]);
        const hash = crypto.createHash("sha256").update(token).digest("hex");
        await query("UPDATE sessions SET session_expires_at = now() - INTERVAL '1 minute' WHERE session_token_hash = $1", [hash]);
        assert.equal((await call("GET", "/auth/me", { cookie })).status, 401);
        await query("UPDATE sessions SET session_expires_at = now() + INTERVAL '1 day' WHERE session_token_hash = $1", [hash]);
    });

    it("logout deletes the session and clears the cookie", async () => {
        const res = await call("POST", "/auth/logout", { cookie });
        assert.equal(res.status, 200);
        assert.match(res.headers.get("set-cookie") || "", /shaheb_session=;|Expires=Thu, 01 Jan 1970/i);
        assert.equal((await call("GET", "/auth/me", { cookie })).status, 401);
        assert.equal((await call("POST", "/auth/logout")).status, 401, "logging out needs a session");
    });
});

describe("customer registration rules", () => {
    const register = (json) => call("POST", "/auth/register/customer", { json });

    it("checks the name, phone, email and code before anything else", async () => {
        const base = { name: "Test Person", phone: "+8801799555010", code: "123456" };
        assert.equal((await register({ ...base, name: "" })).status, 400);
        assert.equal((await register({ ...base, name: "x".repeat(121) })).status, 400);
        assert.equal((await register({ ...base, phone: "abc" })).status, 400);
        assert.equal((await register({ ...base, email: "not-an-email" })).status, 400);
        assert.equal((await register({ ...base, code: "12" })).status, 400);
    });

    it("refuses a phone number or email that is already registered", async () => {
        const taken = await register({ name: "Copy", phone: PHONES.customer, code: "123456" });
        assert.equal(taken.status, 409);
        assert.match(taken.data.error, /phone number is already registered/);
        const [admin] = await query("SELECT user_email FROM users WHERE user_phone = $1", [PHONES.admin]);
        const email = await register({ name: "Copy", phone: "+8801799555011", email: admin.user_email, code: "123456" });
        assert.equal(email.status, 409);
    });
});
