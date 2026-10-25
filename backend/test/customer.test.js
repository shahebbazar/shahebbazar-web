// What a signed-in customer can do: account summary, saved businesses, reviews, reports, messages and alerts.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PHONES, ROLES, PNG, UPLOAD_DIR, query, call, signIn, startApi, stopApi } = require("./support/harness");

let target; // an approved business the customer has not reviewed
let pending; // a business awaiting approval

before(async () => {
    await startApi();
    PHONES.customer2 = "+8801722000002";
    ROLES.customer2 = "customer";
    await signIn("customer2");
    target = (await query(
        `SELECT v.vendor_id, v.vendor_slug FROM vendors v
         WHERE v.vendor_status = 'approved'
           AND NOT EXISTS (SELECT 1 FROM reviews r JOIN users u USING (user_id) WHERE r.vendor_id = v.vendor_id AND u.user_phone = $1)
         ORDER BY v.vendor_id LIMIT 1`, [PHONES.customer]
    ))[0];
    pending = (await query("SELECT vendor_id, vendor_slug FROM vendors WHERE vendor_status = 'pending' LIMIT 1"))[0];
});
after(stopApi);

describe("account summary", () => {
    it("shows the customer's own details and counts", async () => {
        const res = await call("GET", "/me", { as: "customer" });
        assert.equal(res.status, 200);
        assert.equal(res.data.user_phone, PHONES.customer);
        for (const key of ["saved_count", "review_count", "unread_messages"]) assert.equal(typeof res.data[key], "number", key);
    });
});

describe("my details (KAN-294)", () => {
    const save = (body, as = "customer2") => call("PUT", "/me/profile", { as, json: body });

    it("a customer can add an email address and tidy their name", async () => {
        const res = await save({ name: "  Farhana Yasmin ", email: "  Farhana.Y@Example.COM " });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.deepEqual([res.data.user_name, res.data.user_email, res.data.user_phone], ["Farhana Yasmin", "farhana.y@example.com", PHONES.customer2]);
        assert.equal((await call("GET", "/me", { as: "customer2" })).data.user_email, "farhana.y@example.com");
    });

    it("reports each invalid field and saves nothing", async () => {
        const res = await save({ name: "F", email: "not an email" });
        assert.equal(res.status, 400);
        assert.ok(res.data.errors.name && res.data.errors.email);
        const me = (await call("GET", "/me", { as: "customer2" })).data;
        assert.deepEqual([me.user_name, me.user_email], ["Farhana Yasmin", "farhana.y@example.com"], "unchanged");
    });

    it("refuses an email address used by another account", async () => {
        const [admin] = await query("SELECT user_email FROM users WHERE user_phone = $1", [PHONES.admin]);
        const res = await save({ name: "Farhana Yasmin", email: admin.user_email });
        assert.equal(res.status, 409);
        assert.ok(res.data.errors.email);
    });

    it("an empty email removes it; the phone number cannot be changed here", async () => {
        const res = await save({ name: "Farhana Yasmin", email: "", phone: "+8801799000000" });
        assert.equal(res.status, 200);
        assert.equal(res.data.user_email, null);
        assert.equal(res.data.user_phone, PHONES.customer2);
    });

    it("only changes the signed-in customer's own details", async () => {
        const before = (await call("GET", "/me", { as: "customer" })).data;
        await save({ name: "Someone Else", email: "" });
        const after = (await call("GET", "/me", { as: "customer" })).data;
        assert.deepEqual([after.user_name, after.user_email], [before.user_name, before.user_email]);
        await save({ name: "Farhana Yasmin", email: "" });
    });

    it("an area can be chosen, shows on the customer's reviews, and can be cleared", async () => {
        const [area] = await query("SELECT location_id, location_name FROM locations WHERE location_type = 'area' ORDER BY location_id LIMIT 1");
        const [reviewed] = await query(
            `SELECT v.vendor_slug FROM reviews r
             JOIN vendors v ON v.vendor_id = r.vendor_id JOIN users u ON u.user_id = r.user_id
             WHERE u.user_phone = $1 AND r.review_status = 'published' AND r.review_body IS NOT NULL AND v.vendor_status = 'approved'
             LIMIT 1`,
            [PHONES.customer]
        );
        const me = (await call("GET", "/me", { as: "customer" })).data;
        const res = await save({ name: me.user_name, email: me.user_email ?? "", area: area.location_id }, "customer");
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal((await call("GET", "/me", { as: "customer" })).data.area_name, area.location_name);
        if (reviewed) {
            const page = await call("GET", `/businesses/${reviewed.vendor_slug}`);
            const mine = page.data.reviews.find((r) => r.author === me.user_name);
            assert.equal(mine?.author_area, area.location_name);
        }

        assert.equal((await save({ name: me.user_name, email: me.user_email ?? "", area: 999999 }, "customer")).status, 400);
        await save({ name: me.user_name, email: me.user_email ?? "", area: null }, "customer");
        assert.equal((await call("GET", "/me", { as: "customer" })).data.location_id, null);
    });
});

