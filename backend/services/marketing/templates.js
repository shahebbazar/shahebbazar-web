// Campaign templates (KAN-285): turn a business owner's brief and the saved snapshot into email,
// Facebook and WhatsApp drafts, in English or Bangla.
//
// Each goal has its own shape: new stock shows what's arrived, an offer leads with the deal and how
// long it runs, an event is an invitation with when and where, a reminder shows customer favourites.
// Drafts only use facts from the snapshot (business and listing details as saved) and words the owner
// typed (the offer or event details). Nothing is invented: a listing without a price shows no price,
// and anything a goal needs but the owner did not give becomes a [[placeholder]] that blocks approval.

const PLACEHOLDER = /\[\[[^\]]+\]\]/g;

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const bnDigits = (text) => String(text).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

const COPY = {
    en: {
        hello: "Hello,",
        more: (n) => (n > 0 ? " and more" : ""),
        goals: {
            new_stock: {
                subject: (b, first, more) => `Just in at ${b}: ${first}${more}`,
                headline: (b) => `Just in at ${b}!`,
                intro: (b) => `Fresh in at ${b}. Here's what's new:`,
                extra: (text) => `Plus: ${text}`,
                closing: "Come and see what's new.",
            },
            offer: {
                subject: (b, _first, _more, detail) => `${detail} at ${b}`,
                headline: (b, detail) => `${detail} at ${b}!`,
                intro: (b, detail) => `Good news from ${b}: ${detail}`,
                itemsHeading: "On:",
                dates: (range) => `Offer runs ${range}.`,
                coupon: (code, end) => `Use code ${code} when you visit or order, until ${end}.`,
                closing: "Don't miss out.",
            },
            event: {
                subject: (b, _first, _more, detail) => `You're invited: ${detail} at ${b}`,
                headline: (b, detail) => `Join us for ${detail} at ${b}!`,
                intro: (b, detail) => `${b} invites you to ${detail}.`,
                when: (range) => `When: ${range}`,
                where: (address) => `Where: ${address}`,
                itemsHeading: "Featuring:",
                closing: "We'd love to see you there.",
            },
            reminder: {
                subject: (b) => `${b} is here for you`,
                headline: (b) => `${b} is here for you!`,
                intro: (b) => `Just a reminder that ${b} is here whenever you need us.`,
                itemsHeading: "Customer favourites:",
                extra: (text) => text,
                closing: "We look forward to seeing you again.",
            },
        },
        range: { between: (a, b) => `${a} to ${b}`, from: (a) => `from ${a}`, until: (b) => `until ${b}` },
        datesLine: (range) => `Available ${range}.`,
        per: (unit) => ` per ${unit}`,
        cta: {
            visit: (s) => `Visit us at ${s.address}.`,
            call: (s) => `Call us on ${s.phone}.`,
            message: (s) => `Send us a message on Shahebbazar: ${s.page_url}`,
            order: (s) => `To order, call ${s.phone} or send us a message on Shahebbazar.`,
        },
        see: (url) => `See more: ${url}`,
        missing: {
            offer: "[[Describe your offer, for example 10% off all mangoes this week]]",
            event: "[[Say what the event is, for example our Eid mango fair]]",
            date: "[[Add the date]]",
            address: "[[Add your shop address in My Business]]",
            phone: "[[Add your phone number in My Business]]",
        },
        fmtDate: (d) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Dhaka" }).format(d),
        money: (n) => `৳${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
    },
    bn: {
        hello: "প্রিয় গ্রাহক,",
        more: (n) => (n > 0 ? " ও আরও" : ""),
        goals: {
            new_stock: {
                subject: (b, first, more) => `${b}-এ নতুন এসেছে: ${first}${more}`,
                headline: (b) => `${b}-এ নতুন এসেছে!`,
                intro: (b) => `${b}-এ নতুন এসেছে। দেখে নিন:`,
                extra: (text) => `সাথে: ${text}`,
                closing: "এসে দেখে যান।",
            },
            offer: {
                subject: (b, _first, _more, detail) => `${b}-এর অফার: ${detail}`,
                headline: (b, detail) => `${b}-এর অফার: ${detail}!`,
                intro: (b, detail) => `${b} থেকে সুখবর: ${detail}`,
                itemsHeading: "যেসব পণ্যে:",
                dates: (range) => `অফার চলবে ${range}।`,
                coupon: (code, end) => `${end} পর্যন্ত দোকানে এসে বা অর্ডারের সময় কোড ${code} বলুন।`,
                closing: "সুযোগটি হাতছাড়া করবেন না।",
            },
            event: {
                subject: (b, _first, _more, detail) => `আমন্ত্রণ: ${b}-এ ${detail}`,
                headline: (b, detail) => `${b}-এ ${detail}-এ আসুন!`,
                intro: (b, detail) => `${b} আপনাকে ${detail}-এ আমন্ত্রণ জানাচ্ছে।`,
                when: (range) => `কবে: ${range}`,
                where: (address) => `কোথায়: ${address}`,
                itemsHeading: "থাকছে:",
                closing: "আপনাকে দেখার অপেক্ষায় রইলাম।",
            },
            reminder: {
                subject: (b) => `${b} সবসময় আপনার পাশে`,
                headline: (b) => `${b} সবসময় আপনার পাশে!`,
                intro: (b) => `মনে করিয়ে দিচ্ছি, প্রয়োজনে ${b} সবসময় আছে।`,
                itemsHeading: "গ্রাহকদের পছন্দ:",
                extra: (text) => text,
                closing: "আবার দেখা হওয়ার অপেক্ষায়।",
            },
        },
        range: { between: (a, b) => `${a} থেকে ${b}`, from: (a) => `${a} থেকে`, until: (b) => `${b} পর্যন্ত` },
        datesLine: (range) => `পাওয়া যাবে ${range}।`,
        per: (unit) => ` (প্রতি ${unit})`,
        cta: {
            visit: (s) => `আমাদের দোকানে আসুন: ${s.address}।`,
            call: (s) => `কল করুন: ${s.phone}।`,
            message: (s) => `Shahebbazar-এ আমাদের বার্তা পাঠান: ${s.page_url}`,
            order: (s) => `অর্ডার করতে কল করুন ${s.phone} অথবা Shahebbazar-এ বার্তা পাঠান।`,
        },
        see: (url) => `আরও দেখুন: ${url}`,
        missing: {
            offer: "[[আপনার অফার লিখুন, যেমন এই সপ্তাহে সব আমে ১০% ছাড়]]",
            event: "[[অনুষ্ঠানটি কী তা লিখুন, যেমন ঈদ আম মেলা]]",
            date: "[[তারিখ যোগ করুন]]",
            address: "[[My Business-এ আপনার দোকানের ঠিকানা যোগ করুন]]",
            phone: "[[My Business-এ আপনার ফোন নম্বর যোগ করুন]]",
        },
        fmtDate: (d) => new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "long", timeZone: "Asia/Dhaka" }).format(d),
        money: (n) => `৳${bnDigits(Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }))}`,
    },
};

const pick = (lang, en, bn) => (lang === "bn" && bn ? bn : en);

/** "৳450", "৳350–৳700 per kg"; null when the listing has no price. */
function priceText(c, listing) {
    if (listing.price == null) return null;
    const range = listing.price_max != null && Number(listing.price_max) > Number(listing.price)
        ? `${c.money(listing.price)}–${c.money(listing.price_max)}`
        : c.money(listing.price);
    return range + (listing.price_unit ? c.per(listing.price_unit) : "");
}

/** "1 November to 3 November", "from 1 November", "until 3 November", or null without dates. */
const dayText = (c, iso) => (iso ? c.fmtDate(new Date(`${iso}T00:00:00+06:00`)) : null);

function rangeText(c, brief) {
    const d = (iso) => dayText(c, iso);
    if (brief.starts_on && brief.ends_on) return c.range.between(d(brief.starts_on), d(brief.ends_on));
    if (brief.starts_on) return c.range.from(d(brief.starts_on));
    if (brief.ends_on) return c.range.until(d(brief.ends_on));
    return null;
}

/** The facts the drafts may use, with missing ones replaced by placeholders where a sentence needs them. */
function facts(c, snapshot, lang) {
    const b = snapshot.business;
    // The area is added only when the address doesn't already name it (checked in English, as addresses are).
    const area = pick(lang, b.area, b.area_bn);
    const address = b.address ? (area && b.area && !b.address.includes(b.area) ? `${b.address}, ${area}` : b.address) : null;
    return {
        name: pick(lang, b.name, b.name_bn),
        address: address ?? c.missing.address,
        phone: b.phone ?? c.missing.phone,
        page_url: b.page_url,
    };
}

/**
 * Builds the drafts for a brief. Returns { email: { subject, body, photos }, facebook: { text, photos },
 * whatsapp: { text, photos } }, with photos on for every channel.
 * `snapshot` is from campaigns.buildSnapshot(); `brief` is the validated brief. `brief.offer` is the
 * owner's own words: the offer, the event, or an extra line for new stock and reminders.
 */
function generateDrafts(snapshot, brief) {
    const lang = brief.language;
    const c = COPY[lang];
    const g = c.goals[brief.goal];
    const f = facts(c, snapshot, lang);
    const own = brief.offer?.trim() || null;
    const detail = brief.goal === "offer" ? own ?? c.missing.offer : brief.goal === "event" ? own ?? c.missing.event : own;
    const items = snapshot.listings.map((l) => {
        const title = pick(lang, l.title, l.title_bn);
        const price = priceText(c, l);
        return { title, line: `• ${price ? `${title}: ${price}` : title}` };
    });
    const range = rangeText(c, brief);
    // An event already says where, so "Visit us at" would repeat the address.
    const cta = brief.goal === "event" && brief.call_to_action === "visit" ? null : c.cta[brief.call_to_action](f);
    const ctaLines = cta ? [cta] : [];

    // The goal-specific middle of the message.
    const middle = [];
    if (g.itemsHeading) middle.push(g.itemsHeading);
    middle.push(...items.map((i) => i.line));
    if (brief.goal === "offer" && range) middle.push("", g.dates(range));
    if (brief.goal === "offer" && brief.coupon_code) middle.push("", g.coupon(brief.coupon_code, dayText(c, brief.ends_on ?? "") ?? c.missing.date));
    if (brief.goal === "event") middle.unshift(g.when(range ?? c.missing.date), g.where(f.address), "");
    if ((brief.goal === "new_stock" || brief.goal === "reminder") && detail) middle.push("", g.extra(detail));
    if ((brief.goal === "new_stock" || brief.goal === "reminder") && range) middle.push("", c.datesLine(range));

    const subject = g.subject(f.name, items[0].title, c.more(items.length - 1), detail);
    const body = [c.hello, "", g.intro(f.name, detail), "", ...middle, "", g.closing, "", ...ctaLines, c.see(f.page_url), "", f.name].join("\n");

    const tag = (s) => `#${s.replace(/[^\p{L}\p{N}]+/gu, "")}`;
    const facebook = [
        g.headline(f.name, detail),
        "",
        ...middle,
        "",
        ...ctaLines,
        f.page_url,
        "",
        [tag(f.name), "#Rajshahi", "#ShahebBazar"].join(" "),
    ].join("\n");

    const whatsapp = [`*${g.headline(f.name, detail)}*`, ...middle.filter(Boolean), ...ctaLines, f.page_url].join("\n");

    return { email: { subject, body, photos: true }, facebook: { text: facebook, photos: true }, whatsapp: { text: whatsapp, photos: true } };
}

/**
 * Notes for the owner about what the drafts left out. These don't block approval; anything that does
 * (a missing offer, event, date, address or phone number) is a [[placeholder]] in the text instead.
 */
function warnings(snapshot) {
    const out = [];
    for (const l of snapshot.listings) {
        if (l.price == null) out.push(`${l.title} has no price, so the drafts don't mention one.`);
        if (!l.photo_url) out.push(`${l.title} has no photo; add one in Products & Services so the email can show it.`);
    }
    return out;
}

/** Every [[placeholder]] still left in a version's content. */
function placeholdersIn(content) {
    const texts = [content.email.subject, content.email.body, content.facebook.text, content.whatsapp.text];
    return [...new Set(texts.flatMap((t) => String(t).match(PLACEHOLDER) ?? []))];
}

module.exports = { generateDrafts, warnings, placeholdersIn };
