// Phone numbers (KAN-325). A mobile number is how everyone signs in, so it is tested from every side:
//   1. the rules: every way people write a Bangladeshi number, and everything that isn't one;
//   2. properties every accepted number keeps (one stored form, idempotent, survives being shown);
//   3. the website's copy of the rules agrees with the API's, input for input, including random input;
//   4. the form's length limit fits every accepted way of writing a number;
//   5. the API: each route that takes a number treats every way of writing it as the same number.
// Runs against the real API and a throwaway database for part 5; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { PHONE_ERROR, normalisePhone, normaliseAnyPhone, displayPhone } = require("../lib/phone");
const profile = require("../lib/businessProfile");
const { apiOutput, businessChoices, call, query, startApi, stopApi } = require("./support/harness");

// ---------------------------------------------------------------- the ways people write a number

const BN = "০১২৩৪৫৬৭৮৯";
const bangla = (text) => text.replace(/[0-9]/g, (d) => BN[d]);

// Every mobile operator's prefix, 013 to 019, as the national number after the 0.
const MOBILES = ["1312345678", "1412345678", "1512345678", "1612345678", "1712345678", "1812345678", "1912345678"];

// n is the national number ("1712345678"). Each returns one way of writing it.
const MOBILE_FORMS = {
    "local": (n) => `0${n}`,
    "local, dash after the operator code": (n) => `0${n.slice(0, 4)}-${n.slice(4)}`,
    "local, spaced 3-4-4": (n) => `0${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`,
    "local, dotted": (n) => `0${n.slice(0, 2)}.${n.slice(2, 6)}.${n.slice(6)}`,
    "local, operator code in brackets": (n) => `(0${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`,
    "+880": (n) => `+880${n}`,
    "+880, spaced": (n) => `+880 ${n.slice(0, 4)}-${n.slice(4)}`,
    "+880 in brackets": (n) => `(+880) ${n.slice(0, 4)}-${n.slice(4)}`,
    "880 without +": (n) => `880${n}`,
    "00880": (n) => `00880${n}`,
    "00880, spaced": (n) => `00880 ${n.slice(0, 4)} ${n.slice(4)}`,
    "+88 and the local number": (n) => `+88 0${n}`,
    "+880 keeping the local 0": (n) => `+880 0${n.slice(0, 4)}-${n.slice(4)}`,
    "+880 (0)": (n) => `+880 (0) ${n.slice(0, 4)}-${n.slice(4)}`,
    "00880 keeping the local 0": (n) => `00880 0${n}`,
    "surrounding spaces and a tab": (n) => `  0${n}\t`,
    "non-breaking space (pasted)": (n) => `0${n.slice(0, 4)} ${n.slice(4)}`,
    "narrow non-breaking space": (n) => `+880 ${n}`,
    "zero-width space (pasted)": (n) => `0${n.slice(0, 4)}​${n.slice(4)}`,
    "byte-order mark in front (pasted)": (n) => `﻿0${n}`,
    "en dash": (n) => `0${n.slice(0, 4)}–${n.slice(4)}`,
    "em dash": (n) => `0${n.slice(0, 4)}—${n.slice(4)}`,
    "non-breaking hyphen": (n) => `0${n.slice(0, 4)}‑${n.slice(4)}`,
    "minus sign": (n) => `0${n.slice(0, 4)}−${n.slice(4)}`,
    "Bangla digits": (n) => bangla(`0${n}`),
    "Bangla digits with a dash": (n) => bangla(`0${n.slice(0, 4)}-${n.slice(4)}`),
    "Bangla digits after +880": (n) => `+${bangla(`880${n}`)}`,
    "Bangla and English digits mixed": (n) => `0${n.slice(0, 4)}${bangla(n.slice(4))}`,
};

