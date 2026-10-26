// Sign-in codes by SMS (KAN-278): the API sends them through BulkSMSBD when it's configured. A stand-in
// for BulkSMSBD's API records each request and answers as the real one does, so nothing is ever sent.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { PHONES, query, call, apiOutput, startApi, stopApi } = require("./support/harness");
const { codeMessage, providerNumber } = require("../integrations/sms");

const KEY = "test-sms-key-not-real";
const SENDER = "8809617634406";
const received = []; // each request's form fields
let answer = { response_code: 202, success_message: "SMS Submitted Successfully", error_message: "" };
let provider;

before(async () => {
    provider = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            received.push({ method: req.method, type: req.headers["content-type"], ...Object.fromEntries(new URLSearchParams(body)) });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(answer));
        });
    });
    await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
    await startApi(
        { SMS_PROVIDER: "bulksmsbd", SMS_API_KEY: KEY, SMS_SENDER_ID: SENDER, SMS_API_URL: `http://127.0.0.1:${provider.address().port}/api/smsapi` },
        { signInAll: false }
    );
});

after(async () => {
    await stopApi();
    await new Promise((resolve) => provider.close(resolve));
});

const request = (json) => call("POST", "/auth/request-verification", { json: { purpose: "login", expectedRole: "vendor", phone: PHONES.owner, ...json } });
const codeIn = (message) => message.match(/\d{6}/)[0];
const otpRows = async (phone) => (await query("SELECT count(*)::int AS n FROM otp_codes WHERE otp_phone = $1", [phone]))[0].n;

describe("sign-in codes by SMS", () => {
    it("sends the code through BulkSMSBD, and that code signs in", async () => {
        answer = { response_code: 202, success_message: "SMS Submitted Successfully", error_message: "" };
        const res = await request({});
        assert.equal(res.status, 201, JSON.stringify(res.data));
        const sms = received.at(-1);
        assert.equal(sms.method, "POST");
        assert.match(sms.type, /application\/x-www-form-urlencoded/);
        assert.deepEqual([sms.api_key, sms.senderid, sms.number], [KEY, SENDER, "8801711000005"], "the number without the +");
        assert.match(sms.message, /^Your Shahebbazar code is \d{6}\. It expires in 5 minutes\./);
        assert.doesNotMatch(apiOutput(), /\[mock verification\] code/, "not printed when it's sent by SMS");

        const verified = await call("POST", "/auth/verify", {
            json: { phone: PHONES.owner, purpose: "login", expectedRole: "vendor", code: codeIn(sms.message) },
        });
        assert.equal(verified.status, 200, JSON.stringify(verified.data));
    });

    it("is in Bangla for someone using the site in Bangla, or who prefers Bangla", async () => {
        await request({ language: "bn" });
        assert.match(received.at(-1).message, /^সাহেব বাজার কোড: \d{6}।/);

        await query("UPDATE users SET user_language = 'bn' WHERE user_phone = $1", [PHONES.customer]);
        await request({ phone: PHONES.customer, expectedRole: "customer" });
        assert.match(received.at(-1).message, /^সাহেব বাজার কোড/, "from My details, even on the English site");
        await query("UPDATE users SET user_language = 'en' WHERE user_phone = $1", [PHONES.customer]);
    });

    it("when BulkSMSBD refuses, says so, keeps no code, and logs why without the key", async () => {
        answer = { response_code: 1007, success_message: "", error_message: "Balance Insufficient" };
        const before = await otpRows(PHONES.admin);
        const res = await request({ phone: PHONES.admin, expectedRole: "admin" });
        assert.equal(res.status, 502);
        assert.match(res.data.error, /couldn't send the code/);
        assert.equal(await otpRows(PHONES.admin), before, "the unsent code is removed, so it doesn't count towards the limit");
        assert.match(apiOutput(), /\[sms\] sending the login code to \+8801711000001 failed: BulkSMSBD refused the SMS: 1007 balance insufficient/);
        assert.doesNotMatch(apiOutput(), new RegExp(KEY), "the API key is never logged");
    });

    it("names the IP whitelist when that's the reason", async () => {
        answer = { response_code: 1032, success_message: "", error_message: "IP Not whitelisted" };
        assert.equal((await request({ phone: PHONES.admin, expectedRole: "admin" })).status, 502);
        assert.match(apiOutput(), /1032 this server's IP address is not whitelisted/);
    });
});

describe("the SMS text", () => {
    it("fits one SMS in English and two in Bangla", () => {
        const english = codeMessage("123456", { minutes: 5 });
        assert.ok(english.length <= 160, `${english.length} characters`);
        assert.match(english, /^[\x20-\x7e]+$/, "plain characters only, so it isn't sent as Unicode");
        const bangla = codeMessage("123456", { language: "bn", minutes: 5 });
        assert.ok(bangla.length <= 134, `${bangla.length} characters (Unicode SMS: 67 a part when split)`);
    });

    it("sends numbers in BulkSMSBD's form", () => {
        assert.equal(providerNumber("+8801712345678"), "8801712345678");
    });
});
