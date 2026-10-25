// Events (KAN-298): the public events pages, Interested / Going, and the events a business runs.
//
// A business adds an event from its dashboard with a cover photo and gallery. New events are public at
// once unless an admin switches on require_event_approval (decisions are in adminModeration.js).
// Published and cancelled events are public; cancelled ones stay up with a notice. Signed-in customers
// mark an event Interested or Going and see it under My events. Everyone going gets a message from the
// business, in their Messages, when the event is cancelled or its time or place changes, and whenever
// the business writes to them from the event's page.

const express = require("express");
const pool = require("../db");
const { imageUpload, receive, discard, storedPath, checkUploads, removeUnreferencedFiles } = require("../lib/uploads");
const { parseId } = require("../lib/currentUser");
const { requireVendorOwnership, requireEventOwnership } = require("../lib/middleware/auth");
const { requireFeature } = require("../lib/access");
const { getSetting } = require("../lib/settings");
const { siteUrl } = require("../lib/site");
const { cleanText } = require("../lib/currentUser");
const { notifyNewMessage } = require("../lib/notify");

const router = express.Router();

const EVENT_TYPES = ["market", "festival", "sale", "workshop", "launch", "trade", "community", "other"];
const RESPONSES = ["interested", "going"];
const EVENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const EVENT_PHOTOS_MAX = 7; // the cover and six more
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;
const LONGEST_EVENT_DAYS = 60;
const PAST_LIMIT = 12;
const MESSAGE_MAX = 1000;

// Ownership is checked before any request body or upload is read, so a refused request never writes a file.
const vendorAccess = [requireFeature("business.events"), requireVendorOwnership];
const eventAccess = [requireFeature("business.events"), requireEventOwnership];

// ---------- queries ----------

const PUBLIC_COLUMNS = `
    e.event_id, e.event_title, e.event_title_bn, e.event_slug, e.event_description,
    e.event_venue, e.event_starts_at, e.event_ends_at, e.event_image_url, e.event_status,
    e.event_type, e.event_is_online, e.event_online_url, e.event_price_type, e.event_price_bdt,
    e.event_ticket_url,
    loc.location_name AS area_name, loc.location_slug AS area_slug,
    v.vendor_name, v.vendor_slug, v.vendor_logo_url,
    COALESCE(rc.going_count, 0) AS going_count, COALESCE(rc.interested_count, 0) AS interested_count,
    COALESCE(e.event_ends_at, e.event_starts_at) < NOW() AS ended`;

const PUBLIC_JOINS = `
    FROM events e
    LEFT JOIN locations loc ON loc.location_id = e.location_id
    LEFT JOIN vendors v ON v.vendor_id = e.vendor_id
    LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE r.response_type = 'going')::int AS going_count,
               COUNT(*) FILTER (WHERE r.response_type = 'interested')::int AS interested_count
        FROM event_responses r WHERE r.event_id = e.event_id
    ) rc ON TRUE`;

// Public: published (or, where stated, cancelled), and run by an approved business or by the site itself.
const VISIBLE = `(e.vendor_id IS NULL OR v.vendor_status = 'approved')`;

const MANAGE_COLUMNS = `
    e.*, loc.location_name AS area_name,
    COALESCE(rc.going_count, 0) AS going_count, COALESCE(rc.interested_count, 0) AS interested_count,
    COALESCE(e.event_ends_at, e.event_starts_at) < NOW() AS ended,
    (SELECT COUNT(*)::int FROM event_photos p WHERE p.event_id = e.event_id) AS photo_count`;

async function eventPhotos(db, eventId) {
    const result = await db.query(
        `SELECT photo_id, photo_url, photo_is_cover FROM event_photos
         WHERE event_id = $1 ORDER BY photo_is_cover DESC, photo_sort_order, photo_id`,
        [eventId]
    );
    return result.rows;
}

async function managedEvent(db, eventId) {
    const result = await db.query(`SELECT ${MANAGE_COLUMNS} ${PUBLIC_JOINS} WHERE e.event_id = $1`, [eventId]);
    if (result.rowCount === 0) return null;
    return { ...result.rows[0], photos: await eventPhotos(db, eventId) };
}

async function responseCounts(db, eventId) {
    const result = await db.query(
        `SELECT COUNT(*) FILTER (WHERE response_type = 'going')::int AS going_count,
                COUNT(*) FILTER (WHERE response_type = 'interested')::int AS interested_count
         FROM event_responses WHERE event_id = $1`,
        [eventId]
    );
    return result.rows[0];
}