// Landlines: business contact and second numbers only, never for signing in.
const LANDLINES = [
    // [as typed, stored]
    ["0721-775544", "+880721775544"], // Rajshahi
    ["0721 776655", "+880721776655"],
    ["+880 721 775544", "+880721775544"],
    ["০৭২১-৭৭৫৫৪৪", "+880721775544"],
    ["02-9123456", "+88029123456"], // Dhaka, 7 digits
    ["02-55012345", "+880255012345"], // Dhaka, 8 digits
    ["+880 2 9123456", "+88029123456"],
    ["031-2512345", "+880312512345"], // Chattogram
    ["00880 721 775544", "+880721775544"],
];

// Not a Bangladeshi number in any form. Refused by both rules.
const NOT_NUMBERS = [
    "", " ", "\t", "phone", "01712abc678", "abc01712345678",
    "1712345678", // no 0 and no country code
    "0171234567", "017123456789", "+880171234567", "+88017123456789", // a digit short, a digit long
    "01012345678", "01112345678", "01212345678", // 010 to 012 aren't mobile operators
    "+880 00 1712345678", "0001712345678", // too many 0s
    "+880", "+8801", "880", "00880", "0", "01",
    "++8801712345678", "017+12345678", "8801712345678+",
    "01712/345678", "01712_345678", "01712,345678", "01712;345678", // separators people don't use in numbers
    "+61412345678", "+447911123456", "+919812345678", "+14155550123", "+8613812345678", // other countries
    "٠١٧١٢٣٤٥٦٧٨", // Arabic-Indic digits, not Bangla
    "０１７１２３４５６７８", // full-width digits
    "01712345678\n01812345678", // two numbers
    "0".repeat(10_000), "0171" + "2".repeat(5_000),
];
// Not strings at all: the API gets these from malformed JSON bodies.
const NOT_STRINGS = [null, undefined, 1712345678, 8801712345678, true, {}, [], ["01712345678"], { phone: "01712345678" }];

const STORED_MOBILE = /^\+8801[3-9]\d{8}$/;

describe("1. sign-in numbers: every way of writing a mobile number", () => {
    for (const n of MOBILES) {
        for (const [form, write] of Object.entries(MOBILE_FORMS)) {
            const typed = write(n);
            it(`${JSON.stringify(typed)} (${form}) is +880${n}`, () => {
                assert.equal(normalisePhone(typed), `+880${n}`);
                assert.equal(normaliseAnyPhone(typed), `+880${n}`, "the same as a business number");
            });
        }
    }
});

describe("1. sign-in numbers: landlines, other countries and things that aren't numbers are refused", () => {
    for (const [typed] of LANDLINES) {
        it(`landline ${JSON.stringify(typed)}`, () => assert.equal(normalisePhone(typed), null));
    }
    for (const bad of [...NOT_NUMBERS, ...NOT_STRINGS]) {
        const label = typeof bad === "string" && bad.length > 40 ? `${bad.slice(0, 20)}… (${bad.length} characters)` : JSON.stringify(bad);
        it(`refuses ${label}`, () => assert.equal(normalisePhone(bad), null));
    }
    it("a 10,000-character input is refused quickly", () => {
        const started = process.hrtime.bigint();
        for (let i = 0; i < 100; i++) normalisePhone("0".repeat(10_000));
        assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 500, "100 tries in under half a second");
    });
});

describe("1. business numbers: mobiles and landlines", () => {
    for (const [typed, stored] of LANDLINES) {
        it(`${JSON.stringify(typed)} is ${stored}`, () => assert.equal(normaliseAnyPhone(typed), stored));
    }
    for (const bad of [...NOT_NUMBERS, ...NOT_STRINGS, "0721", "07217", "0121234567", "0012345678"]) {
        const label = typeof bad === "string" && bad.length > 40 ? `${bad.slice(0, 20)}… (${bad.length} characters)` : JSON.stringify(bad);
        it(`refuses ${label}`, () => assert.equal(normaliseAnyPhone(bad), null));
    }
    it("the business form uses the same rules", () => assert.equal(profile.normalisePhone, normaliseAnyPhone));
});

// ---------------------------------------------------------------- properties

