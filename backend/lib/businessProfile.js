// Validation and normalisation for the Add / Edit Business form.

const LIMITS = {
    nameMin: 2,
    nameMax: 120,
    addressMax: 300,
    descriptionMin: 20,
    // Matches the counter in the design ("108 / 500").
    descriptionMax: 500,
    categoriesMax: 3,
    factsMax: 12,
    factLabelMax: 60, // vendor_facts.fact_label
    factValueMax: 120, // vendor_facts.fact_value
    emailMax: 255,
    websiteMax: 255,
    photosMax: 6,
};

const SOCIAL_PLATFORMS = {
    facebook: ["facebook.com", "fb.com", "fb.me"],
    instagram: ["instagram.com"],
    youtube: ["youtube.com", "youtu.be"],
    tiktok: ["tiktok.com"],
};

const HOURS_MODES = new Set(["open", "closed", "24h"]);
// What a business's second number is (vendors.vendor_phone_alt_type).
const ALT_PHONE_TYPES = ["landline", "mobile", "whatsapp"];

// Normalises a Bangladeshi phone number to +880 form.
function normalisePhone(raw) {
    if (typeof raw !== "string") return null;
    const compact = raw.replace(/[\s\-().]/g, "");
    let national;
    if (/^\+880\d+$/.test(compact)) national = compact.slice(4);
    else if (/^880\d+$/.test(compact)) national = compact.slice(3);
    else if (/^0\d+$/.test(compact)) national = compact.slice(1);
    else return null;

    if (national.startsWith("1")) {
        return /^1[3-9]\d{8}$/.test(national) ? `+880${national}` : null;
    }
    return /^[2-9]\d{6,9}$/.test(national) ? `+880${national}` : null;
}

/** Deliberately loose: one @, something either side, a dot in the domain. */
function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= LIMITS.emailMax;
}