// ---------- reading a form ----------

// Bengali letters are outside the ASCII range, so a Bangla title slugifies to an empty string.
function slugify(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);
}

// Event slugs are unique across the site: the address is /events/<slug>.
async function uniqueSlug(db, title, exceptId = 0) {
    const base = slugify(title) || "event";
    const { rows } = await db.query(
        "SELECT event_slug FROM events WHERE (event_slug = $1 OR event_slug LIKE $2) AND event_id <> $3",
        [base, `${base}-%`, exceptId]
    );
    const taken = new Set(rows.map((r) => r.event_slug));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
}

const text = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * A date and time from the form. "2026-11-02T18:00" (from a datetime-local input) is Dhaka time;
 * a full ISO string with its own offset is taken as given. Returns a Date, or null when unusable.
 */
function parseWhen(value) {
    const raw = text(value);
    if (!raw) return null;
    const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw);
    const date = new Date(local ? `${raw}+06:00` : raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function webAddress(value) {
    const raw = text(value);
    if (!raw) return null;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(withScheme);
        return url.hostname.includes(".") && withScheme.length <= 500 ? withScheme : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Validates the event form. `existing` is the saved event when editing, so an unchanged start in the
 * past (an event already under way) is still accepted. Returns { errors } or { fields }.
 */
function readEvent(body, existing = null) {
    const errors = {};
    const title = text(body.title);
    const titleBn = text(body.title_bn);
    const description = text(body.description);
    const venue = text(body.venue);
    const type = text(body.type) || "other";
    const isOnline = body.is_online === true || body.is_online === "true" || body.is_online === "on";
    const priceType = text(body.price_type) || "free";

    if (!title) errors.title = "Give the event a name.";
    else if (title.length > TITLE_MAX) errors.title = `Keep the name under ${TITLE_MAX} characters.`;
    if (titleBn.length > TITLE_MAX) errors.title_bn = `Keep the name under ${TITLE_MAX} characters.`;
    if (description.length > DESCRIPTION_MAX) errors.description = `Keep the details under ${DESCRIPTION_MAX} characters.`;
    if (!EVENT_TYPES.includes(type)) errors.type = "Choose what kind of event it is.";

    const startsAt = parseWhen(body.starts_at);
    const endsAt = parseWhen(body.ends_at);
    const startUnchanged = existing && startsAt && startsAt.getTime() === new Date(existing.event_starts_at).getTime();
    if (!startsAt) errors.starts_at = "Choose when the event starts.";
    else if (!startUnchanged && startsAt.getTime() < Date.now()) errors.starts_at = "The start can't be in the past.";
    if (text(body.ends_at) && !endsAt) errors.ends_at = "That end time couldn't be read.";
    else if (startsAt && endsAt) {
        if (endsAt < startsAt) errors.ends_at = "The event can't end before it starts.";
        else if (endsAt - startsAt > LONGEST_EVENT_DAYS * 86400000) {
            errors.ends_at = `An event can last up to ${LONGEST_EVENT_DAYS} days.`;
        }
    }

    const onlineUrl = webAddress(body.online_url);
    if (isOnline) {
        if (onlineUrl === null) errors.online_url = "Add the link people use to join.";
        else if (onlineUrl === undefined) errors.online_url = "That doesn't look like a web address.";
    }
    if (!isOnline && !venue) errors.venue = "Say where the event is.";
    if (venue.length > 255) errors.venue = "Keep the venue under 255 characters.";

    let locationId = null;
    if (body.location_id !== undefined && body.location_id !== null && body.location_id !== "") {
        locationId = parseId(String(body.location_id));
        if (locationId === null) errors.location_id = "Choose an area from the list.";
    }

    let priceBdt = null;
    if (!["free", "paid"].includes(priceType)) errors.price_type = "Choose free or paid.";
    if (priceType === "paid") {
        const raw = text(String(body.price_bdt ?? ""));
        if (raw) {
            priceBdt = Number(raw);
            if (!Number.isFinite(priceBdt) || priceBdt < 0 || priceBdt > 1000000) {
                errors.price_bdt = "Enter the ticket price in taka, or leave it blank.";
            }
        }
    }
    const ticketUrl = webAddress(body.ticket_url);
    if (ticketUrl === undefined) errors.ticket_url = "That doesn't look like a web address.";

    if (Object.keys(errors).length > 0) return { errors };
    return {
        fields: {
            title,
            titleBn: titleBn || null,
            description: description || null,
            type,
            startsAt,
            endsAt,
            isOnline,
            onlineUrl: isOnline ? onlineUrl : null,
            venue: venue || null,
            locationId,
            priceType,
            priceBdt: priceType === "paid" ? priceBdt : null,
            ticketUrl: priceType === "paid" ? ticketUrl : null,
        },
    };
}

function invalid(res, errors) {
    return res.status(400).json({ success: false, error: Object.values(errors)[0], errors });
}

// ---------- messages to people going ----------

const DHAKA_WHEN = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka",
});

