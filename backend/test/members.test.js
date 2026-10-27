// Businesses run by more than one person (KAN-250 to 252).

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { businessChoices, call, query, signIn: harnessSignIn, startApi, stopApi, PHONES: SIGN_IN_PHONES, ROLES } = require("./support/harness");

// Signs in through the shared harness, registering accounts it does not know yet.
async function signIn(name, phone, role) {
    SIGN_IN_PHONES[name] = phone;
    ROLES[name] = role;
    await harnessSignIn(name);
}

// Seeded accounts (database/baseline/seed.sql).
const PHONES = {
    owner: "+8801711000005", // owns business 1, rajshahi-mango-traders
    manager: "+8801711000015", // manager of business 1
    otherVendor: "+8801711000006", // owns business 6
    customer: "+8801722000001",
    reviewer: "+8801900000001", // a sample reviewer, added to the team below
};
const MANGO = 1;
const OTHER = 6;

before(async () => {
    await startApi(); // signs in owner, otherVendor, customer and admin
    await signIn("manager", PHONES.manager, "vendor");
});

after(stopApi);

// Every route that needs an owner or manager, for business 1.
const BUSINESS_ROUTES = [
    ["GET", `/vendors/${MANGO}/dashboard`],
    ["GET", `/vendors/${MANGO}/profile`],
    ["GET", `/vendors/${MANGO}/listings`],
    ["GET", `/vendors/${MANGO}/payment-methods`],
    ["GET", `/vendors/${MANGO}/conversations`],
    ["GET", `/vendors/${MANGO}/alerts`],
    ["GET", `/vendors/${MANGO}/reviews`],
    ["GET", `/vendors/${MANGO}/owner`],
    ["GET", `/vendors/${MANGO}/members`],
];
// The ones guarded in messages.js, reviews.js and vendorSettings.js.
const MEMBER_ROUTES = BUSINESS_ROUTES.slice(4);

describe("business routes need an owner or manager", () => {
    it("guests, customers and other vendors are refused", async () => {
        for (const [method, route] of MEMBER_ROUTES) {
            assert.equal((await call(method, route)).status, 401, `${method} ${route} as a guest`);
            assert.equal((await call(method, route, { as: "customer" })).status, 403, `${method} ${route} as a customer`);
            assert.equal((await call(method, route, { as: "otherVendor" })).status, 403, `${method} ${route} as another vendor`);
        }
        const reply = await call("PUT", `/vendors/${MANGO}/reviews/1/reply`, { as: "otherVendor", json: { reply: "Hi" } });
        assert.equal(reply.status, 403);
    });

    it("nobody can review or message a business they run", async () => {
        const review = await call("POST", "/businesses/rajshahi-mango-traders/reviews", { as: "manager", json: { rating: 5 } });
        assert.equal(review.status, 403);
        const message = await call("POST", "/me/conversations", { as: "owner", json: { vendor_id: MANGO, body: "Hello" } });
        assert.equal(message.status, 403);
    });
});

