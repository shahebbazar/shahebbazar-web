// Marketing campaigns (KAN-285): briefs, the snapshot a campaign is written from, readiness, and the
// rules for saving and approving versions. Routes are in routes/campaigns.js.

const { siteUrl } = require("../../lib/site");
const { cleanText } = require("../../lib/currentUser");

const GOALS = ["new_stock", "offer", "event", "reminder"];
const LANGUAGES = ["en", "bn"];
const CALLS_TO_ACTION = ["visit", "call", "message", "order"];
const MAX_LISTINGS = 3;
const LIMITS = { title: 120, offer: 200, subject: 150, body: 5000, facebook: 2000, whatsapp: 1000 };

/** The owner's Marketing pages and routes are on unless MARKETING_WORKSPACE_ENABLED=false. */
const workspaceEnabled = () => process.env.MARKETING_WORKSPACE_ENABLED !== "false";

// Every business can write campaigns; a free plan gives a glimpse of what a pass adds (decided
// 21 October 2026, to be confirmed with the client). Its monthly email allowance is the admin
// setting free_marketing_emails_per_month, counted in entitlements.js (KAN-286).

/** The business's Marketing plan, from its pass summary: "pass", "ended", "suspended" or "free". */
function planOf(pass) {
    if (!pass || pass.status === "cancelled" || pass.status === "pending") return "free";
    if (pass.status === "expired") return "ended";
    return pass.status === "suspended" ? "suspended" : "pass";
}

/** Writing and editing drafts is free for every business, except one whose pass an admin suspended. */
function draftingCheck(pass) {
    return planOf(pass) === "suspended"
        ? { allowed: false, reason: "Your Marketing pass is suspended. Contact Shahebbazar for help." }
        : { allowed: true };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUPON = /^[A-Z0-9-]{3,20}$/;
const validDate = (v) => DATE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

/** Checks a brief from the form. Returns { errors } or { brief }. */
/** Today's date in Bangladesh, as YYYY-MM-DD. */
const todayInDhaka = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());

/**
 * An offer's coupon and whether it works today. It is valid for the offer's dates (from when the
 * campaign was made if there is no start day) and stops after the last day. Takes a row with
 * YYYY-MM-DD dates.
 */
function couponOf(row, today = todayInDhaka()) {
    if (!row.campaign_coupon_code) return null;
    const startsOn = row.campaign_starts_on || null;
    const endsOn = row.campaign_ends_on || null;
    const status = endsOn && today > endsOn ? "expired" : startsOn && today < startsOn ? "upcoming" : "active";
    return { code: row.campaign_coupon_code, starts_on: startsOn, ends_on: endsOn, status };
}

function validateBrief(body, today = todayInDhaka()) {
    const errors = {};
    const goal = body?.goal;
    const language = body?.language ?? "en";
    const cta = body?.call_to_action;
    const title = cleanText(body?.title) ?? "";
    const offer = cleanText(body?.offer) || null;
    const startsOn = body?.starts_on || null;
    const endsOn = body?.ends_on || null;
    const listingIds = Array.isArray(body?.listing_ids) ? body.listing_ids.map(Number) : null;
    const coupon = (cleanText(body?.coupon_code) || "").toUpperCase() || null;
    // One of the business's own events (KAN-298), for an event campaign. Its name, time and place come
    // from the event, and every link goes to the event's page.
    const rawEvent = body?.event_id;
    const eventId = rawEvent === undefined || rawEvent === null || rawEvent === "" ? null : Number(rawEvent);

    if (!GOALS.includes(goal)) errors.goal = "Choose what the campaign is for.";
    if (!LANGUAGES.includes(language)) errors.language = "Choose English or Bangla.";
    if (!CALLS_TO_ACTION.includes(cta)) errors.call_to_action = "Choose what customers should do.";
    if (title.length > LIMITS.title) errors.title = `Keep the name under ${LIMITS.title} characters.`;
    if (offer && offer.length > LIMITS.offer) errors.offer = `Keep the offer under ${LIMITS.offer} characters.`;
    if (eventId !== null && (!Number.isSafeInteger(eventId) || eventId <= 0)) errors.event_id = "Choose one of your events.";
    else if (eventId !== null && goal !== "event") errors.event_id = "Only an event campaign can be about one of your events.";
    // A campaign for one of the business's events can go without products; every other needs at least one.
    const fewest = goal === "event" && eventId !== null ? 0 : 1;
    if (!listingIds || listingIds.length < fewest || listingIds.length > MAX_LISTINGS || listingIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
        || new Set(listingIds).size !== listingIds.length) {
        errors.listing_ids = fewest === 0
            ? `Choose up to ${MAX_LISTINGS} of your products or services.`
            : `Choose 1 to ${MAX_LISTINGS} of your products or services.`;
    }
    if (startsOn && !validDate(startsOn)) errors.starts_on = "Enter a valid start date.";
    if (endsOn && !validDate(endsOn)) errors.ends_on = "Enter a valid end date.";
    if (startsOn && endsOn && !errors.starts_on && !errors.ends_on && endsOn < startsOn) errors.ends_on = "The end date must be on or after the start date.";
    if (coupon && goal !== "offer") errors.coupon_code = "A coupon code is only for offers.";
    else if (coupon && !COUPON.test(coupon)) errors.coupon_code = "Use 3 to 20 letters, numbers or dashes, for example MANGO10.";
    else if (coupon && !endsOn) errors.ends_on = "A coupon needs a last day: it stops working after that day.";
    else if (coupon && !errors.ends_on && endsOn < today) errors.ends_on = "That day has passed. Choose today or a later day for the coupon to end.";

    if (Object.keys(errors).length) return { errors };
    return {
        brief: {
            goal, language, call_to_action: cta, title, offer, starts_on: startsOn, ends_on: endsOn, listing_ids: listingIds,
            coupon_code: coupon, event_id: eventId,
        },
    };
}