function eventPlace(event) {
    return event.event_is_online ? "online" : [event.event_venue, event.area_name].filter(Boolean).join(", ");
}

/**
 * Sends a message from the business to everyone marked Going, each in a conversation about the event
 * in their Messages, with an in-app alert and an email when they have an address (SMS is not used for
 * these). People who run the business are left out. Returns how many were messaged. Site-wide events
 * have no business to write from, so nobody is messaged.
 */
async function messageGoing(eventId, senderUserId, body) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const event = await client.query(
            `SELECT e.vendor_id, v.vendor_name FROM events e JOIN vendors v ON v.vendor_id = e.vendor_id WHERE e.event_id = $1`,
            [eventId]
        );
        if (event.rowCount === 0) {
            await client.query("ROLLBACK");
            return 0;
        }
        const { vendor_id: vendorId, vendor_name: vendorName } = event.rows[0];
        const going = await client.query(
            `SELECT r.user_id FROM event_responses r
             WHERE r.event_id = $1 AND r.response_type = 'going'
               AND NOT EXISTS (SELECT 1 FROM vendor_members m WHERE m.vendor_id = $2 AND m.user_id = r.user_id)
             ORDER BY r.response_created_at`,
            [eventId, vendorId]
        );

        let sent = 0;
        for (const { user_id: userId } of going.rows) {
            let conversation = await client.query(
                "SELECT conversation_id, conversation_status FROM conversations WHERE vendor_id = $1 AND user_id = $2 AND event_id = $3",
                [vendorId, userId, eventId]
            );
            if (conversation.rowCount === 0) {
                conversation = await client.query(
                    `INSERT INTO conversations (vendor_id, user_id, event_id) VALUES ($1, $2, $3)
                     RETURNING conversation_id, conversation_status`,
                    [vendorId, userId, eventId]
                );
            }
            const { conversation_id: conversationId, conversation_status: status } = conversation.rows[0];
            if (status !== "open") continue; // a closed or blocked conversation gets nothing new

            const message = await client.query(
                "INSERT INTO messages (conversation_id, sender_user_id, message_body) VALUES ($1, $2, $3) RETURNING message_id",
                [conversationId, senderUserId, body]
            );
            await client.query("UPDATE conversations SET conversation_last_message_at = NOW() WHERE conversation_id = $1", [conversationId]);
            await notifyNewMessage(client, {
                userId,
                conversationId,
                messageId: message.rows[0].message_id,
                from: vendorName,
                preview: body.slice(0, 120),
                fallbacks: ["email"],
            });
            sent += 1;
        }
        await client.query("COMMIT");
        return sent;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    } finally {
        client.release();
    }
}

// ---------- public ----------

// GET /events?type=festival&price=free&online=1 : upcoming events (soonest first) and recent past ones.
router.get("/events", async (req, res) => {
    const where = [`e.event_status = 'published'`, VISIBLE];
    const params = [];
    if (EVENT_TYPES.includes(req.query.type)) {
        params.push(req.query.type);
        where.push(`e.event_type = $${params.length}`);
    }
    if (req.query.price === "free") where.push(`e.event_price_type = 'free'`);
    if (req.query.online === "1") where.push("e.event_is_online");
    if (req.query.online === "0") where.push("NOT e.event_is_online");
    const filter = where.join(" AND ");

    try {
        const [upcoming, past] = await Promise.all([
            pool.query(
                `SELECT ${PUBLIC_COLUMNS} ${PUBLIC_JOINS}
                 WHERE ${filter} AND COALESCE(e.event_ends_at, e.event_starts_at) >= NOW()
                 ORDER BY e.event_starts_at`,
                params
            ),
            pool.query(
                `SELECT ${PUBLIC_COLUMNS} ${PUBLIC_JOINS}
                 WHERE ${filter} AND COALESCE(e.event_ends_at, e.event_starts_at) < NOW()
                 ORDER BY e.event_starts_at DESC LIMIT ${PAST_LIMIT}`,
                params
            ),
        ]);
        res.json({ upcoming: upcoming.rows, past: past.rows });
    } catch (err) {
        console.error("GET /api/events failed:", err);
        res.status(500).json({ error: "Could not load events" });
    }
});