const EVERY_MOBILE_INPUT = MOBILES.flatMap((n) => Object.values(MOBILE_FORMS).map((write) => write(n)));
const EVERY_INPUT = [...EVERY_MOBILE_INPUT, ...LANDLINES.map(([typed]) => typed), ...NOT_NUMBERS];

describe("2. properties every accepted number keeps", () => {
    it("a sign-in number is always stored as +8801 and nine digits, operator 3 to 9", () => {
        for (const typed of EVERY_MOBILE_INPUT) assert.match(normalisePhone(typed), STORED_MOBILE, typed);
    });

    it("normalising a stored number gives it back unchanged (idempotent)", () => {
        for (const typed of EVERY_INPUT) {
            const stored = normaliseAnyPhone(typed);
            if (stored) assert.equal(normaliseAnyPhone(stored), stored, typed);
            const mobile = normalisePhone(typed);
            if (mobile) assert.equal(normalisePhone(mobile), mobile, typed);
        }
    });

    it("every sign-in number is also a valid business number, the same one", () => {
        for (const typed of EVERY_INPUT) {
            const mobile = normalisePhone(typed);
            if (mobile) assert.equal(normaliseAnyPhone(typed), mobile, typed);
        }
    });

    it("a number as shown in emails can be typed back and is the same number", () => {
        for (const typed of EVERY_INPUT) {
            const stored = normaliseAnyPhone(typed);
            if (stored) assert.equal(normaliseAnyPhone(displayPhone(stored)), stored, `${typed} shown as ${displayPhone(stored)}`);
        }
    });

    it("all ways of writing one number are one stored number", () => {
        for (const n of MOBILES) {
            const stored = new Set(Object.values(MOBILE_FORMS).map((write) => normalisePhone(write(n))));
            assert.deepEqual([...stored], [`+880${n}`]);
        }
    });

    it("the error message describes what the +880 box needs, and its example is accepted", () => {
        assert.match(PHONE_ERROR, /Bangladesh mobile number/);
        assert.match(PHONE_ERROR, /10 digits after \+880/);
        const example = /such as ([\d-]+)/.exec(PHONE_ERROR)[1];
        assert.equal(normalisePhone(`+880${example}`), "+8801712345678");
    });
});

// ---------------------------------------------------------------- the website agrees with the API

describe("3. the website's copy of the rules (lib/format.ts) agrees with the API's", () => {
    let web;
    before(async () => {
        web = await import("../../frontend/shahebbazar/lib/format.ts");
    });

    it("on every listed input", () => {
        for (const typed of EVERY_INPUT) assert.equal(web.toStoredPhone(typed), normaliseAnyPhone(typed), JSON.stringify(typed));
    });

    it("on 20,000 random strings made of digits, separators and signs", () => {
        // A fixed seed, so a failure can be reproduced.
        let seed = 325;
        const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
        const pieces = ["0", "1", "3", "7", "8", "9", "880", "+", "+880", "00", "01", "017", " ", "-", ".", "(", ")", " ", "–", "০", "১", "৭", "৮", "a", "/"];
        let accepted = 0;
        for (let i = 0; i < 20_000; i++) {
            let typed = "";
            const parts = 1 + Math.floor(random() * 14);
            for (let p = 0; p < parts; p++) typed += pieces[Math.floor(random() * pieces.length)];
            const api = normaliseAnyPhone(typed);
            assert.equal(web.toStoredPhone(typed), api, JSON.stringify(typed));
            if (api) {
                accepted += 1;
                assert.match(api, /^\+880[1-9]\d{6,9}$/, JSON.stringify(typed));
            }
        }
        assert.ok(accepted > 0, "some random strings are numbers");
    });

    it("shows a stored number the same way as the API's emails do", () => {
        for (const typed of EVERY_INPUT) {
            const stored = normaliseAnyPhone(typed);
            if (stored) assert.equal(web.formatPhone(stored), displayPhone(stored), stored);
        }
    });
});