describe("profile photo", () => {
    it("uploads, shows in the session, replaces the old file, and can be removed", async () => {
        const upload = () => {
            const form = new FormData();
            form.append("avatar", new Blob([PNG], { type: "image/png" }), "me.png");
            return call("POST", "/me/avatar", { as: "customer2", form });
        };
        assert.equal((await call("POST", "/me/avatar", { form: new FormData() })).status, 401);

        const first = await upload();
        assert.equal(first.status, 201, JSON.stringify(first.data));
        assert.match(first.data.avatar_url, /^uploads\/user-\d+-[0-9a-f]+\.png$/);
        assert.equal((await call("GET", "/auth/me", { as: "customer2" })).data.user.user_avatar_url, first.data.avatar_url);

        const second = await upload();
        assert.equal(fs.existsSync(path.join(UPLOAD_DIR, path.basename(first.data.avatar_url))), false, "the old photo is deleted");

        assert.equal((await call("DELETE", "/me/avatar", { as: "customer2" })).status, 204);
        assert.equal(fs.existsSync(path.join(UPLOAD_DIR, path.basename(second.data.avatar_url))), false);
        assert.equal((await call("GET", "/me", { as: "customer2" })).data.user_avatar_url, null);
    });
});

describe("saved businesses", () => {
    it("saving is idempotent and shows everywhere the business is listed", async () => {
        for (let i = 0; i < 2; i++) {
            const res = await call("PUT", `/me/saved/${target.vendor_id}`, { as: "customer" });
            assert.equal(res.status, 200);
            assert.deepEqual(res.data, { saved: true });
        }
        assert.ok((await call("GET", "/me/saved-ids", { as: "customer" })).data.includes(target.vendor_id));
        const saved = await call("GET", "/me/saved", { as: "customer" });
        assert.equal(saved.data.filter((b) => b.vendor_id === target.vendor_id).length, 1);
        assert.equal((await call("GET", `/me/businesses/${target.vendor_slug}`, { as: "customer" })).data.saved, true);
    });

    it("saves belong to one customer", async () => {
        assert.ok(!(await call("GET", "/me/saved-ids", { as: "customer2" })).data.includes(target.vendor_id));
    });

    it("unsaving is idempotent too", async () => {
        for (let i = 0; i < 2; i++) {
            assert.deepEqual((await call("DELETE", `/me/saved/${target.vendor_id}`, { as: "customer" })).data, { saved: false });
        }
        assert.ok(!(await call("GET", "/me/saved-ids", { as: "customer" })).data.includes(target.vendor_id));
    });

    it("a business awaiting approval cannot be saved, and bad ids are refused", async () => {
        assert.equal((await call("PUT", `/me/saved/${pending.vendor_id}`, { as: "customer" })).status, 404);
        assert.equal((await call("PUT", "/me/saved/abc", { as: "customer" })).status, 400);
        assert.equal((await call("GET", `/me/businesses/${pending.vendor_slug}`, { as: "customer" })).status, 404);
    });
});