async function publicEvent(slug) {
    const result = await pool.query(
        `SELECT ${PUBLIC_COLUMNS} ${PUBLIC_JOINS}
         WHERE e.event_slug = $1 AND e.event_status IN ('published', 'cancelled') AND ${VISIBLE}`,
        [slug]
    );
    return result.rows[0] ?? null;
}

// GET /events/:slug : one event with its photos.
router.get("/events/:slug", async (req, res) => {
    try {
        const event = await publicEvent(req.params.slug);
        if (!event) return res.status(404).json({ error: "Event not found" });
        res.json({ ...event, photos: await eventPhotos(pool, event.event_id) });
    } catch (err) {
        console.error(`GET /api/events/${req.params.slug} failed:`, err);
        res.status(500).json({ error: "Could not load the event" });
    }
});

// Text for an .ics file: commas, semicolons and backslashes escaped, lines folded at 75 octets.
function icsText(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function icsFold(line) {
    const parts = [];
    let rest = Buffer.from(line, "utf8");
    // Continuation lines start with a space, so they carry one octet less.
    for (let limit = 75; rest.length > limit; limit = 74) {
        let cut = limit;
        while ((rest[cut] & 0xc0) === 0x80) cut -= 1; // never split a multi-byte character
        parts.push(rest.subarray(0, cut).toString("utf8"));
        rest = rest.subarray(cut);
    }
    parts.push(rest.toString("utf8"));
    return parts.join("\r\n ");
}
const icsDate = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// GET /events/:slug/calendar.ics : adds the event to a phone or computer calendar.
router.get("/events/:slug/calendar.ics", async (req, res) => {
    try {
        const event = await publicEvent(req.params.slug);
        if (!event || event.event_status !== "published") return res.status(404).json({ error: "Event not found" });

        const start = new Date(event.event_starts_at);
        // Without an end time, calendars get a two-hour slot.
        const end = event.event_ends_at ? new Date(event.event_ends_at) : new Date(start.getTime() + 2 * 3600000);
        const page = `${siteUrl()}/events/${event.event_slug}`;
        const place = event.event_is_online
            ? event.event_online_url
            : [event.event_venue, event.area_name, "Rajshahi"].filter(Boolean).join(", ");
        const lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Shahebbazar//Events//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            `UID:event-${event.event_id}@shahebbazar`,
            `DTSTAMP:${icsDate(new Date())}`,
            `DTSTART:${icsDate(start)}`,
            `DTEND:${icsDate(end)}`,
            `SUMMARY:${icsText(event.event_title)}`,
            `DESCRIPTION:${icsText([event.event_description, page].filter(Boolean).join("\n\n"))}`,
            `LOCATION:${icsText(place)}`,
            `URL:${page}`,
            "END:VEVENT",
            "END:VCALENDAR",
        ];
        res.set("Content-Type", "text/calendar; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="${event.event_slug}.ics"`);
        res.send(`${lines.map(icsFold).join("\r\n")}\r\n`);
    } catch (err) {
        console.error(`GET /api/events/${req.params.slug}/calendar.ics failed:`, err);
        res.status(500).json({ error: "Could not make the calendar file" });
    }
});

// ---------- Interested / Going ----------

// GET /events/:eventId/response : the signed-in customer's answer and the counts.
router.get("/events/:eventId/response", requireFeature("events.respond"), async (req, res) => {
    const eventId = parseId(req.params.eventId);
    if (eventId === null) return res.status(400).json({ error: "Invalid event id" });
    try {
        const mine = await pool.query(
            "SELECT response_type FROM event_responses WHERE event_id = $1 AND user_id = $2",
            [eventId, req.user.user_id]
        );
        res.json({ response: mine.rows[0]?.response_type ?? null, ...(await responseCounts(pool, eventId)) });
    } catch (err) {
        console.error(`GET /api/events/${eventId}/response failed:`, err);
        res.status(500).json({ error: "Could not load your answer" });
    }
});

// PUT /events/:eventId/response { response: "interested" | "going" | null }
router.put("/events/:eventId/response", requireFeature("events.respond"), async (req, res) => {
    const eventId = parseId(req.params.eventId);
    if (eventId === null) return res.status(400).json({ error: "Invalid event id" });
    const response = req.body?.response ?? null;
    if (response !== null && !RESPONSES.includes(response)) {
        return res.status(400).json({ error: 'response must be "interested", "going" or null' });
    }

    try {
        const event = await pool.query(
            `SELECT e.event_status, COALESCE(e.event_ends_at, e.event_starts_at) < NOW() AS ended
             FROM events e LEFT JOIN vendors v ON v.vendor_id = e.vendor_id
             WHERE e.event_id = $1 AND e.event_status IN ('published', 'cancelled') AND ${VISIBLE}`,
            [eventId]
        );
        if (event.rowCount === 0) return res.status(404).json({ error: "Event not found" });

        if (response === null) {
            // Taking an answer back is always allowed, even after a cancellation.
            await pool.query("DELETE FROM event_responses WHERE event_id = $1 AND user_id = $2", [eventId, req.user.user_id]);
        } else {
            const { event_status: status, ended } = event.rows[0];
            if (status === "cancelled") return res.status(409).json({ error: "This event has been cancelled." });
            if (ended) return res.status(409).json({ error: "This event has already happened." });
            await pool.query(
                `INSERT INTO event_responses (event_id, user_id, response_type) VALUES ($1, $2, $3)
                 ON CONFLICT (event_id, user_id)
                 DO UPDATE SET response_type = EXCLUDED.response_type, response_updated_at = NOW()`,
                [eventId, req.user.user_id, response]
            );
        }
        res.json({ response, ...(await responseCounts(pool, eventId)) });
    } catch (err) {
        console.error(`PUT /api/events/${eventId}/response failed:`, err);
        res.status(500).json({ error: "Could not save your answer" });
    }
});

// GET /me/events : events the customer is interested in or going to, upcoming first.
router.get("/me/events", requireFeature("events.respond"), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${PUBLIC_COLUMNS}, r.response_type
             ${PUBLIC_JOINS}
             JOIN event_responses r ON r.event_id = e.event_id AND r.user_id = $1
             WHERE e.event_status IN ('published', 'cancelled') AND ${VISIBLE}
             ORDER BY (COALESCE(e.event_ends_at, e.event_starts_at) < NOW()), e.event_starts_at`,
            [req.user.user_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/me/events failed:", err);
        res.status(500).json({ error: "Could not load your events" });
    }
});

// ---------- a business's own events ----------

// GET /locations/areas : the areas an event can be in, for the event form.
router.get("/locations/areas", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT a.location_id AS id, a.location_name AS name, city.location_name AS city
             FROM locations a
             JOIN locations city ON city.location_id = a.location_parent_id
             WHERE a.location_type = 'area'
             ORDER BY city.location_name, a.location_name`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/locations/areas failed:", err);
        res.status(500).json({ error: "Could not load the areas" });
    }
});