// ---------------------------------------------------------------- the +880 box

describe("4. the +880 box (components/auth/phoneInput.ts) sends what the API expects", () => {
    let box;
    before(async () => {
        box = await import("../../frontend/shahebbazar/components/auth/phoneInput.ts");
    });
    // What the form sends after someone types or pastes `typed` into the box.
    const sent = (typed) => box.toSubmitted(box.toNational(typed));
    // The ASCII digits in what was typed, Bangla digits included.
    const digitsOf = (typed) => typed.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6)).replace(/\D/g, "");

    it("every way of writing a mobile number, typed or pasted into the box, sends that number", () => {
        for (const typed of EVERY_MOBILE_INPUT) assert.equal(sent(typed), normalisePhone(typed), JSON.stringify(typed));
    });

    it("the box never adds, drops or changes a digit: a number it sends is the digits typed, after 0, 880 or 00880", () => {
        const check = (typed) => {
            const number = normalisePhone(sent(typed));
            if (!number) return;
            const n = number.slice(4);
            const typedDigits = digitsOf(typed);
            const allowed = [n, `0${n}`, `880${n}`, `8800${n}`, `00880${n}`, `008800${n}`];
            assert.ok(allowed.includes(typedDigits), `${JSON.stringify(typed)} was sent as ${number}`);
        };
        for (const typed of EVERY_INPUT) check(typed);
        let seed = 880;
        const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
        const pieces = ["0", "1", "7", "8", "880", "+", "00", "01", "017", "12345678", " ", "-", "০", "১", "৭", "a"];
        for (let i = 0; i < 20_000; i++) {
            let typed = "";
            for (let p = 1 + Math.floor(random() * 10); p > 0; p--) typed += pieces[Math.floor(random() * pieces.length)];
            check(typed);
        }
    });

    it("a digit too many is kept, so the number is refused rather than quietly becoming another one", () => {
        assert.equal(box.toNational("017123456789"), "17123456789");
        assert.equal(normalisePhone(sent("017123456789")), null);
        assert.equal(normalisePhone(sent("+880 1712-3456789")), null);
    });

    it("what isn't a mobile number stays refused after the box", () => {
        for (const typed of ["0721-775544", "+44 7911 123456", "01212345678", "0171234567", "phone", "", "٠١٧١٢٣٤٥٦٧٨", "+880 00 1712345678", "0001712345678"]) {
            assert.equal(normalisePhone(sent(typed)), null, typed);
        }
        assert.equal(sent(""), "", "an empty box sends nothing, so the API says what is needed");
    });

    it("shows the number grouped after the operator code, in Bangla digits on the Bangla pages", () => {
        assert.equal(box.displayNational("1712345678"), "1712-345678");
        assert.equal(box.displayNational("1712345678", "bn"), "১৭১২-৩৪৫৬৭৮");
        assert.equal(box.displayNational("171"), "171");
        assert.equal(box.displayNational(""), "");
        assert.equal(box.toNational(box.displayNational("1712345678", "bn")), "1712345678", "what it shows reads back the same");
    });

    it("puts the cursor after the same digit once the dash appears", () => {
        assert.deepEqual([0, 3, 4, 5, 10].map(box.caretAfter), [0, 3, 4, 6, 11]);
    });
});

// ---------------------------------------------------------------- the API

// Requests a code with the number written one way, and reads it from the API log, where it is printed
// under the stored number.
async function codeFor(typed, stored, purpose, expectedRole) {
    const from = apiOutput().length;
    const res = await call("POST", "/auth/request-verification", { json: { phone: typed, purpose, expectedRole } });
    assert.equal(res.status, 201, `request-verification for ${JSON.stringify(typed)}: ${JSON.stringify(res.data)}`);
    const pattern = new RegExp(
        `\\[mock verification\\] phone: ${stored.replace("+", "\\+")}\\s+\\[mock verification\\] purpose: ${purpose}\\s+\\[mock verification\\] code: (\\d{6})`
    );
    for (let i = 0; i < 60; i++) {
        const match = apiOutput().slice(from).match(pattern);
        if (match) return match[1];
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`No code for ${stored} in the API log`);
}
const usersWith = async (stored) => (await query("SELECT user_id, user_language FROM users WHERE user_phone = $1", [stored]));
const latestOtpPhone = async () => (await query("SELECT otp_phone FROM otp_codes ORDER BY otp_id DESC LIMIT 1"))[0].otp_phone;