/** Checks edited wording. Returns { errors } or { content }. */
function validateContent(body) {
    const errors = {};
    const text = (v) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");
    // Whether each channel goes out with photos; on unless the owner switched it off.
    const photos = (channel) => body?.[channel]?.photos !== false;
    const content = {
        email: { subject: text(body?.email?.subject), body: text(body?.email?.body), photos: photos("email") },
        facebook: { text: text(body?.facebook?.text), photos: photos("facebook") },
        whatsapp: { text: text(body?.whatsapp?.text), photos: photos("whatsapp") },
    };
    const check = (key, value, max, label) => {
        if (!value) errors[key] = `${label} can't be empty.`;
        else if (value.length > max) errors[key] = `${label} is too long (${max} characters at most).`;
    };
    check("email.subject", content.email.subject, LIMITS.subject, "The email subject");
    check("email.body", content.email.body, LIMITS.body, "The email");
    check("facebook.text", content.facebook.text, LIMITS.facebook, "The Facebook post");
    check("whatsapp.text", content.whatsapp.text, LIMITS.whatsapp, "The WhatsApp message");
    return Object.keys(errors).length ? { errors } : { content };
}

/** A date in Bangladesh, as YYYY-MM-DD. */
const dhakaDay = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(date));

/**
 * The facts a campaign is written from, frozen when it is created: the business, the chosen listings
 * and, for an event campaign, the event, as they are now. Returns { error } if a listing isn't one of
 * the business's approved ones, or the event isn't one of its live, upcoming events.
 */
