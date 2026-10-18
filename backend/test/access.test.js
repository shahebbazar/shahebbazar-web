// Role and ownership checks for every signed-in API route outside listings
// (listings and business images are covered in listings.test.js).
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { PHONES, ROLES, query, call, signIn, startApi, stopApi, userIdOf } = require("./support/harness");

const OWNED = 1; // business 1 belongs to the "owner" account
const OTHER = 6; // business 6 belongs to "otherVendor"

// Filled in before the tests run.
const ids = {};

before(async () => {
    await startApi();

    // A second admin, so the audit tests can tell "the signed-in admin" apart from "the first admin".
    PHONES.secondAdmin = "+8801711000099";
    ROLES.secondAdmin = "admin";
    await query(
        `INSERT INTO users (user_phone, user_name, user_role, user_phone_verified_at)
         VALUES ($1, 'Second Admin', 'admin', NOW())`,
        [PHONES.secondAdmin]
    );
    await signIn("secondAdmin");

    // Conversations from the customer to the owner's business and to another business.
    for (const [key, vendorId] of [["conversation", OWNED], ["otherConversation", OTHER]]) {
        const sent = await call("POST", "/me/conversations", {
            as: "customer",
            json: { vendor_id: vendorId, body: `Hello business ${vendorId}` },
        });
        assert.equal(sent.status, 201, JSON.stringify(sent.data));
        ids[key] = sent.data.conversation_id;
    }

    ids.review = (await query(
        "SELECT review_id FROM reviews WHERE vendor_id = $1 AND review_status = 'published' ORDER BY review_id LIMIT 1",
        [OWNED]
    ))[0].review_id;
    ids.category = (await query("SELECT category_id FROM categories ORDER BY category_id LIMIT 1"))[0].category_id;
    ids.report = (await query("SELECT report_id FROM reports ORDER BY report_id LIMIT 1"))[0]?.report_id ?? 1;
});

after(stopApi);

// ---------- the role matrix ----------

// [label, method, path, body]. Bodies are valid, so an allowed caller would succeed.
const OWNER_OR_ADMIN = [
    ["dashboard", "GET", () => `/vendors/${OWNED}/dashboard`],
    ["business summary", "GET", () => `/vendors/${OWNED}/summary`],
    ["business profile", "GET", () => `/vendors/${OWNED}/profile`],
    ["payment methods", "GET", () => `/vendors/${OWNED}/payment-methods`],
    ["save payment methods", "PUT", () => `/vendors/${OWNED}/payment-methods`, { methods: [{ payment_method: "cash" }] }],
    ["owner details", "GET", () => `/vendors/${OWNED}/owner`],
    ["save owner details", "PUT", () => `/vendors/${OWNED}/owner`, { user_name: "Changed Name" }],
    ["business reviews", "GET", () => `/vendors/${OWNED}/reviews`],
];

const OWNER_ONLY = [
    ["conversations", "GET", () => `/vendors/${OWNED}/conversations`],
    ["one conversation", "GET", () => `/vendors/${OWNED}/conversations/${ids.conversation}`],
    ["reply to a conversation", "POST", () => `/vendors/${OWNED}/conversations/${ids.conversation}/messages`, { body: "Hi" }],
    ["business alerts", "GET", () => `/vendors/${OWNED}/alerts`],
    ["mark business alerts read", "POST", () => `/vendors/${OWNED}/alerts/read`],
    ["reply to a review", "PUT", () => `/vendors/${OWNED}/reviews/${ids.review}/reply`, { reply: "Thanks" }],
];

const ADMIN_ONLY = [
    ["approval queue", "GET", () => "/admin/queue"],
    ["decide a business", "POST", () => "/admin/vendors/1/decision", { decision: "approve" }],
    ["decide a listing", "POST", () => "/admin/listings/1/decision", { decision: "approve" }],
    ["categories", "GET", () => "/admin/categories"],
    ["add a category", "POST", () => "/admin/categories", { name: "Blocked Category" }],
    ["edit a category", "PUT", () => `/admin/categories/${ids.category}`, { name: "Blocked Edit", is_active: true }],
    ["reports", "GET", () => "/admin/reports"],
    ["resolve a report", "POST", () => `/admin/reports/${ids.report}/resolve`, { action: "dismiss" }],
    ["reviews to moderate", "GET", () => "/admin/reviews"],
    ["hide a review", "POST", () => `/admin/reviews/${ids.review}/status`, { status: "hidden" }],
    ["search trends", "GET", () => "/admin/trends"],
    ["an admin route that does not exist", "GET", () => "/admin/anything-new"],
];

