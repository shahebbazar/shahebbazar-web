// End-to-end API tests for events (KAN-298): a business adding and managing its events, admin
// approval, the public pages, Interested / Going and the calendar file.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { UPLOAD_DIR, JPEG, query, call, startApi, stopApi, userIdOf } = require("./support/harness");

const OWNED_VENDOR = 1;
const DAY = 86400000;

// ---------- helpers ----------

// "YYYY-MM-DDTHH:MM" in Dhaka time, as a datetime-local input sends it.
function dhakaLocal(msFromNow) {
    return new Date(Date.now() + msFromNow + 6 * 3600000).toISOString().slice(0, 16);
}

function eventBody(overrides = {}) {
    return {
        title: `Test event ${Date.now() % 100000}`,
        description: "An evening of tasting and talks.",
        type: "market",
        starts_at: dhakaLocal(5 * DAY),
        ends_at: dhakaLocal(5 * DAY + 3 * 3600000),
        venue: "Shaheb Bazar Road",
        price_type: "free",
        ...overrides,
    };
}

async function createEvent(overrides = {}, as = "owner", vendorId = OWNED_VENDOR) {
    const res = await call("POST", `/vendors/${vendorId}/events`, { as, json: eventBody(overrides) });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data.event;
}

async function publish(eventId) {
    const res = await call("POST", `/admin/events/${eventId}/decision`, { as: "admin", json: { decision: "approve" } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
}

function photoForm(count) {
    const form = new FormData();
    for (let i = 0; i < count; i += 1) form.append("photos", new Blob([JPEG], { type: "image/jpeg" }), `p${i}.jpg`);
    return form;
}

const uploadedFiles = () => fs.readdirSync(UPLOAD_DIR);

before(startApi);
after(stopApi);

const approval = (on) =>
    query("UPDATE platform_settings SET setting_value = $1 WHERE setting_key = 'require_event_approval'", [JSON.stringify(on)]);

// ---------- approval ----------

describe("approval of events", () => {
    it("is off to begin with, so a new event is public at once", async () => {
        const [row] = await query("SELECT setting_value FROM platform_settings WHERE setting_key = 'require_event_approval'");
        assert.equal(row.setting_value, false);
        const event = await createEvent();
        assert.equal(event.event_status, "published");
        assert.equal((await call("GET", `/events/${event.event_slug}`)).status, 200);
        const [audit] = await query("SELECT audit_action FROM audit_logs WHERE audit_target_type = 'event' AND audit_target_id = $1", [event.event_id]);
        assert.equal(audit.audit_action, "event.auto_approve");
    });

    // The rest of this file checks the approval flow, so it runs with approval switched on.
    after(() => approval(true));
});

// ---------- access control ----------

describe("access control", () => {
    let eventId;
    before(async () => {
        eventId = (await createEvent()).event_id;
    });

    const routes = [
        ["list a business's events", "GET", () => `/vendors/${OWNED_VENDOR}/events`, {}],
        ["add an event", "POST", () => `/vendors/${OWNED_VENDOR}/events`, { json: {} }],
        ["see an event to manage it", "GET", (id) => `/events/${id}/manage`, {}],
        ["edit an event", "PUT", (id) => `/events/${id}`, { json: {} }],
        ["cancel an event", "POST", (id) => `/events/${id}/cancel`, {}],
        ["delete an event", "DELETE", (id) => `/events/${id}`, {}],
        ["upload event photos", "POST", (id) => `/events/${id}/photos`, { photos: true }],
        ["choose the cover", "PUT", (id) => `/events/${id}/photos/1/cover`, {}],
        ["remove an event photo", "DELETE", (id) => `/events/${id}/photos/1`, {}],
        ["message people going", "POST", (id) => `/events/${id}/message`, { json: { body: "Hello" } }],
    ];

    for (const [label, method, route, options] of routes) {
        for (const [as, expected] of [[undefined, 401], ["customer", 403], ["otherVendor", 403]]) {
            it(`${label}: ${as ?? "signed out"} gets ${expected}`, async () => {
                const before = uploadedFiles().length;
                const res = await call(method, route(eventId), { as, json: options.json, form: options.photos ? photoForm(1) : undefined });
                assert.equal(res.status, expected, JSON.stringify(res.data));
                assert.equal(uploadedFiles().length, before, "a refused request must not write a file");
            });
        }
    }

    it("only signed-in customers can answer Interested / Going", async () => {
        assert.equal((await call("PUT", `/events/${eventId}/response`, { json: { response: "going" } })).status, 401);
        assert.equal((await call("GET", "/me/events")).status, 401);
        assert.equal((await call("PUT", `/events/${eventId}/response`, { as: "admin", json: { response: "going" } })).status, 403);
    });
});

// ---------- adding and editing ----------

describe("a business's events", () => {
    it("checks the form and says what to fix", async () => {
        const res = await call("POST", `/vendors/${OWNED_VENDOR}/events`, {
            as: "owner",
            json: eventBody({ title: "", starts_at: dhakaLocal(-DAY), venue: "", type: "rave" }),
        });
        assert.equal(res.status, 400);
        assert.ok(res.data.errors.title && res.data.errors.starts_at && res.data.errors.venue && res.data.errors.type, JSON.stringify(res.data));

        const ends = await call("POST", `/vendors/${OWNED_VENDOR}/events`, {
            as: "owner",
            json: eventBody({ ends_at: dhakaLocal(DAY) }),
        });
        assert.equal(ends.status, 400);
        assert.ok(ends.data.errors.ends_at);

        const online = await call("POST", `/vendors/${OWNED_VENDOR}/events`, {
            as: "owner",
            json: eventBody({ is_online: true, venue: "", online_url: "" }),
        });
        assert.equal(online.status, 400);
        assert.ok(online.data.errors.online_url);
    });

    it("a new event waits for approval and is not public yet", async () => {
        const event = await createEvent({ title: "Waiting Room Fair" });
        assert.equal(event.event_status, "pending");
        assert.equal(event.event_slug, "waiting-room-fair");
        assert.equal((await call("GET", `/events/${event.event_slug}`)).status, 404);
        const list = await call("GET", "/events");
        assert.ok(!list.data.upcoming.some((e) => e.event_id === event.event_id));
    });

    it("reads a datetime-local start as Dhaka time", async () => {
        const local = dhakaLocal(3 * DAY).slice(0, 11) + "18:30";
        const event = await createEvent({ starts_at: local, ends_at: "" });
        assert.equal(new Date(event.event_starts_at).toISOString(), new Date(`${local}+06:00`).toISOString());
        assert.equal(event.event_ends_at, null);
    });

    it("stores online and paid details, and drops them when switched off", async () => {
        const event = await createEvent({
            is_online: true,
            venue: "",
            online_url: "meet.example.com/mango",
            price_type: "paid",
            price_bdt: "250",
            ticket_url: "https://tickets.example.com/mango",
        });
        assert.equal(event.event_is_online, true);
        assert.equal(event.event_online_url, "https://meet.example.com/mango");
        assert.equal(Number(event.event_price_bdt), 250);

        const edited = await call("PUT", `/events/${event.event_id}`, {
            as: "owner",
            json: eventBody({ title: event.event_title, starts_at: dhakaLocal(6 * DAY), ends_at: "", price_type: "free" }),
        });
        assert.equal(edited.status, 200, JSON.stringify(edited.data));
        assert.equal(edited.data.event.event_is_online, false);
        assert.equal(edited.data.event.event_online_url, null);
        assert.equal(edited.data.event.event_price_bdt, null);
        assert.equal(edited.data.event.event_ticket_url, null);
    });

    it("lists the business's events with their status and answers", async () => {
        const res = await call("GET", `/vendors/${OWNED_VENDOR}/events`, { as: "owner" });
        assert.equal(res.status, 200);
        const seeded = res.data.find((e) => e.event_slug === "mango-season-tasting-day");
        assert.ok(seeded, "the seeded event belongs to the demo owner's business");
        assert.equal(seeded.event_status, "published");
        assert.equal(typeof seeded.going_count, "number");
    });

    it("a rejected event goes back for approval when edited, keeping the address until published", async () => {
        const event = await createEvent({ title: "Rejected Bazaar" });
        const rejected = await call("POST", `/admin/events/${event.event_id}/decision`, {
            as: "admin",
            json: { decision: "reject", reason: "Please add the venue's full address." },
        });
        assert.equal(rejected.status, 200);
        const managed = await call("GET", `/events/${event.event_id}/manage`, { as: "owner" });
        assert.equal(managed.data.event_status, "rejected");
        assert.equal(managed.data.event_rejection_reason, "Please add the venue's full address.");

        const edited = await call("PUT", `/events/${event.event_id}`, {
            as: "owner",
            json: eventBody({ title: "Rejected Bazaar Returns", venue: "12 Station Road, Rajshahi" }),
        });
        assert.equal(edited.data.event.event_status, "pending");
        assert.equal(edited.data.event.event_rejection_reason, null);
        assert.equal(edited.data.event.event_slug, "rejected-bazaar-returns");

        await publish(event.event_id);
        const renamed = await call("PUT", `/events/${event.event_id}`, {
            as: "owner",
            json: eventBody({ title: "A New Name", starts_at: dhakaLocal(5 * DAY) }),
        });
        assert.equal(renamed.data.event.event_status, "published", "editing a published event keeps it published");
        assert.equal(renamed.data.event.event_slug, "rejected-bazaar-returns", "a published address doesn't change");
    });

    it("listing approval doesn't affect events: with event approval on, a new event waits", async () => {
        await query("UPDATE platform_settings SET setting_value = 'false' WHERE setting_key = 'require_listing_approval'");
        try {
            assert.equal((await createEvent()).event_status, "pending");
        } finally {
            await query("UPDATE platform_settings SET setting_value = 'true' WHERE setting_key = 'require_listing_approval'");
        }
    });

    it("cancelling keeps the page up with the cancelled status; it can't then be edited", async () => {
        const event = await createEvent();
        await publish(event.event_id);
        const cancelled = await call("POST", `/events/${event.event_id}/cancel`, { as: "owner" });
        assert.equal(cancelled.status, 200);
        const page = await call("GET", `/events/${event.event_slug}`);
        assert.equal(page.data.event_status, "cancelled");
        assert.equal((await call("GET", "/events")).data.upcoming.some((e) => e.event_id === event.event_id), false);
        assert.equal((await call("PUT", `/events/${event.event_id}`, { as: "owner", json: eventBody() })).status, 409);
        assert.equal((await call("POST", `/events/${event.event_id}/cancel`, { as: "owner" })).status, 409);
    });

    it("deleting removes the event and its photo files", async () => {
        const event = await createEvent();
        const uploaded = await call("POST", `/events/${event.event_id}/photos`, { as: "owner", form: photoForm(1) });
        const file = path.join(UPLOAD_DIR, path.basename(uploaded.data.photos[0].photo_url));
        assert.ok(fs.existsSync(file));
        assert.equal((await call("DELETE", `/events/${event.event_id}`, { as: "owner" })).status, 200);
        assert.equal((await query("SELECT 1 FROM events WHERE event_id = $1", [event.event_id])).length, 0);
        assert.equal(fs.existsSync(file), false);
    });
});

// ---------- photos ----------

describe("event photos", () => {
    let eventId;
    before(async () => {
        eventId = (await createEvent()).event_id;
    });

    it("the first photo becomes the cover and the event's image", async () => {
        const res = await call("POST", `/events/${eventId}/photos`, { as: "owner", form: photoForm(2) });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.photos.length, 2);
        assert.equal(res.data.photos[0].photo_is_cover, true);
        assert.match(res.data.photos[0].photo_url, /^uploads\/event-\d+-[0-9a-f]+\.jpg$/);
        const [row] = await query("SELECT event_image_url FROM events WHERE event_id = $1", [eventId]);
        assert.equal(row.event_image_url, res.data.photos[0].photo_url);
    });

    it("choosing another cover updates the event's image", async () => {
        const managed = await call("GET", `/events/${eventId}/manage`, { as: "owner" });
        const second = managed.data.photos[1];
        const res = await call("PUT", `/events/${eventId}/photos/${second.photo_id}/cover`, { as: "owner" });
        assert.equal(res.status, 200);
        assert.equal(res.data.photos[0].photo_id, second.photo_id);
        const [row] = await query("SELECT event_image_url FROM events WHERE event_id = $1", [eventId]);
        assert.equal(row.event_image_url, second.photo_url);
    });

    it("allows seven photos in all", async () => {
        const res = await call("POST", `/events/${eventId}/photos`, { as: "owner", form: photoForm(6) });
        assert.equal(res.status, 400);
        assert.match(res.data.error, /5 more photos/);
    });

    it("removing the cover promotes the next photo; removing the last clears the image", async () => {
        let photos = (await call("GET", `/events/${eventId}/manage`, { as: "owner" })).data.photos;
        let res = await call("DELETE", `/events/${eventId}/photos/${photos[0].photo_id}`, { as: "owner" });
        assert.equal(res.data.photos.length, 1);
        assert.equal(res.data.photos[0].photo_is_cover, true);
        res = await call("DELETE", `/events/${eventId}/photos/${res.data.photos[0].photo_id}`, { as: "owner" });
        assert.equal(res.data.photos.length, 0);
        const [row] = await query("SELECT event_image_url FROM events WHERE event_id = $1", [eventId]);
        assert.equal(row.event_image_url, null);
    });
});

// ---------- admin ----------

describe("admin approval", () => {
    it("pending events are in the queue and approving publishes them", async () => {
        const event = await createEvent({ title: "Queue Check Mela" });
        const queue = await call("GET", "/admin/queue", { as: "admin" });
        assert.ok(queue.data.events.some((e) => e.event_id === event.event_id));

        await publish(event.event_id);
        const page = await call("GET", `/events/${event.event_slug}`);
        assert.equal(page.status, 200);
        assert.equal(page.data.event_status, "published");

        const after = await call("GET", "/admin/queue", { as: "admin" });
        assert.ok(after.data.recent.some((r) => r.audit_action === "event.approve" && r.target_label === "Queue Check Mela"));
        const again = await call("POST", `/admin/events/${event.event_id}/decision`, { as: "admin", json: { decision: "approve" } });
        assert.equal(again.status, 409);
    });
});

// ---------- public pages and answers ----------

describe("the public events pages", () => {
    it("lists upcoming events with type, price and counts, and filters them", async () => {
        const all = await call("GET", "/events");
        assert.equal(all.status, 200);
        const trade = all.data.upcoming.find((e) => e.event_slug === "silk-city-trade-expo");
        assert.equal(trade.event_type, "trade");
        assert.equal(trade.event_price_type, "paid");
        assert.equal(trade.vendor_slug, "shaheb-bazar-silk-house");
        assert.equal(typeof trade.interested_count, "number");

        const festivals = await call("GET", "/events?type=festival");
        assert.ok(festivals.data.upcoming.length > 0);
        assert.ok(festivals.data.upcoming.every((e) => e.event_type === "festival"));
        const free = await call("GET", "/events?price=free");
        assert.ok(free.data.upcoming.every((e) => e.event_price_type === "free"));
    });

    it("an event's page has its photos and organiser", async () => {
        const res = await call("GET", "/events/mango-season-tasting-day");
        assert.equal(res.status, 200);
        assert.equal(res.data.vendor_slug, "rajshahi-mango-traders");
        assert.equal(res.data.photos.length, 1);
        assert.equal(res.data.photos[0].photo_is_cover, true);
    });

    it("gives a calendar file", async () => {
        const res = await call("GET", "/events/rajshahi-food-festival/calendar.ics");
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type"), /text\/calendar/);
        assert.match(res.data, /BEGIN:VEVENT\r\n/);
        assert.match(res.data, /SUMMARY:Rajshahi Food Festival\r\n/);
        assert.match(res.data, /DTSTART:\d{8}T\d{6}Z\r\n/);
        assert.match(res.data, /URL:http.*\/events\/rajshahi-food-festival\r\n/);
        for (const line of res.data.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
    });

    it("a customer marks Interested, changes to Going, sees it in My events, then takes it back", async () => {
        const [{ event_id: eventId }] = await query("SELECT event_id FROM events WHERE event_slug = 'padma-river-festival'");
        const before = (await call("GET", "/events/padma-river-festival")).data;

        let res = await call("PUT", `/events/${eventId}/response`, { as: "customer", json: { response: "interested" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.response, "interested");
        assert.equal(res.data.interested_count, before.interested_count + 1);

        res = await call("PUT", `/events/${eventId}/response`, { as: "customer", json: { response: "going" } });
        assert.equal(res.data.going_count, before.going_count + 1);
        assert.equal(res.data.interested_count, before.interested_count);
        assert.equal((await call("GET", `/events/${eventId}/response`, { as: "customer" })).data.response, "going");

        const mine = await call("GET", "/me/events", { as: "customer" });
        assert.equal(mine.status, 200);
        assert.ok(mine.data.some((e) => e.event_id === eventId && e.response_type === "going"));

        res = await call("PUT", `/events/${eventId}/response`, { as: "customer", json: { response: null } });
        assert.equal(res.data.response, null);
        assert.equal(res.data.going_count, before.going_count);
        assert.equal((await call("GET", "/me/events", { as: "customer" })).data.some((e) => e.event_id === eventId), false);
    });

    it("can't answer for a waiting or cancelled event", async () => {
        const waiting = await createEvent();
        const res = await call("PUT", `/events/${waiting.event_id}/response`, { as: "customer", json: { response: "going" } });
        assert.equal(res.status, 404);

        const cancelled = await createEvent();
        await publish(cancelled.event_id);
        await call("POST", `/events/${cancelled.event_id}/cancel`, { as: "owner" });
        const late = await call("PUT", `/events/${cancelled.event_id}/response`, { as: "customer", json: { response: "going" } });
        assert.equal(late.status, 409);
        assert.equal((await call("PUT", `/events/${cancelled.event_id}/response`, { as: "customer", json: { response: "maybe" } })).status, 400);
    });
});

// ---------- messages to people going ----------

describe("messages to people going", () => {
    let event;
    let customer;
    const eventThread = async () =>
        query(
            `SELECT m.message_body, c.conversation_id FROM conversations c JOIN messages m ON m.conversation_id = c.conversation_id
             WHERE c.event_id = $1 AND c.user_id = $2 ORDER BY m.message_id`,
            [event.event_id, customer]
        );

    before(async () => {
        customer = await userIdOf("customer");
        event = await createEvent({ title: "Messaged Mela" });
        await publish(event.event_id);
        await call("PUT", `/events/${event.event_id}/response`, { as: "customer", json: { response: "going" } });
        // Interested isn't going: the other vendor (signed in as a shopper here) gets nothing.
        await call("PUT", `/events/${event.event_id}/response`, { as: "otherVendor", json: { response: "interested" } });
    });

    it("the business writes to everyone going; it arrives in their Messages, with an email but no SMS", async () => {
        const res = await call("POST", `/events/${event.event_id}/message`, { as: "owner", json: { body: "Gates open at 9am." } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.sent, 1);

        const thread = await eventThread();
        assert.equal(thread.length, 1);
        assert.equal(thread[0].message_body, "About Messaged Mela: Gates open at 9am.");
        const otherVendor = await userIdOf("otherVendor");
        assert.equal((await query("SELECT 1 FROM conversations WHERE event_id = $1 AND user_id = $2", [event.event_id, otherVendor])).length, 0);

        const channels = (await query(
            "SELECT notification_channel FROM notifications WHERE user_id = $1 AND notification_payload->>'conversation_id' = $2",
            [customer, String(thread[0].conversation_id)]
        )).map((r) => r.notification_channel).sort();
        assert.deepEqual(channels, ["email", "in_app"]);

        const listed = await call("GET", "/me/conversations", { as: "customer" });
        const row = listed.data.find((c) => c.conversation_id === thread[0].conversation_id);
        assert.equal(row.event_title, "Messaged Mela");
        assert.equal(row.unread, 1);
    });

    it("the customer can reply, and the business sees it", async () => {
        const [{ conversation_id: id }] = await eventThread();
        const reply = await call("POST", `/me/conversations/${id}/messages`, { as: "customer", json: { body: "See you there!" } });
        assert.equal(reply.status, 201);
        const seen = await call("GET", `/vendors/${OWNED_VENDOR}/conversations/${id}`, { as: "owner" });
        assert.equal(seen.data.conversation.event_title, "Messaged Mela");
        assert.ok(seen.data.messages.some((m) => m.body === "See you there!"));
    });

    it("a general message to the business doesn't land in the event's conversation", async () => {
        const res = await call("POST", "/me/conversations", { as: "customer", json: { vendor_id: OWNED_VENDOR, body: "Do you deliver?" } });
        assert.equal(res.status, 201);
        const [{ conversation_id: eventConversation }] = await eventThread();
        assert.notEqual(res.data.conversation_id, eventConversation);
    });

    it("changing the time tells people going; changing only the description doesn't", async () => {
        const managed = (await call("GET", `/events/${event.event_id}/manage`, { as: "owner" })).data;
        const same = {
            title: managed.event_title,
            type: managed.event_type,
            starts_at: new Date(managed.event_starts_at).toISOString(),
            ends_at: new Date(managed.event_ends_at).toISOString(),
            venue: managed.event_venue,
            price_type: "free",
        };
        const quiet = await call("PUT", `/events/${event.event_id}`, { as: "owner", json: { ...same, description: "Now with music." } });
        assert.equal(quiet.data.notified, 0);

        const moved = await call("PUT", `/events/${event.event_id}`, {
            as: "owner",
            json: { ...same, starts_at: dhakaLocal(9 * DAY), ends_at: "", venue: "Padma Garden" },
        });
        assert.equal(moved.status, 200, JSON.stringify(moved.data));
        assert.equal(moved.data.notified, 1);
        const last = (await eventThread()).at(-1).message_body;
        assert.match(last, /^Update to Messaged Mela: it's now on .+, Padma Garden\. Details: http.*\/events\/messaged-mela$/);
    });

    it("cancelling tells people going, with the business's note", async () => {
        const res = await call("POST", `/events/${event.event_id}/cancel`, { as: "owner", json: { note: "The venue flooded." } });
        assert.equal(res.data.notified, 1);
        const last = (await eventThread()).at(-1).message_body;
        assert.match(last, /^Sorry, Messaged Mela on .+ has been cancelled\.\n\nThe venue flooded\.$/);
        const late = await call("POST", `/events/${event.event_id}/message`, { as: "owner", json: { body: "Hello?" } });
        assert.equal(late.status, 409);
    });
});