async function buildSnapshot(db, vendorId, listingIds, eventId = null) {
    const business = (await db.query(
        `SELECT v.vendor_name, v.vendor_name_bn, v.vendor_slug, v.vendor_phone, v.vendor_whatsapp, v.vendor_address,
                v.vendor_logo_url, v.vendor_cover_url, loc.location_name, loc.location_name_bn
         FROM vendors v LEFT JOIN locations loc ON loc.location_id = v.location_id
         WHERE v.vendor_id = $1`,
        [vendorId]
    )).rows[0];
    const listings = (await db.query(
        `SELECT l.listing_id, l.listing_title, l.listing_title_bn, l.listing_description, l.listing_price,
                l.listing_price_max, l.listing_price_unit,
                (SELECT p.photo_url FROM listing_photos p WHERE p.listing_id = l.listing_id
                 ORDER BY p.photo_is_primary DESC, p.photo_sort_order, p.photo_id LIMIT 1) AS photo_url
         FROM vendor_listings l
         WHERE l.vendor_id = $1 AND l.listing_status = 'approved' AND l.listing_id = ANY($2::int[])`,
        [vendorId, listingIds]
    )).rows;
    if (!business || listings.length !== listingIds.length) {
        return { error: { listing_ids: "Choose only your own approved products or services." } };
    }
    let event = null;
    if (eventId !== null) {
        const row = (await db.query(
            `SELECT e.event_id, e.event_title, e.event_title_bn, e.event_slug, e.event_starts_at, e.event_ends_at,
                    e.event_venue, e.event_is_online, e.event_online_url, e.event_price_type, e.event_price_bdt,
                    e.event_ticket_url, e.event_image_url, loc.location_name, loc.location_name_bn
             FROM events e LEFT JOIN locations loc ON loc.location_id = e.location_id
             WHERE e.event_id = $1 AND e.vendor_id = $2 AND e.event_status = 'published'
               AND COALESCE(e.event_ends_at, e.event_starts_at) >= NOW()`,
            [eventId, vendorId]
        )).rows[0];
        if (!row) return { error: { event_id: "Choose one of your live events that hasn't happened yet." } };
        event = {
            event_id: row.event_id,
            title: row.event_title,
            title_bn: row.event_title_bn,
            slug: row.event_slug,
            starts_at: new Date(row.event_starts_at).toISOString(),
            ends_at: row.event_ends_at ? new Date(row.event_ends_at).toISOString() : null,
            venue: row.event_venue,
            area: row.location_name,
            area_bn: row.location_name_bn,
            is_online: row.event_is_online,
            online_url: row.event_online_url,
            price_type: row.event_price_type,
            price: row.event_price_bdt == null ? null : Number(row.event_price_bdt),
            ticket_url: row.event_ticket_url,
            cover_url: row.event_image_url,
            page_url: `${siteUrl()}/events/${row.event_slug}`,
        };
    }
    const byId = new Map(listings.map((l) => [l.listing_id, l]));
    return {
        snapshot: {
            taken_at: new Date().toISOString(),
            business: {
                name: business.vendor_name,
                name_bn: business.vendor_name_bn,
                slug: business.vendor_slug,
                phone: business.vendor_phone,
                whatsapp: business.vendor_whatsapp,
                address: business.vendor_address,
                area: business.location_name,
                area_bn: business.location_name_bn,
                logo_url: business.vendor_logo_url,
                cover_url: business.vendor_cover_url,
                page_url: `${siteUrl()}/business/${business.vendor_slug}`,
            },
            // In the order the owner chose them.
            listings: listingIds.map((id) => {
                const l = byId.get(id);
                return {
                    listing_id: l.listing_id,
                    title: l.listing_title,
                    title_bn: l.listing_title_bn,
                    description: l.listing_description,
                    price: l.listing_price == null ? null : Number(l.listing_price),
                    price_max: l.listing_price_max == null ? null : Number(l.listing_price_max),
                    price_unit: l.listing_price_unit,
                    photo_url: l.photo_url,
                };
            }),
            // Only for a campaign about one of the business's events (KAN-298).
            ...(event ? { event } : {}),
        },
    };
}

/** What the business needs before its campaigns look complete. */
async function readiness(db, vendorId) {
    const row = (await db.query(
        `SELECT v.vendor_status, v.vendor_logo_url, v.vendor_cover_url, coalesce(length(trim(v.vendor_description)), 0) AS description_length,
                v.vendor_phone, v.vendor_address,
                (SELECT COUNT(*)::int FROM vendor_listings l WHERE l.vendor_id = v.vendor_id AND l.listing_status = 'approved') AS approved_listings
         FROM vendors v WHERE v.vendor_id = $1`,
        [vendorId]
    )).rows[0];
    const checks = [
        { key: "approved", label: "Business approved and public", done: row.vendor_status === "approved", fix: "dashboard" },
        { key: "listings", label: "At least one approved product or service", done: row.approved_listings > 0, fix: "listings" },
        { key: "description", label: "Business description", done: row.description_length >= 20, fix: "business" },
        { key: "photo", label: "Business photo", done: Boolean(row.vendor_cover_url), fix: "business" },
        { key: "logo", label: "Logo", done: Boolean(row.vendor_logo_url), fix: "business" },
        { key: "contact", label: "Phone number and address", done: Boolean(row.vendor_phone && row.vendor_address), fix: "business" },
    ];
    // A campaign needs an approved business with something to promote; the rest makes it look better.
    const canStart = checks[0].done && checks[1].done;
    return { checks, can_start: canStart, approved_listings: row.approved_listings };
}

module.exports = { dhakaDay, todayInDhaka, couponOf, workspaceEnabled, planOf, draftingCheck, GOALS, LANGUAGES, CALLS_TO_ACTION, MAX_LISTINGS, LIMITS, validateBrief, validateContent, buildSnapshot, readiness };