const CUSTOMER_ONLY = [
    ["my account", "GET", () => "/me"],
    ["my conversations", "GET", () => "/me/conversations"],
    ["my alerts", "GET", () => "/me/alerts"],
    ["report something", "POST", () => "/reports", { target_type: "vendor", target_id: OWNED, reason: "spam" }],
];

function expectStatus(routes, caller, expected) {
    for (const [label, method, route, json] of routes) {
        it(`${label}: ${caller ?? "signed out"} gets ${expected}`, async () => {
            const res = await call(method, route(), { as: caller, json });
            assert.equal(res.status, expected, `${method} ${route()} -> ${JSON.stringify(res.data)}`);
        });
    }
}

describe("signed out: every protected route needs a session", () => {
    expectStatus([...OWNER_OR_ADMIN, ...OWNER_ONLY, ...ADMIN_ONLY, ...CUSTOMER_ONLY], undefined, 401);
});

describe("a customer cannot use business or admin routes", () => {
    expectStatus([...OWNER_OR_ADMIN, ...OWNER_ONLY, ...ADMIN_ONLY], "customer", 403);
});

describe("another vendor cannot use this business's routes, or admin routes", () => {
    expectStatus([...OWNER_OR_ADMIN, ...OWNER_ONLY, ...ADMIN_ONLY, ...CUSTOMER_ONLY], "otherVendor", 403);
});

describe("the owner cannot use admin or customer routes", () => {
    expectStatus([...ADMIN_ONLY, ...CUSTOMER_ONLY], "owner", 403);
});

describe("an admin cannot read or write as the business", () => {
    expectStatus(OWNER_ONLY, "admin", 403);
});

describe("the owner and an admin can read the business's pages", () => {
    const reads = OWNER_OR_ADMIN.filter(([, method]) => method === "GET");
    expectStatus(reads, "owner", 200);
    expectStatus(reads, "admin", 200);
    expectStatus(OWNER_ONLY.filter(([, method]) => method === "GET"), "owner", 200);
});

describe("an admin can read every admin page", () => {
    expectStatus(ADMIN_ONLY.filter(([, method, route]) => method === "GET" && !route().includes("anything-new")), "admin", 200);
});

// ---------- refused requests change nothing ----------

describe("refused requests do not change data", () => {
    it("payment methods are unchanged after another vendor tries to save them", async () => {
        const before = await query("SELECT payment_method FROM vendor_payment_methods WHERE vendor_id = $1 ORDER BY 1", [OWNED]);
        await call("PUT", `/vendors/${OWNED}/payment-methods`, { as: "otherVendor", json: { methods: [] } });
        await call("PUT", `/vendors/${OWNED}/payment-methods`, { json: { methods: [] } });
        const after = await query("SELECT payment_method FROM vendor_payment_methods WHERE vendor_id = $1 ORDER BY 1", [OWNED]);
        assert.deepEqual(after, before);
    });

    it("the owner's name is unchanged after a customer tries to edit it", async () => {
        const name = async () => (await query("SELECT user_name FROM users WHERE user_phone = $1", [PHONES.owner]))[0].user_name;
        const original = await name();
        await call("PUT", `/vendors/${OWNED}/owner`, { as: "customer", json: { user_name: "Hijacked" } });
        assert.equal(await name(), original);
    });

    it("no message is stored when another vendor or an admin tries to reply as the business", async () => {
        const count = async () =>
            Number((await query("SELECT COUNT(*) FROM messages WHERE conversation_id = $1", [ids.conversation]))[0].count);
        const before = await count();
        await call("POST", `/vendors/${OWNED}/conversations/${ids.conversation}/messages`, { as: "otherVendor", json: { body: "x" } });
        await call("POST", `/vendors/${OWNED}/conversations/${ids.conversation}/messages`, { as: "admin", json: { body: "x" } });
        assert.equal(await count(), before);
    });

    it("no category is added when a vendor tries", async () => {
        await call("POST", "/admin/categories", { as: "owner", json: { name: "Blocked Category" } });
        assert.equal((await query("SELECT 1 FROM categories WHERE category_name = 'Blocked Category'")).length, 0);
    });

    it("a review stays published when a customer tries to hide it", async () => {
        await call("POST", `/admin/reviews/${ids.review}/status`, { as: "customer", json: { status: "hidden" } });
        assert.equal((await query("SELECT review_status FROM reviews WHERE review_id = $1", [ids.review]))[0].review_status, "published");
    });
});

// ---------- allowed requests work and are attributed correctly ----------