// Parses a user-typed web address, adding https:// when no scheme is given.
function parseWebAddress(raw) {
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const text = raw.trim();
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
    let url;
    try {
        url = new URL(withScheme);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url;
}

// Website as stored: host and path without the scheme, matching the existing rows ("www.padmaview.example").
function normaliseWebsite(raw) {
    const url = parseWebAddress(raw);
    if (!url) return null;
    const stored = `${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
    return stored.length <= LIMITS.websiteMax ? stored : null;
}

/** A social profile URL, only on that platform's own domains. */
function normaliseSocial(platform, raw) {
    const url = parseWebAddress(raw);
    if (!url) return null;
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");
    const allowed = SOCIAL_PLATFORMS[platform];
    if (!allowed || !allowed.some((d) => host === d || host.endsWith(`.${d}`))) return null;
    if (url.pathname === "/" || url.pathname === "") return null; // the site, not a profile
    url.protocol = "https:";
    url.hash = "";
    const stored = url.toString();
    return stored.length <= 255 ? stored : null;
}

/** "HH:MM" or "HH:MM:SS", 00:00-23:59. Returns "HH:MM" or null. */
function normaliseTime(raw) {
    if (typeof raw !== "string") return null;
    const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(raw);
    return m ? `${m[1]}:${m[2]}` : null;
}

function text(value) {
    return typeof value === "string" ? value.trim() : "";
}

// Validates a full form submission; errors are keyed by field so the form can show each beside its field.
function validateProfile(body) {
    const errors = {};
    const input = body && typeof body === "object" ? body : {};

    // ---- basic information
    const name = text(input.name);
    if (name.length < LIMITS.nameMin) errors.name = "Enter the business name.";
    else if (name.length > LIMITS.nameMax) errors.name = `Keep the name under ${LIMITS.nameMax} characters.`;

    const nameBn = text(input.name_bn);
    if (nameBn.length > LIMITS.nameMax) errors.name_bn = `Keep the name under ${LIMITS.nameMax} characters.`;

    const categoryIds = Array.isArray(input.category_ids)
        ? [...new Set(input.category_ids.filter((id) => Number.isInteger(id) && id > 0))]
        : [];
    if (categoryIds.length === 0) errors.category_ids = "Choose a category.";
    else if (categoryIds.length > LIMITS.categoriesMax)
        errors.category_ids = `Choose at most ${LIMITS.categoriesMax} categories.`;

    const locationId = Number.isInteger(input.location_id) && input.location_id > 0 ? input.location_id : null;
    if (locationId === null) errors.location_id = "Choose the area.";

    const address = text(input.address);
    if (address.length < 5) errors.address = "Enter the full address so customers can find you.";
    else if (address.length > LIMITS.addressMax) errors.address = `Keep the address under ${LIMITS.addressMax} characters.`;

    // The contact number is the owner's sign-in mobile, which the save route passes in (it can't be
    // changed in the form). One mobile per account; any other number is the second number.
    const phone = normalisePhone(input.phone);
    if (!phone) errors.phone = "Enter a Bangladeshi mobile number, e.g. +8801712345678.";
    else if (!phone.startsWith("+8801")) errors.phone = "This must be a mobile number. Add a landline as the Second Number instead.";

    // A second number, optional, with its type: an office landline (0721-775544), or a mobile or
    // WhatsApp number (+8801712345678).
    let altPhone = null;
    let altPhoneType = null;
    if (text(input.alt_phone)) {
        altPhoneType = ALT_PHONE_TYPES.includes(input.alt_phone_type) ? input.alt_phone_type : "landline";
        altPhone = normalisePhone(input.alt_phone);
        const isMobile = /^\+8801/.test(altPhone ?? "");
        if (!altPhone) errors.alt_phone = "Enter a Bangladeshi number, or leave it empty.";
        else if (altPhoneType !== "landline" && !isMobile) errors.alt_phone = "That's a landline number. Choose Landline, or enter a mobile number such as +8801712345678.";
        else if (altPhoneType === "landline" && isMobile) errors.alt_phone = "That's a mobile number. Choose Mobile or WhatsApp, or enter a landline such as 0721-775544.";
        else if (altPhone === phone) errors.alt_phone = "This is the same as your contact number; leave it empty.";
    }
    // The WhatsApp number, kept for anything that reads it: the second number when it is one.
    const whatsapp = altPhoneType === "whatsapp" ? altPhone : null;

    const description = text(input.description);
    if (description.length < LIMITS.descriptionMin)
        errors.description = `Describe the business in at least ${LIMITS.descriptionMin} characters.`;
    else if (description.length > LIMITS.descriptionMax)
        errors.description = `Keep the description under ${LIMITS.descriptionMax} characters.`;

    // ---- contact and additional information
    let email = null;
    if (text(input.email)) {
        email = text(input.email).toLowerCase();
        if (!isEmail(email)) errors.email = "Enter a valid email address, or leave it empty.";
    }

    let website = null;
    if (text(input.website)) {
        website = normaliseWebsite(input.website);
        if (!website) errors.website = "Enter a web address such as www.example.com.";
    }

    const facts = [];
    const rawFacts = Array.isArray(input.facts) ? input.facts : [];
    if (rawFacts.length > LIMITS.factsMax) errors.facts = `Add at most ${LIMITS.factsMax} details.`;
    const seenFacts = new Set();
    rawFacts.slice(0, LIMITS.factsMax).forEach((fact, i) => {
        const label = text(fact?.label);
        const value = text(fact?.value);
        const group = fact?.group === "quick" ? "quick" : "about";
        if (!label && !value) return; // an empty row is ignored, not an error
        if (!label) errors[`facts.${i}.label`] = "Add a label.";
        else if (label.length > LIMITS.factLabelMax) errors[`facts.${i}.label`] = `Keep it under ${LIMITS.factLabelMax} characters.`;
        if (!value) errors[`facts.${i}.value`] = "Add a value.";
        else if (value.length > LIMITS.factValueMax) errors[`facts.${i}.value`] = `Keep it under ${LIMITS.factValueMax} characters.`;
        const key = `${group}|${label.toLowerCase()}`;
        if (label && seenFacts.has(key)) errors[`facts.${i}.label`] = "This label is already used in the same place.";
        seenFacts.add(key);
        facts.push({ label, value, group });
    });

    // ---- social links
    const social = [];
    const rawSocial = input.social && typeof input.social === "object" ? input.social : {};
    for (const platform of Object.keys(SOCIAL_PLATFORMS)) {
        const raw = text(rawSocial[platform]);
        if (!raw) continue;
        const url = normaliseSocial(platform, raw);
        if (!url) errors[`social.${platform}`] = `Paste the link to your ${platform === "youtube" ? "YouTube" : platform === "tiktok" ? "TikTok" : platform[0].toUpperCase() + platform.slice(1)} page.`;
        else social.push({ platform, url });
    }

    // ---- opening hours: one entry per day that is set, 0 = Sunday
    const hours = [];
    const rawHours = Array.isArray(input.hours) ? input.hours : [];
    const seenDays = new Set();
    for (const entry of rawHours) {
        const day = entry?.day;
        if (!Number.isInteger(day) || day < 0 || day > 6 || seenDays.has(day)) {
            errors.hours = "Opening hours are malformed. Reload the page and try again.";
            break;
        }
        seenDays.add(day);
        if (!HOURS_MODES.has(entry.mode)) {
            errors[`hours.${day}`] = "Choose open, closed or 24 hours.";
            continue;
        }
        if (entry.mode !== "open") {
            hours.push({ day, mode: entry.mode, open: null, close: null });
            continue;
        }
        const open = normaliseTime(entry.open);
        const close = normaliseTime(entry.close);
        if (!open || !close) errors[`hours.${day}`] = "Enter both opening and closing times.";
        // The open-now badge compares LOCALTIME BETWEEN open AND close, so
        // a closing time past midnight would read as closed all day.
        else if (close <= open)
            errors[`hours.${day}`] = "Closing time must be after opening time. For past midnight, choose 24 hours.";
        else hours.push({ day, mode: "open", open, close });
    }

    const photoOrder = Array.isArray(input.photo_order)
        ? [...new Set(input.photo_order.filter((id) => Number.isInteger(id) && id > 0 && id <= 2147483647))]
        : [];

    return {
        errors,
        value: {
            name,
            nameBn: nameBn || null,
            categoryIds,
            locationId,
            address,
            phone,
            whatsapp,
            altPhone,
            altPhoneType,
            description,
            email,
            website,
            facts,
            social,
            hours,
            photoOrder,
            submit: input.submit === true,
        },
    };
}

module.exports = {
    LIMITS,
    SOCIAL_PLATFORMS,
    normalisePhone,
    normaliseWebsite,
    normaliseSocial,
    normaliseTime,
    validateProfile,
};