// GET /vendors/:vendorId/events : every event the business has added, newest start first.
router.get("/vendors/:vendorId/events", ...vendorAccess, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${MANAGE_COLUMNS} ${PUBLIC_JOINS} WHERE e.vendor_id = $1 ORDER BY e.event_starts_at DESC, e.event_id DESC`,
            [req.vendor.vendor_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(`GET /api/vendors/${req.params.vendorId}/events failed:`, err);
        res.status(500).json({ error: "Could not load the events" });
    }
});

// POST /vendors/:vendorId/events : a new event, waiting for approval unless approval is switched off.
router.post("/vendors/:vendorId/events", ...vendorAccess, async (req, res) => {
    const { errors, fields } = readEvent(req.body ?? {});
    if (errors) return invalid(res, errors);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const needsApproval = await getSetting(client, "require_event_approval");
        const slug = await uniqueSlug(client, fields.title);
        const created = await client.query(
            `INSERT INTO events (event_title, event_title_bn, event_slug, event_description, event_venue,
                                 location_id, vendor_id, event_starts_at, event_ends_at, event_status,
                                 event_type, event_is_online, event_online_url, event_price_type,
                                 event_price_bdt, event_ticket_url, event_created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             RETURNING event_id, event_status`,
            [
                fields.title, fields.titleBn, slug, fields.description, fields.venue,
                fields.locationId, req.vendor.vendor_id, fields.startsAt, fields.endsAt,
                needsApproval ? "pending" : "published",
                fields.type, fields.isOnline, fields.onlineUrl, fields.priceType,
                fields.priceBdt, fields.ticketUrl, req.user.user_id,
            ]
        );
        const { event_id: eventId } = created.rows[0];
        if (!needsApproval) {
            await client.query(
                `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
                 VALUES ($1, 'event.auto_approve', 'event', $2, NULL, $3)`,
                [req.user.user_id, eventId, JSON.stringify({ status: "published", reason: "Approval is switched off" })]
            );
        }
        await client.query("COMMIT");
        res.status(201).json({ success: true, event: await managedEvent(pool, eventId) });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        if (err.code === "23503") return invalid(res, { location_id: "Choose an area from the list." });
        console.error(`POST /api/vendors/${req.params.vendorId}/events failed:`, err);
        res.status(500).json({ success: false, error: "Could not save the event." });
    } finally {
        client.release();
    }
});

// GET /events/:eventId/manage : the event as its business sees it, whatever its status.
router.get("/events/:eventId/manage", ...eventAccess, async (req, res) => {
    try {
        res.json(await managedEvent(pool, req.event.event_id));
    } catch (err) {
        console.error(`GET /api/events/${req.params.eventId}/manage failed:`, err);
        res.status(500).json({ error: "Could not load the event" });
    }
});

// PUT /events/:eventId : edits the event. A rejected event is sent back for approval.
router.put("/events/:eventId", ...eventAccess, async (req, res) => {
    const eventId = req.event.event_id;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const current = await client.query(
            `SELECT event_status, event_starts_at, event_ends_at, event_title, event_venue, location_id,
                    event_is_online, event_online_url
             FROM events WHERE event_id = $1 FOR UPDATE`,
            [eventId]
        );
        const before = current.rows[0];
        if (before.event_status === "cancelled") {
            await client.query("ROLLBACK");
            return res.status(409).json({ success: false, error: "A cancelled event can't be edited." });
        }
        const { errors, fields } = readEvent(req.body ?? {}, before);
        if (errors) {
            await client.query("ROLLBACK");
            return invalid(res, errors);
        }

        let status = before.event_status;
        if (status === "rejected" || status === "draft") {
            status = (await getSetting(client, "require_event_approval")) ? "pending" : "published";
        }
        // The address stays the same once people may have shared it.
        const slug = status !== "published" && fields.title !== before.event_title
            ? await uniqueSlug(client, fields.title, eventId)
            : null;

        await client.query(
            `UPDATE events SET
                 event_title = $2, event_title_bn = $3, event_slug = COALESCE($4, event_slug),
                 event_description = $5, event_venue = $6, location_id = $7,
                 event_starts_at = $8, event_ends_at = $9, event_type = $10, event_is_online = $11,
                 event_online_url = $12, event_price_type = $13, event_price_bdt = $14,
                 event_ticket_url = $15, event_status = $16::text,
                 event_rejection_reason = CASE WHEN $16::text = 'rejected' THEN event_rejection_reason END,
                 event_updated_at = NOW()
             WHERE event_id = $1`,
            [
                eventId, fields.title, fields.titleBn, slug, fields.description, fields.venue,
                fields.locationId, fields.startsAt, fields.endsAt, fields.type, fields.isOnline,
                fields.onlineUrl, fields.priceType, fields.priceBdt, fields.ticketUrl, status,
            ]
        );
        await client.query("COMMIT");

        const time = (d) => (d ? new Date(d).getTime() : null);
        const moved =
            time(before.event_starts_at) !== time(fields.startsAt) ||
            time(before.event_ends_at) !== time(fields.endsAt) ||
            before.event_is_online !== fields.isOnline ||
            (before.event_venue ?? null) !== fields.venue ||
            (before.location_id ?? null) !== fields.locationId ||
            (before.event_online_url ?? null) !== fields.onlineUrl;
        const event = await managedEvent(pool, eventId);
        let notified = 0;
        if (moved && status === "published" && !event.ended) {
            const when = DHAKA_WHEN.format(new Date(event.event_starts_at));
            notified = await messageGoing(
                eventId,
                req.user.user_id,
                `Update to ${event.event_title}: it's now on ${when}, ${eventPlace(event)}. ` +
                    `Details: ${siteUrl()}/events/${event.event_slug}`
            );
        }
        res.json({ success: true, event, notified });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        if (err.code === "23503") return invalid(res, { location_id: "Choose an area from the list." });
        console.error(`PUT /api/events/${eventId} failed:`, err);
        res.status(500).json({ success: false, error: "Could not save the event." });
    } finally {
        client.release();
    }
});