describe("5. the API treats every way of writing a number as the same number", () => {
    let choices;
    before(async () => {
        await startApi();
        choices = await businessChoices();
    });
    after(stopApi);

    it("a code request stores the number in its one form, whichever way it was written", async () => {
        // A different number per request, so the three-a-window limit isn't reached.
        const writes = Object.entries(MOBILE_FORMS);
        for (let i = 0; i < writes.length; i++) {
            const n = `15${String(10000000 + i).slice(-8)}`;
            const [form, write] = writes[i];
            const res = await call("POST", "/auth/request-verification", { json: { phone: write(n), purpose: "register" } });
            assert.equal(res.status, 201, `${form}: ${JSON.stringify(res.data)}`);
            assert.equal(await latestOtpPhone(), `+880${n}`, form);
        }
    });

    it("writing the number differently doesn't get round the limit of three codes", async () => {
        const n = "1599000001";
        for (const typed of [`0${n}`, `+880 ${n}`, bangla(`0${n}`)]) {
            assert.equal((await call("POST", "/auth/request-verification", { json: { phone: typed, purpose: "register" } })).status, 201, typed);
        }
        const fourth = await call("POST", "/auth/request-verification", { json: { phone: `00880-${n}`, purpose: "register" } });
        assert.equal(fourth.status, 429, "a fourth code in another format is refused");
    });

    it("refuses what isn't a mobile number on every route that takes one, with the same message", async () => {
        for (const bad of ["0721-775544", "01212345678", "+447911123456", "abc", "", null, 1712345678, ["01712345678"]]) {
            const label = JSON.stringify(bad);
            const requested = await call("POST", "/auth/request-verification", { json: { phone: bad, purpose: "register" } });
            assert.deepEqual([requested.status, requested.data.error], [400, PHONE_ERROR], `request-verification ${label}`);
            const verified = await call("POST", "/auth/verify", { json: { phone: bad, purpose: "login", expectedRole: "customer", code: "123456" } });
            assert.deepEqual([verified.status, verified.data.error], [400, PHONE_ERROR], `verify ${label}`);
            const customer = await call("POST", "/auth/register/customer", { json: { name: "Nobody", phone: bad, code: "123456" } });
            assert.deepEqual([customer.status, customer.data.error], [400, PHONE_ERROR], `register/customer ${label}`);
            const vendor = await call("POST", "/auth/register/vendor", { json: { vendor_name: "Nobody's Shop", vendor_phone: bad, ...choices, code: "123456" } });
            assert.equal(vendor.status, 400, `register/vendor ${label}`);
            if (bad !== "" && bad !== null) assert.equal(vendor.data.error, PHONE_ERROR, `register/vendor ${label}`);
            const invite = await call("POST", "/vendors/1/members", { as: "owner", json: { phone: bad } });
            assert.deepEqual([invite.status, invite.data.error], [400, PHONE_ERROR], `team invite ${label}`);
        }
    });

    it("a customer registered in Bangla digits signs in with English digits, and the other way round", async () => {
        const stored = "+8801788000001";
        const code = await codeFor("০১৭৮৮-০০০০০১", stored, "register");
        const registered = await call("POST", "/auth/register/customer", { json: { name: "Bangla Digits", phone: "০১৭৮৮-০০০০০১", code } });
        assert.equal(registered.status, 201, JSON.stringify(registered.data));
        assert.equal(registered.data.user.user_phone, stored);
        assert.equal((await usersWith(stored)).length, 1);

        for (const typed of ["01788000001", "+880 1788-000001", "০১৭৮৮ ০০০০০১", "00880 01788 000001"]) {
            const loginCode = await codeFor(typed, stored, "login", "customer");
            const verified = await call("POST", "/auth/verify", { json: { phone: typed, purpose: "login", expectedRole: "customer", code: loginCode } });
            assert.equal(verified.status, 200, `${typed}: ${JSON.stringify(verified.data)}`);
            assert.equal(verified.data.user.user_phone, stored, typed);
            // A fresh number of codes for the next format.
            await query("DELETE FROM otp_codes WHERE otp_phone = $1", [stored]);
        }
    });

    it("a code sent to one way of writing a number works with another way of writing it", async () => {
        const stored = "+8801788000002";
        const code = await codeFor("01788-000002", stored, "register");
        const res = await call("POST", "/auth/register/customer", { json: { name: "Cross Format", phone: "+880 1788 000002", code } });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.user.user_phone, stored);
    });

    it("a number can't be registered twice by writing it differently, as a customer or as a business", async () => {
        const stored = "+8801788000003";
        const code = await codeFor("01788000003", stored, "register");
        assert.equal((await call("POST", "/auth/register/customer", { json: { name: "First", phone: "01788000003", code } })).status, 201);

        for (const typed of ["+880 1788-000003", "০১৭৮৮০০০০০৩", "008801788000003", "+880 01788 000003"]) {
            const again = await codeFor(typed, stored, "register");
            const customer = await call("POST", "/auth/register/customer", { json: { name: "Second", phone: typed, code: again } });
            assert.equal(customer.status, 409, `customer ${typed}`);
            assert.match(customer.data.error, /already registered/);
            const business = await call("POST", "/auth/register/vendor", { json: { vendor_name: "Second Shop", vendor_phone: typed, ...choices, code: again } });
            assert.equal(business.status, 409, `business ${typed}`);
            await query("DELETE FROM otp_codes WHERE otp_phone = $1", [stored]);
        }
        assert.equal((await usersWith(stored)).length, 1, "still one account");
    });

    it("a business registered with a pasted number (non-breaking space, en dash) is stored in the one form", async () => {
        const stored = "+8801788000004";
        const typed = "+880 1788–000004";
        const code = await codeFor(typed, stored, "register");
        const res = await call("POST", "/auth/register/vendor", { json: { vendor_name: "Pasted Number Shop", vendor_phone: typed, ...choices, code } });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.vendor.vendor_phone, stored);
        assert.equal((await usersWith(stored)).length, 1);
    });

    it("the owner adds a team member by their number written any way", async () => {
        // The seeded customer2, +8801722000002, written in Bangla digits with spaces.
        const res = await call("POST", "/vendors/1/members", { as: "owner", json: { phone: "০১৭ ২২০০ ০০০২" } });
        assert.ok([200, 201].includes(res.status), JSON.stringify(res.data));
        const [member] = await query(
            `SELECT m.member_role FROM vendor_members m JOIN users u USING (user_id)
             WHERE m.vendor_id = 1 AND u.user_phone = '+8801722000002'`
        );
        assert.equal(member?.member_role, "manager");
        await query("DELETE FROM vendor_members WHERE vendor_id = 1 AND user_id = (SELECT user_id FROM users WHERE user_phone = '+8801722000002')");
    });

    it("the business form saves contact and second numbers in the one form, from any way of writing them", async () => {
        const { errors, value } = profile.validateProfile({
            name: "Shop", category_ids: [1], location_id: 1, address: "Shaheb Bazar Road",
            description: "A shop selling mangoes in Rajshahi.", hours: [],
            phone: "০১৭১২ ৩৪৫৬৭৮", alt_phone: "+880 (0) 721–775544", alt_phone_type: "landline",
        });
        assert.equal(errors.phone, undefined);
        assert.equal(errors.alt_phone, undefined);
        assert.deepEqual([value.phone, value.altPhone], ["+8801712345678", "+880721775544"]);
    });
});
