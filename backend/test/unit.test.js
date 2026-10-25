// Unit tests for pure helpers: no database or API needed, so they run in milliseconds.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { normalisePhone: accountPhone } = require("../lib/phone");
const { parseId, cleanText } = require("../lib/currentUser");
const profile = require("../lib/businessProfile");
const { ROLES, FEATURES, can, requireFeature } = require("../lib/access");
const { normaliseQuery } = require("../routes/analytics");

describe("account phone numbers (sign-in)", () => {
    const cases = [
        ["01712345678", "+8801712345678"],
        ["8801712345678", "+8801712345678"],
        ["+880 1712-345678", "+8801712345678"],
        ["008801712345678", "+8801712345678"],
        ["(017) 1234-5678", "+8801712345678"],
    ];
    for (const [input, expected] of cases) {
        it(`${input} -> ${expected}`, () => assert.equal(accountPhone(input), expected));
    }
    // Sign-in codes go by SMS through a Bangladeshi provider, so foreign numbers and landlines are refused.
    for (const bad of ["", "12345", "+0123456789", "phone", null, 1712345678, "0412345678", "+61412345678", "+447911123456", "01212345678", "0721776655"]) {
        it(`refuses ${JSON.stringify(bad)}`, () => assert.equal(accountPhone(bad), null));
    }
});