describe("allowed requests", () => {
    it("the owner can save payment methods and an admin can read them back", async () => {
        const saved = await call("PUT", `/vendors/${OWNED}/payment-methods`, {
            as: "owner",
            json: { methods: [{ payment_method: "cash" }, { payment_method: "bkash", payment_note: "Send a message first" }] },
        });
        assert.equal(saved.status, 200, JSON.stringify(saved.data));
        const read = await call("GET", `/vendors/${OWNED}/payment-methods`, { as: "admin" });
        assert.deepEqual(read.data.methods.map((m) => m.payment_method), ["cash", "bkash"]);
    });

    it("the owner's reply is stored as sent by the owner", async () => {
        const res = await call("POST", `/vendors/${OWNED}/conversations/${ids.conversation}/messages`, {
            as: "owner",
            json: { body: "Thanks for your message" },
        });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        const row = (await query("SELECT sender_user_id FROM messages WHERE message_id = $1", [res.data.message_id]))[0];
        assert.equal(row.sender_user_id, await userIdOf("owner"));
    });

    it("the owner cannot open another business's conversation through their own business, and it is not marked read", async () => {
        const res = await call("GET", `/vendors/${OWNED}/conversations/${ids.otherConversation}`, { as: "owner" });
        assert.equal(res.status, 404);
        const unread = await query(
            "SELECT COUNT(*)::int AS n FROM messages WHERE conversation_id = $1 AND message_read_at IS NULL",
            [ids.otherConversation]
        );
        assert.equal(unread[0].n, 1);
    });

    it("the owner can reply to a review", async () => {
        const res = await call("PUT", `/vendors/${OWNED}/reviews/${ids.review}/reply`, { as: "owner", json: { reply: "Thank you!" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.reply, "Thank you!");
    });

    it("an admin can edit the owner's details", async () => {
        const res = await call("PUT", `/vendors/${OWNED}/owner`, { as: "admin", json: { user_name: "Mango Trader Owner" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.user_name, "Mango Trader Owner");
    });
});

describe("admin actions are recorded against the signed-in admin", () => {
    let secondAdminId;
    before(async () => {
        secondAdminId = await userIdOf("secondAdmin");
        assert.notEqual(secondAdminId, await userIdOf("admin"), "the second admin is a different user");
    });

    const lastAuditActor = async (action) =>
        (await query(
            "SELECT audit_actor_user_id FROM audit_logs WHERE audit_action = $1 ORDER BY audit_id DESC LIMIT 1",
            [action]
        ))[0]?.audit_actor_user_id;

    it("approving a listing", async () => {
        const pending = (await query("SELECT listing_id FROM vendor_listings WHERE listing_status = 'pending' LIMIT 1"))[0];
        assert.ok(pending, "the seed has a pending listing");
        const res = await call("POST", `/admin/listings/${pending.listing_id}/decision`, { as: "secondAdmin", json: { decision: "approve" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const actor = (await query(
            "SELECT audit_actor_user_id FROM audit_logs WHERE audit_target_type = 'listing' AND audit_target_id = $1 ORDER BY audit_id DESC LIMIT 1",
            [pending.listing_id]
        ))[0].audit_actor_user_id;
        assert.equal(actor, secondAdminId);
    });

    it("adding a category", async () => {
        const res = await call("POST", "/admin/categories", { as: "secondAdmin", json: { name: "Audit Test Category" } });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(await lastAuditActor("category.create"), secondAdminId);
    });

    it("hiding a review", async () => {
        const res = await call("POST", `/admin/reviews/${ids.review}/status`, { as: "secondAdmin", json: { status: "hidden" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(await lastAuditActor("review.hide"), secondAdminId);
    });

    it("resolving a report", async () => {
        const reported = await call("POST", "/reports", {
            as: "customer",
            json: { target_type: "vendor", target_id: OTHER, reason: "wrong_info" },
        });
        assert.equal(reported.status, 201, JSON.stringify(reported.data));
        const res = await call("POST", `/admin/reports/${reported.data.report_id}/resolve`, { as: "secondAdmin", json: { action: "dismiss" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const row = (await query("SELECT report_resolved_by FROM reports WHERE report_id = $1", [reported.data.report_id]))[0];
        assert.equal(row.report_resolved_by, secondAdminId);
        assert.equal(await lastAuditActor("report.dismiss"), secondAdminId);
    });
});

// ---------- public routes stay public ----------

describe("public routes still work signed out", () => {
    for (const route of [
        "/home",
        "/categories",
        "/businesses",
        "/businesses/rajshahi-mango-traders",
        "/businesses/rajshahi-mango-traders/payment-methods",
        "/vendors",
        "/events",
    ]) {
        it(`GET ${route}`, async () => {
            const res = await call("GET", route);
            assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
        });
    }
});