// POST /events/:eventId/cancel : the page stays up with a cancelled notice.
router.post("/events/:eventId/cancel", ...eventAccess, async (req, res) => {
    const eventId = req.event.event_id;
    try {
        const result = await pool.query(
            `UPDATE events SET event_status = 'cancelled', event_updated_at = NOW()
             WHERE event_id = $1 AND event_status IN ('published', 'pending')
             RETURNING event_id`,
            [eventId]
        );
        if (result.rowCount === 0) {
            return res.status(409).json({ success: false, error: "Only an upcoming or waiting event can be cancelled." });
        }
        await pool.query(
            `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
             VALUES ($1, 'event.cancel', 'event', $2, NULL, $3)`,
            [req.user.user_id, eventId, JSON.stringify({ status: "cancelled" })]
        );
        const event = await managedEvent(pool, eventId);
        const note = cleanText(req.body?.note)?.slice(0, MESSAGE_MAX);
        const notified = await messageGoing(
            eventId,
            req.user.user_id,
            `Sorry, ${event.event_title} on ${DHAKA_WHEN.format(new Date(event.event_starts_at))} has been cancelled.` +
                (note ? `\n\n${note}` : "")
        );
        res.json({ success: true, event, notified });
    } catch (err) {
        console.error(`POST /api/events/${eventId}/cancel failed:`, err);
        res.status(500).json({ success: false, error: "Could not cancel the event." });
    }
});