describe("business phone numbers (profile form)", () => {
    it("accepts Bangladeshi mobiles and landlines in any common format", () => {
        assert.equal(profile.normalisePhone("01712-345678"), "+8801712345678");
        assert.equal(profile.normalisePhone("+880 1912 345678"), "+8801912345678");
        assert.equal(profile.normalisePhone("0721-776655"), "+880721776655");
    });
    it("refuses invalid mobiles and foreign numbers", () => {
        for (const bad of ["01212345678", "0171234567", "+61412345678", "abc"]) assert.equal(profile.normalisePhone(bad), null, bad);
    });
    it("the main contact number must be a mobile; a landline can only be the second number", () => {
        const base = { name: "Shop", category_ids: [1], location_id: 1, address: "Shaheb Bazar Road", description: "A shop selling mangoes in Rajshahi.", hours: [] };
        assert.match(profile.validateProfile({ ...base, phone: "0721-775544" }).errors.phone, /must be a mobile number/);
        assert.equal(profile.validateProfile({ ...base, phone: "01712-345678" }).errors.phone, undefined);
    });

    it("a second number is optional, must match its type, and can't repeat the contact number", () => {
        const base = { name: "Shop", category_ids: [1], location_id: 1, address: "Shaheb Bazar Road", phone: "01712-345678", description: "A shop selling mangoes in Rajshahi.", hours: [] };
        const check = (alt_phone, alt_phone_type) => profile.validateProfile({ ...base, alt_phone, alt_phone_type });
        assert.deepEqual([check("0721-775544", "landline").value.altPhone, check("0721-775544", "landline").value.altPhoneType], ["+880721775544", "landline"]);
        assert.deepEqual([check("01811-223344", "mobile").value.altPhone, check("01811-223344", "mobile").value.altPhoneType], ["+8801811223344", "mobile"]);
        assert.deepEqual([check("", "mobile").value.altPhone, check("", "mobile").value.altPhoneType], [null, null]);
        const wa = check("01811-223344", "whatsapp").value;
        assert.deepEqual([wa.altPhone, wa.altPhoneType, wa.whatsapp], ["+8801811223344", "whatsapp", "+8801811223344"], "a WhatsApp second number is also the WhatsApp number");
        assert.equal(check("0721-775544", "landline").value.whatsapp, null);
        assert.ok(check("12345", "landline").errors.alt_phone);
        assert.match(check("01811-223344", "landline").errors.alt_phone, /That's a mobile number/);
        assert.match(check("0721-775544", "mobile").errors.alt_phone, /That's a landline number/);
        assert.match(check("+8801712345678", "mobile").errors.alt_phone, /same as your contact number/);
    });
});

describe("main phone numbers as shown: mobiles in full, landlines with their area code", () => {
    const { displayPhone } = require("../lib/phone");
    for (const [stored, shown] of [
        ["+8801712345678", "+8801712345678"],
        ["+880721775544", "0721-775544"],
        ["+88029123456", "02-9123456"],
        ["+61412345678", "+61412345678"],
        [null, null],
    ]) {
        it(`${stored} -> ${shown}`, () => assert.equal(displayPhone(stored), shown));
    }
});

describe("web addresses and social links", () => {
    it("stores websites without the scheme", () => {
        assert.equal(profile.normaliseWebsite("https://www.example.com/"), "www.example.com");
        assert.equal(profile.normaliseWebsite("example.com/shop?x=1"), "example.com/shop?x=1");
    });
    it("refuses non-web schemes, credentials and hosts without a dot", () => {
        for (const bad of ["javascript:alert(1)", "ftp://example.com", "https://user:pw@example.com", "localhost", ""]) {
            assert.equal(profile.normaliseWebsite(bad), null, bad);
        }
    });
    it("social links must be a profile on that platform's own domain", () => {
        assert.equal(profile.normaliseSocial("facebook", "fb.com/shop"), "https://fb.com/shop");
        assert.equal(profile.normaliseSocial("instagram", "https://www.instagram.com/shop/#top"), "https://www.instagram.com/shop/");
        assert.equal(profile.normaliseSocial("facebook", "https://instagram.com/shop"), null, "wrong platform");
        assert.equal(profile.normaliseSocial("facebook", "https://facebook.com.evil.example/shop"), null, "look-alike domain");
        assert.equal(profile.normaliseSocial("youtube", "https://youtube.com/"), null, "the site, not a profile");
    });
});

describe("opening hours", () => {
    it("accepts HH:MM and HH:MM:SS within the day", () => {
        assert.equal(profile.normaliseTime("09:30"), "09:30");
        assert.equal(profile.normaliseTime("23:59:59"), "23:59");
        for (const bad of ["24:00", "9:30", "12:60", "noon"]) assert.equal(profile.normaliseTime(bad), null, bad);
    });

    const base = {
        name: "Test Shop", category_ids: [1], location_id: 1, address: "1 Station Road", phone: "01712345678",
        description: "A shop that sells useful things to the people of Rajshahi.",
    };
    it("a closing time before opening is an error; closed and 24-hour days need no times", () => {
        const { errors, value } = profile.validateProfile({
            ...base,
            hours: [
                { day: 0, mode: "closed" },
                { day: 1, mode: "24h" },
                { day: 2, mode: "open", open: "22:00", close: "02:00" },
                { day: 3, mode: "open", open: "09:00", close: "17:00" },
            ],
        });
        assert.deepEqual(Object.keys(errors), ["hours.2"]);
        assert.deepEqual(value.hours.map((h) => h.mode), ["closed", "24h", "open"]);
    });
    it("a repeated or out-of-range day means the form is malformed", () => {
        assert.ok(profile.validateProfile({ ...base, hours: [{ day: 1, mode: "closed" }, { day: 1, mode: "closed" }] }).errors.hours);
        assert.ok(profile.validateProfile({ ...base, hours: [{ day: 7, mode: "closed" }] }).errors.hours);
    });
    it("a complete, valid form has no errors", () => {
        assert.deepEqual(profile.validateProfile(base).errors, {});
    });
    it("empty detail rows are ignored, half-filled ones are errors", () => {
        const { errors, value } = profile.validateProfile({
            ...base, facts: [{ label: "", value: "" }, { label: "Parking", value: "" }],
        });
        assert.deepEqual(value.facts.length, 1);
        assert.ok(errors["facts.1.value"]);
    });
});

describe("request helpers", () => {
    it("parseId accepts positive 32-bit integers only", () => {
        assert.equal(parseId("42"), 42);
        assert.equal(parseId(7), 7);
        for (const bad of ["0", "-1", "1.5", "1e3", "2147483648", "", "abc", null, " 1"]) assert.equal(parseId(bad), null, String(bad));
    });
    it("cleanText trims strings and rejects anything else", () => {
        assert.equal(cleanText("  hi  "), "hi");
        assert.equal(cleanText(5), null);
    });
});

describe("search query normalising (trends)", () => {
    it("folds case, drops punctuation and collapses spaces, keeping Bangla", () => {
        assert.equal(normaliseQuery("  Langra   MANGO!! "), "langra mango");
        assert.equal(normaliseQuery("আম, লিচু"), "আম লিচু");
        assert.equal(normaliseQuery("?!"), "");
    });
});

describe("role and feature access matrix", () => {
    it("every feature has a label and only known roles", () => {
        for (const [key, feature] of Object.entries(FEATURES)) {
            assert.ok(feature.label, key);
            for (const role of feature.roles) assert.ok(ROLES.includes(role), `${key}: ${role}`);
        }
    });
    it("admin features are admin-only and guests reach only public features", () => {
        for (const [key, feature] of Object.entries(FEATURES)) {
            if (key.startsWith("admin.")) assert.deepEqual(feature.roles, ["admin"], key);
        }
        const guest = Object.keys(FEATURES).filter((k) => can("guest", k));
        assert.deepEqual(guest.sort(), ["business.register", "directory.browse"]);
    });
    it("a route naming an unknown feature fails at startup, not at request time", () => {
        assert.throws(() => requireFeature("no.such.feature"), /Unknown feature/);
    });
    it("every requireFeature(...) in the routes names a feature that exists", () => {
        const dir = path.join(__dirname, "..", "routes");
        for (const file of fs.readdirSync(dir)) {
            const src = fs.readFileSync(path.join(dir, file), "utf8");
            for (const m of src.matchAll(/requireFeature\("([^"]+)"\)/g)) assert.ok(FEATURES[m[1]], `${file}: ${m[1]}`);
        }
    });
    it("docs/ACCESS-MATRIX.md matches lib/access.js (run npm run docs:access after changing the matrix)", () => {
        const doc = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "ACCESS-MATRIX.md"), "utf8");
        for (const [key, feature] of Object.entries(FEATURES)) {
            const row = doc.split("\n").find((line) => line.includes(`(\`${key}\`)`));
            assert.ok(row, `${key} is missing from docs/ACCESS-MATRIX.md`);
            const cells = row.split("|").map((c) => c.trim());
            ROLES.forEach((role, i) => assert.equal(cells[2 + i], feature.roles.includes(role) ? "Yes" : "-", `${key} / ${role}`));
        }
    });
});

describe("Marketing workspace switch (KAN-285)", () => {
    const { workspaceEnabled } = require("../services/marketing/campaigns");
    const saved = process.env.MARKETING_WORKSPACE_ENABLED;
    const withValue = (value) => {
        if (value === undefined) delete process.env.MARKETING_WORKSPACE_ENABLED;
        else process.env.MARKETING_WORKSPACE_ENABLED = value;
        const on = workspaceEnabled();
        if (saved === undefined) delete process.env.MARKETING_WORKSPACE_ENABLED;
        else process.env.MARKETING_WORKSPACE_ENABLED = saved;
        return on;
    };

    it("is on by default, and off only when set to false", () => {
        assert.equal(withValue(undefined), true);
        assert.equal(withValue("true"), true);
        assert.equal(withValue(""), true);
        assert.equal(withValue("false"), false);
    });
});

describe("campaign email text as HTML", () => {
    const { bodyHtml } = require("../services/marketing/emailMessage");

    it("shows links as words, not raw addresses, and keeps the tracked address in the link", () => {
        const html = bodyHtml("See more: https://shahebbazar.com/business/mango?from=email&c=3", () => "our page on Shaheb Bazar");
        assert.equal(html, 'See more: <a href="https://shahebbazar.com/business/mango?from=email&amp;c=3" style="color:#1d4ed8;font-weight:bold">our page on Shaheb Bazar</a>');
    });

    it("an address without its own words is shortened", () => {
        assert.match(bodyHtml("Tickets: https://www.tickets.example.com/mango/?ref=1"), />tickets\.example\.com\/mango<\/a>$/);
    });

    it("makes Bangladeshi mobile numbers tap to call, but not numbers inside a link", () => {
        const html = bodyHtml("Call us on 01711-000005 or +8801711000006. https://example.com/01711000007");
        assert.ok(html.includes('<a href="tel:+8801711000005" style="color:#1d4ed8;font-weight:bold">01711-000005</a>'));
        assert.ok(html.includes('<a href="tel:+8801711000006" style="color:#1d4ed8;font-weight:bold">+8801711000006</a>'));
        assert.ok(!html.includes("tel:+8801711000007"));
    });
});