describe("reviews", () => {
    const review = (as, json, slug = target.vendor_slug) => call("POST", `/businesses/${slug}/reviews`, { as, json });
    const card = async () => (await call("GET", `/businesses/${target.vendor_slug}`)).data.business;

    it("refuses a rating outside 1 to 5 whole stars, and an over-long review", async () => {
        for (const rating of [0, 6, 2.5, "five", null]) {
            assert.equal((await review("customer", { rating })).status, 400, String(rating));
        }
        assert.equal((await review("customer", { rating: 4, body: "x".repeat(2001) })).status, 400);
    });

    it("a new review is published, counted in the rating and listed in the customer's account", async () => {
        const before = await card();
        const res = await review("customer", { rating: 5, body: "Excellent service and fair prices." });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        const after = await card();
        assert.equal(Number(after.review_count), Number(before.review_count) + 1);
        const mine = await call("GET", "/me/reviews", { as: "customer" });
        assert.ok(mine.data.some((r) => r.vendor_id === target.vendor_id && r.rating === 5));
        assert.deepEqual((await call("GET", `/me/businesses/${target.vendor_slug}`, { as: "customer" })).data.review.rating, 5);
    });

    it("reviewing again edits the same review instead of adding a second", async () => {
        const res = await review("customer", { rating: 3, body: "Good, but slow delivery." });
        assert.equal(res.status, 200);
        const rows = await query(
            "SELECT review_rating FROM reviews r JOIN users u USING (user_id) WHERE r.vendor_id = $1 AND u.user_phone = $2",
            [target.vendor_id, PHONES.customer]
        );
        assert.deepEqual(rows, [{ review_rating: 3 }]);
    });

    it("a review hidden by a moderator cannot be edited back into view", async () => {
        await query(
            "UPDATE reviews SET review_status = 'hidden' WHERE vendor_id = $1 AND user_id = (SELECT user_id FROM users WHERE user_phone = $2)",
            [target.vendor_id, PHONES.customer]
        );
        const res = await review("customer", { rating: 5, body: "Changed my mind." });
        assert.equal(res.status, 409);
    });

    it("businesses that are not approved, or unknown, cannot be reviewed", async () => {
        assert.equal((await review("customer2", { rating: 4 }, pending.vendor_slug)).status, 404);
        assert.equal((await review("customer2", { rating: 4 }, "no-such-business")).status, 404);
    });

    it("owners cannot review their own business; guests must sign in", async () => {
        assert.equal((await review("owner", { rating: 5 }, "rajshahi-mango-traders")).status, 403);
        assert.equal((await call("POST", `/businesses/${target.vendor_slug}/reviews`, { json: { rating: 5 } })).status, 401);
    });
});

describe("reports", () => {
    const report = (as, json) => call("POST", "/reports", { as, json });

    it("checks the item type, id, reason and details", async () => {
        assert.equal((await report("customer", { target_type: "user", target_id: 1, reason: "spam" })).status, 400);
        assert.equal((await report("customer", { target_type: "vendor", target_id: "x", reason: "spam" })).status, 400);
        assert.equal((await report("customer", { target_type: "vendor", target_id: 1, reason: "boring" })).status, 400);
        assert.equal((await report("customer", { target_type: "vendor", target_id: 1, reason: "spam", details: "x".repeat(1001) })).status, 400);
        assert.equal((await report("customer", { target_type: "listing", target_id: 999999, reason: "spam" })).status, 404);
    });

    it("a report is recorded once; reporting the same item again is refused while it is open", async () => {
        const json = { target_type: "vendor", target_id: target.vendor_id, reason: "wrong_info", details: "The phone number is out of date." };
        const first = await report("customer", json);
        assert.equal(first.status, 201, JSON.stringify(first.data));
        assert.equal((await report("customer", json)).status, 409);
        assert.equal((await report("customer2", json)).status, 201, "another customer can still report it");
        const [row] = await query("SELECT report_status FROM reports WHERE report_id = $1", [first.data.report_id]);
        assert.equal(row.report_status, "open");
    });

    it("business owners can report too; guests must sign in", async () => {
        assert.equal((await report("owner", { target_type: "vendor", target_id: 6, reason: "spam" })).status, 201);
        assert.equal((await call("POST", "/reports", { json: { target_type: "vendor", target_id: 6, reason: "spam" } })).status, 401);
    });
});