describe("businesses run by more than one person (KAN-250 to 252)", () => {
    it("every business has its owner in vendor_members", async () => {
        const [row] = await query(
            `SELECT COUNT(*)::int AS missing FROM vendors v
             WHERE NOT EXISTS (SELECT 1 FROM vendor_members m
                               WHERE m.vendor_id = v.vendor_id AND m.user_id = v.user_id AND m.member_role = 'owner')`
        );
        assert.equal(row.missing, 0);
    });

    it("a new business gets its owner row automatically", async () => {
        // A signed-in vendor adds a second business (KAN-249), no new code needed.
        const res = await call("POST", "/auth/register/vendor", {
            as: "otherVendor",
            json: { vendor_name: "Uttara Spare Parts", vendor_phone: "01711000066", ...(await businessChoices()) },
        });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        const [member] = await query("SELECT member_role FROM vendor_members WHERE vendor_id = $1", [res.data.vendor.vendor_id]);
        assert.equal(member.member_role, "owner");
    });

    it("a manager sees the business in their list and can use all its dashboard features", async () => {
        const list = await call("GET", "/vendor-account/businesses", { as: "manager" });
        assert.deepEqual(list.data.map((b) => [b.vendor_id, b.member_role]), [[MANGO, "manager"]]);
        for (const [method, route] of BUSINESS_ROUTES) {
            assert.equal((await call(method, route, { as: "manager" })).status, 200, `${method} ${route} as the manager`);
        }
    });

    it("a customer message reaches everyone who runs the business, and a manager's reply counts as the business", async () => {
        const sent = await call("POST", "/me/conversations", { as: "customer", json: { vendor_id: MANGO, body: "Do you deliver?" } });
        assert.equal(sent.status, 201, JSON.stringify(sent.data));
        const id = sent.data.conversation_id;

        const alerted = await query(
            `SELECT u.user_phone FROM notifications n JOIN users u USING (user_id)
             WHERE n.notification_channel = 'in_app' AND n.notification_payload->>'conversation_id' = $1`,
            [String(id)]
        );
        assert.deepEqual(alerted.map((r) => r.user_phone).sort(), [PHONES.owner, PHONES.manager].sort());

        const reply = await call("POST", `/vendors/${MANGO}/conversations/${id}/messages`, { as: "manager", json: { body: "Yes, across Rajshahi." } });
        assert.equal(reply.status, 201);

        const asOwner = await call("GET", `/vendors/${MANGO}/conversations/${id}`, { as: "owner" });
        assert.deepEqual(asOwner.data.messages.map((m) => m.mine), [false, true]);
        const asCustomer = await call("GET", `/me/conversations/${id}`, { as: "customer" });
        assert.deepEqual(asCustomer.data.messages.map((m) => m.mine), [true, false]);
    });

    it("a vendor's customer alerts and business alerts stay apart", async () => {
        const sent = await call("POST", "/me/conversations", { as: "owner", json: { vendor_id: OTHER, body: "Price for a grill?" } });
        assert.equal(sent.status, 201, JSON.stringify(sent.data));
        const id = sent.data.conversation_id;
        await call("POST", `/vendors/${OTHER}/conversations/${id}/messages`, { as: "otherVendor", json: { body: "2,000 taka." } });

        const ids = (res) => res.data.alerts.map((a) => Number(a.payload.conversation_id));
        assert.ok(ids(await call("GET", "/me/alerts", { as: "owner" })).includes(id), "shown in the customer account");
        assert.ok(!ids(await call("GET", `/vendors/${MANGO}/alerts`, { as: "owner" })).includes(id), "not shown on the business dashboard");
    });

    it("the owner can add a manager by phone, and a customer added this way gets the business login", async () => {
        const added = await call("POST", `/vendors/${MANGO}/members`, { as: "owner", json: { phone: PHONES.reviewer } });
        assert.equal(added.status, 201, JSON.stringify(added.data));
        assert.equal(added.data.length, 3);
        const [user] = await query("SELECT user_role FROM users WHERE user_phone = $1", [PHONES.reviewer]);
        assert.equal(user.user_role, "vendor");

        await signIn("reviewer", PHONES.reviewer, "vendor");
        assert.equal((await call("GET", `/vendors/${MANGO}/listings`, { as: "reviewer" })).status, 200);
    });

    it("adding someone twice, or an unknown phone, is refused", async () => {
        assert.equal((await call("POST", `/vendors/${MANGO}/members`, { as: "owner", json: { phone: PHONES.manager } })).status, 409);
        assert.equal((await call("POST", `/vendors/${MANGO}/members`, { as: "owner", json: { phone: "01799999999" } })).status, 404);
    });

    it("managers cannot change the team", async () => {
        const res = await call("POST", `/vendors/${MANGO}/members`, { as: "manager", json: { phone: PHONES.customer } });
        assert.equal(res.status, 403);
    });

    it("the owner cannot be removed, and a removed manager loses access", async () => {
        const [owner] = await query("SELECT user_id FROM users WHERE user_phone = $1", [PHONES.owner]);
        assert.equal((await call("DELETE", `/vendors/${MANGO}/members/${owner.user_id}`, { as: "owner" })).status, 404);

        const [reviewer] = await query("SELECT user_id FROM users WHERE user_phone = $1", [PHONES.reviewer]);
        const removed = await call("DELETE", `/vendors/${MANGO}/members/${reviewer.user_id}`, { as: "owner" });
        assert.equal(removed.status, 200);
        assert.equal((await call("GET", `/vendors/${MANGO}/listings`, { as: "reviewer" })).status, 403);
    });

    it("each person edits their own details in settings", async () => {
        const res = await call("PUT", `/vendors/${MANGO}/owner`, { as: "manager", json: { user_name: "Rubel Ahmed Khan" } });
        assert.equal(res.status, 200);
        assert.equal(res.data.user_phone, PHONES.manager);
        const owner = await call("GET", `/vendors/${MANGO}/owner`, { as: "owner" });
        assert.equal(owner.data.user_name, "Shahidul Haque");
    });

    it("a manager of one business cannot open another", async () => {
        assert.equal((await call("GET", `/vendors/${OTHER}/members`, { as: "manager" })).status, 403);
    });
});