// POST /events/:eventId/message { body } : a message from the business to everyone going.
router.post("/events/:eventId/message", ...eventAccess, async (req, res) => {
    const eventId = req.event.event_id;
    const body = cleanText(req.body?.body);
    if (!body) return res.status(400).json({ success: false, error: "Write a message first." });
    if (body.length > MESSAGE_MAX) return res.status(400).json({ success: false, error: `Keep the message under ${MESSAGE_MAX} characters.` });
    try {
        const current = await pool.query(
            "SELECT event_status, event_title, COALESCE(event_ends_at, event_starts_at) < NOW() AS ended FROM events WHERE event_id = $1",
            [eventId]
        );
        const { event_status: status, event_title: title, ended } = current.rows[0];
        if (status !== "published" || ended) {
            return res.status(409).json({ success: false, error: "Messages can be sent while the event is live and still to come." });
        }
        if (!req.event.vendor_id) return res.status(409).json({ success: false, error: "This event has no business to write from." });
        const sent = await messageGoing(eventId, req.user.user_id, `About ${title}: ${body}`);
        res.json({ success: true, sent });
    } catch (err) {
        console.error(`POST /api/events/${eventId}/message failed:`, err);
        res.status(500).json({ success: false, error: "Could not send the message." });
    }
});

// DELETE /events/:eventId : removes the event, its photos and everyone's answers.
router.delete("/events/:eventId", ...eventAccess, async (req, res) => {
    const eventId = req.event.event_id;
    try {
        const photos = await pool.query("SELECT photo_url FROM event_photos WHERE event_id = $1", [eventId]);
        await pool.query("DELETE FROM events WHERE event_id = $1", [eventId]);
        await removeUnreferencedFiles(pool, photos.rows.map((r) => r.photo_url));
        res.json({ success: true });
    } catch (err) {
        console.error(`DELETE /api/events/${eventId} failed:`, err);
        res.status(500).json({ success: false, error: "Could not delete the event." });
    }
});

// ---------- photos ----------

// Keeps events.event_image_url pointing at the cover photo, for the pages and share cards.
async function syncCover(db, eventId) {
    await db.query(
        `UPDATE events SET event_image_url =
             (SELECT photo_url FROM event_photos WHERE event_id = $1 AND photo_is_cover),
             event_updated_at = NOW()
         WHERE event_id = $1`,
        [eventId]
    );
}