describe("messages and alerts", () => {
    let conversationId;

    it("checks the business, product and message before sending", async () => {
        const send = (json) => call("POST", "/me/conversations", { as: "customer", json });
        assert.equal((await send({ body: "Hi" })).status, 400, "no business");
        assert.equal((await send({ vendor_id: target.vendor_id, body: "" })).status, 400, "empty message");
        assert.equal((await send({ vendor_id: target.vendor_id, body: "x".repeat(2001) })).status, 400, "too long");
        assert.equal((await send({ vendor_id: pending.vendor_id, body: "Hi" })).status, 404, "business not approved");
        const [other] = await query("SELECT listing_id FROM vendor_listings WHERE vendor_id <> $1 AND listing_status = 'approved' LIMIT 1", [target.vendor_id]);
        assert.equal((await send({ vendor_id: target.vendor_id, listing_id: other.listing_id, body: "Hi" })).status, 404, "product of another business");
    });

    it("starting a conversation and following up keeps one thread", async () => {
        const first = await call("POST", "/me/conversations", { as: "customer", json: { vendor_id: target.vendor_id, body: "Are you open on Friday?" } });
        assert.equal(first.status, 201, JSON.stringify(first.data));
        conversationId = first.data.conversation_id;
        const again = await call("POST", "/me/conversations", { as: "customer", json: { vendor_id: target.vendor_id, body: "Also, do you deliver?" } });
        assert.equal(again.data.conversation_id, conversationId);
        const thread = await call("GET", `/me/conversations/${conversationId}`, { as: "customer" });
        assert.deepEqual(thread.data.messages.map((m) => m.mine), [true, true]);
        const list = await call("GET", "/me/conversations", { as: "customer" });
        assert.ok(list.data.some((c) => c.conversation_id === conversationId));
    });

    it("another customer cannot open or write into the conversation", async () => {
        assert.equal((await call("GET", `/me/conversations/${conversationId}`, { as: "customer2" })).status, 404);
        assert.equal((await call("POST", `/me/conversations/${conversationId}/messages`, { as: "customer2", json: { body: "Hi" } })).status, 404);
    });

    it("the business's reply becomes an alert for the customer, which can be marked read", async () => {
        const [owner] = await query("SELECT user_id FROM vendor_members WHERE vendor_id = $1 AND member_role = 'owner'", [target.vendor_id]);
        await query(
            `INSERT INTO messages (conversation_id, sender_user_id, message_body) VALUES ($1, $2, 'Yes, open 9 to 9.')`,
            [conversationId, owner.user_id]
        );
        await query(
            `INSERT INTO notifications (user_id, notification_type, notification_channel, notification_payload, notification_status, notification_sent_at)
             SELECT user_id, 'message.new', 'in_app', json_build_object('conversation_id', $1::int, 'from', 'Test business')::jsonb, 'sent', now()
             FROM users WHERE user_phone = $2`,
            [conversationId, PHONES.customer]
        );
        const before = await call("GET", "/me/alerts", { as: "customer" });
        assert.ok(before.data.unread > 0);
        const unreadBefore = (await call("GET", "/me", { as: "customer" })).data.unread_messages;

        assert.equal((await call("POST", "/me/alerts/read", { as: "customer" })).status, 200);
        assert.equal((await call("GET", "/me/alerts", { as: "customer" })).data.unread, 0);
        // Opening the thread marks the business's reply as read (the seed has another unread conversation).
        const thread = await call("GET", `/me/conversations/${conversationId}`, { as: "customer" });
        assert.deepEqual(thread.data.messages.map((m) => m.mine), [true, true, false]);
        assert.equal((await call("GET", "/me", { as: "customer" })).data.unread_messages, unreadBefore - 1);
        const [reply] = await query(
            "SELECT message_read_at FROM messages WHERE conversation_id = $1 AND message_body = 'Yes, open 9 to 9.'", [conversationId]
        );
        assert.ok(reply.message_read_at, "the reply is marked read");
    });

    it("a closed conversation takes no new messages", async () => {
        await query("UPDATE conversations SET conversation_status = 'blocked' WHERE conversation_id = $1", [conversationId]);
        const res = await call("POST", `/me/conversations/${conversationId}/messages`, { as: "customer", json: { body: "Hello?" } });
        assert.equal(res.status, 409);
    });

    it("unknown and invalid conversation ids are refused", async () => {
        assert.equal((await call("GET", "/me/conversations/999999", { as: "customer" })).status, 404);
        assert.equal((await call("GET", "/me/conversations/abc", { as: "customer" })).status, 400);
    });
});
