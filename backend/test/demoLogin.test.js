// Test server sign-in: with DEMO_LOGIN_CODE set, every sign-in code issued is that code, so the team
// can sign in to the demo accounts without SMS. Wrong codes and the request limits still apply.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { call, startApi, stopApi, PHONES } = require("./support/harness");

const DEMO = "246810";

before(() => startApi({ DEMO_LOGIN_CODE: DEMO }));
after(stopApi);

const request = (phone, expectedRole) =>
    call("POST", "/auth/request-verification", { json: { phone, purpose: "login", expectedRole } });
const verify = (phone, expectedRole, code) =>
    call("POST", "/auth/verify", { json: { phone, purpose: "login", expectedRole, code } });

describe("demo sign-in code", () => {
    it("signs in with the demo code", async () => {
        assert.equal((await request(PHONES.customer, "customer")).status, 201);
        const res = await verify(PHONES.customer, "customer", DEMO);
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.match(res.headers.get("set-cookie") ?? "", /^shaheb_session=/);
    });

    it("still refuses a wrong code", async () => {
        assert.equal((await request(PHONES.owner, "vendor")).status, 201);
        assert.notEqual((await verify(PHONES.owner, "vendor", "000000")).status, 200);
    });
});