router.post(
    "/events/:eventId/photos",
    ...eventAccess,
    receive(
        imageUpload("photos", EVENT_PHOTO_MAX_BYTES, EVENT_PHOTOS_MAX, (req) => `event-${req.params.eventId}`),
        "5 MB",
        "eventId",
        "event"
    ),
    async (req, res) => {
        const eventId = req.event.event_id;
        if (!(await checkUploads(req, res))) return;

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // Locking the event serialises uploads, so two cannot both become the cover.
            await client.query("SELECT 1 FROM events WHERE event_id = $1 FOR UPDATE", [eventId]);
            const existing = await client.query(
                `SELECT COUNT(*)::int AS n, COALESCE(MAX(photo_sort_order), -1)::int AS last,
                        COALESCE(BOOL_OR(photo_is_cover), false) AS has_cover
                 FROM event_photos WHERE event_id = $1`,
                [eventId]
            );
            const { n, last, has_cover: hasCover } = existing.rows[0];
            if (n + req.files.length > EVENT_PHOTOS_MAX) {
                await client.query("ROLLBACK");
                await discard(req.files);
                const left = EVENT_PHOTOS_MAX - n;
                return res.status(400).json({
                    success: false,
                    error: left > 0
                        ? `You can add ${left} more photo${left === 1 ? "" : "s"} (up to ${EVENT_PHOTOS_MAX} per event).`
                        : `This event already has ${EVENT_PHOTOS_MAX} photos. Remove one to add another.`,
                });
            }
            for (const [i, file] of req.files.entries()) {
                await client.query(
                    `INSERT INTO event_photos (event_id, photo_url, photo_sort_order, photo_is_cover)
                     VALUES ($1, $2, $3, $4)`,
                    // The first photo of an event without one becomes its cover.
                    [eventId, storedPath(file), last + 1 + i, !hasCover && i === 0]
                );
            }
            await syncCover(client, eventId);
            await client.query("COMMIT");
            res.status(201).json({ success: true, photos: await eventPhotos(pool, eventId) });
        } catch (err) {
            await client.query("ROLLBACK").catch(() => { });
            await discard(req.files);
            console.error(`POST /api/events/${eventId}/photos failed:`, err);
            res.status(500).json({ success: false, error: "Could not save the photos." });
        } finally {
            client.release();
        }
    }
);

router.put("/events/:eventId/photos/:photoId/cover", ...eventAccess, async (req, res) => {
    const eventId = req.event.event_id;
    const photoId = parseId(req.params.photoId);
    if (photoId === null) return res.status(400).json({ success: false, error: "Invalid photo id" });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT 1 FROM events WHERE event_id = $1 FOR UPDATE", [eventId]);
        const photo = await client.query("SELECT 1 FROM event_photos WHERE photo_id = $1 AND event_id = $2", [photoId, eventId]);
        if (photo.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, error: "Photo not found." });
        }
        // Cleared first: a unique index allows only one cover per event.
        await client.query("UPDATE event_photos SET photo_is_cover = false WHERE event_id = $1", [eventId]);
        await client.query("UPDATE event_photos SET photo_is_cover = true WHERE photo_id = $1", [photoId]);
        await syncCover(client, eventId);
        await client.query("COMMIT");
        res.json({ success: true, photos: await eventPhotos(pool, eventId) });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`PUT /api/events/${eventId}/photos/${photoId}/cover failed:`, err);
        res.status(500).json({ success: false, error: "Could not change the cover photo." });
    } finally {
        client.release();
    }
});

router.delete("/events/:eventId/photos/:photoId", ...eventAccess, async (req, res) => {
    const eventId = req.event.event_id;
    const photoId = parseId(req.params.photoId);
    if (photoId === null) return res.status(400).json({ success: false, error: "Invalid photo id" });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT 1 FROM events WHERE event_id = $1 FOR UPDATE", [eventId]);
        const removed = await client.query(
            "DELETE FROM event_photos WHERE photo_id = $1 AND event_id = $2 RETURNING photo_url, photo_is_cover",
            [photoId, eventId]
        );
        if (removed.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, error: "Photo not found." });
        }
        // Removing the cover promotes the next photo, so the event keeps a cover while it has photos.
        if (removed.rows[0].photo_is_cover) {
            await client.query(
                `UPDATE event_photos SET photo_is_cover = true
                 WHERE photo_id = (SELECT photo_id FROM event_photos WHERE event_id = $1
                                   ORDER BY photo_sort_order, photo_id LIMIT 1)`,
                [eventId]
            );
        }
        await syncCover(client, eventId);
        await client.query("COMMIT");
        await removeUnreferencedFiles(pool, [removed.rows[0].photo_url]);
        res.json({ success: true, photos: await eventPhotos(pool, eventId) });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`DELETE /api/events/${eventId}/photos/${photoId} failed:`, err);
        res.status(500).json({ success: false, error: "Could not remove the photo." });
    } finally {
        client.release();
    }
});

module.exports = router;
module.exports.EVENT_TYPES = EVENT_TYPES;
