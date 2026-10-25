// Builds one campaign email for one customer (KAN-286, KAN-287): the approved wording, product cards
// if the owner kept the photos, the offer's coupon, buttons to reply on Shaheb Bazar, see the page,
// call and get directions, and the customer's own unsubscribe link, both in the email and as the
// one-click List-Unsubscribe header (RFC 8058) that mail apps show as an "Unsubscribe" button.
//
// Email-safe and phone-first: tables for layout, inline styles and colour attributes (many mail apps
// drop <style> and <body> styles), a card that fills a phone screen and stops at 600px elsewhere,
// and buttons that wrap onto new lines on a narrow screen.

const { apiUrl, assetUrl, siteUrl } = require("../../lib/site");
const { senderAddress } = require("../../integrations/email");
const { unsubscribeToken, unsubscribeUrl } = require("./consent");
const { displayPhone } = require("../../lib/phone");
const { listingPrice, channelsFromMessage } = require("./templates");

const COPY = {
    en: {
        // Replies belong in the business's Shaheb Bazar inbox, not an email inbox.
        reply: "Reply on Shaheb Bazar",
        replyText: (url) => `Reply on Shaheb Bazar: ${url}`,
        page: "View our page",
        pageLink: "our page on Shaheb Bazar",
        eventLink: "the event's page on Shaheb Bazar",
        pageText: (url) => `Our page: ${url}`,
        call: (phone) => `Call ${phone}`,
        directions: "Get directions",
        view: "View",
        couponLabel: "Your code",
        couponUntil: (day) => `Show this code when you visit or order. Valid until ${day}.`,
        share: "Know someone who'd like this? Send it on:",
        sentWith: "Sent with Shaheb Bazar, Rajshahi's local business directory.",
        why: (name) => `You get this because you chose to get offers from ${name} on Shaheb Bazar.`,
        stop: "Unsubscribe",
        stopText: (url) => `Unsubscribe: ${url}`,
        day: (d) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" }).format(d),
    },
    bn: {
        reply: "সাহেব বাজারে উত্তর দিন",
        replyText: (url) => `সাহেব বাজারে উত্তর দিন: ${url}`,
        page: "আমাদের পেজ দেখুন",
        pageLink: "সাহেব বাজারে আমাদের পেজ",
        eventLink: "সাহেব বাজারে ইভেন্টের পেজ",
        pageText: (url) => `আমাদের পেজ: ${url}`,
        call: (phone) => `কল করুন ${phone}`,
        directions: "পথ দেখুন",
        view: "দেখুন",
        couponLabel: "আপনার কোড",
        couponUntil: (day) => `দোকানে এসে বা অর্ডারের সময় কোডটি দেখান। ${day} পর্যন্ত চলবে।`,
        share: "পরিচিত কারও কাজে লাগবে? পাঠিয়ে দিন:",
        sentWith: "সাহেব বাজার থেকে পাঠানো, রাজশাহীর স্থানীয় ব্যবসার তালিকা।",
        why: (name) => `আপনি সাহেব বাজারে ${name}-এর অফার পেতে চেয়েছেন বলে এই ইমেইল পেয়েছেন।`,
        stop: "আর অফার চাই না",
        stopText: (url) => `আর অফার চাই না: ${url}`,
        day: (d) => new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" }).format(d),
    },
};

const BRAND = "#2563eb";
const INK = "#1e293b";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
// The header and footer bands: dark in every mail app.
const NIGHT = "#0f172a";
const NIGHT_MUTED = "#94a3b8";
const FONT = "font-family:Arial,Helvetica,sans-serif";

// Mail apps that follow the phone's dark mode (Apple Mail, Outlook on phones) read this; others keep
// the light card. A switch inside the email isn't possible: mail apps don't run scripts.
const DARK_STYLE = `<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .sb-page { background: #020617 !important; }
  .sb-card { background: #111827 !important; }
  .sb-text { color: #e5e7eb !important; }
  .sb-muted { color: #9ca3af !important; }
  .sb-line { border-color: #334155 !important; }
  .sb-soft { background: #0b1220 !important; }
}
</style>`;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Escaped text with web addresses made into links and line breaks kept. Paragraphs are separated by
 * a blank line (<br><br>) rather than CSS margins, which some mail apps ignore.
 */
const LINK = "color:#1d4ed8;font-weight:bold";

/** A web address as people read it: no "https://", no "www.", no tracking marks. */
const shortUrl = (url) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");

/**
 * The email's text as HTML. Web addresses become links with readable words (`labelFor(url)`, or the
 * address without its "https://" and tracking marks), and Bangladeshi mobile numbers become tap-to-call
 * links, so the email shows no raw links.
 */
function bodyHtml(text, labelFor = () => null) {
    const links = [];
    // Addresses are set aside first, so a number inside one is never turned into a phone link.
    const withoutUrls = escapeHtml(text).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => {
        const href = url.replace(/&amp;/g, "&");
        links.push(`<a href="${url}" style="${LINK}">${escapeHtml(labelFor(href) ?? shortUrl(href))}</a>`);
        return `\u0000${links.length - 1}\u0000`;
    });
    return withoutUrls
        .replace(/(?<![\w+])(?:\+?880[\s-]?|0)(1\d{3})[\s-]?(\d{6})(?!\d)/g, (number, first, rest) =>
            `<a href="tel:+880${first}${rest}" style="${LINK}">${number}</a>`)
        .replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)])
        .replace(/\n/g, "<br>\n");
}

/**
 * The business page's address with the channel and campaign added (?from=email&c=12), so a visit from
 * the link counts for the campaign (frontend ProfileViewBeacon, which then removes them).
 */
function campaignLink(pageUrl, channel, campaignId) {
    if (!campaignId) return pageUrl;
    const [base, hash] = pageUrl.split("#");
    const tracked = `${base}${base.includes("?") ? "&" : "?"}from=${channel}&c=${campaignId}`;
    return hash === undefined ? tracked : `${tracked}#${hash}`;
}

/** Text with the bare business page address (not a longer address starting with it) swapped for `to`. */
const swapPageUrl = (text, pageUrl, to) =>
    text.replace(new RegExp(`${pageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/?#-])`, "g"), () => to);

// Dates from PostgreSQL are Date objects at local midnight; the brief keeps YYYY-MM-DD.
const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => (d instanceof Date ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : d || null);
const todayInDhaka = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());

/** A solid button (the main action), drawn with a table cell so Outlook shows the colour too. */
const primaryButton = (href, label) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${BRAND}" style="border-radius:8px">`
    + `<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>`
    + `</td></tr></table>`;

/** An outlined button. Several sit in one cell so they wrap onto a new line on a phone. */
const secondaryButton = (href, label) =>
    `<a href="${escapeHtml(href)}" class="sb-text sb-line" style="display:inline-block;margin:0 8px 8px 0;padding:9px 14px;border:1px solid #cbd5e1;border-radius:8px;${FONT};font-size:13px;font-weight:bold;color:${INK};text-decoration:none;white-space:nowrap">${escapeHtml(label)}</a>`;

/** A small coloured pill linking to a share page (WhatsApp, Facebook). */
const sharePill = (href, label, colour) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 6px 6px 0;padding:7px 14px;border-radius:999px;background:${colour};${FONT};font-size:13px;font-weight:bold;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a>`;

/**
 * The header: the business's logo (or its first letter on a coloured circle, as in the editor's
 * preview) beside its name. Width and height attributes keep Outlook from showing it full size;
 * apps that ignore border-radius show a square logo.
 */
function headerHtml(name, logo) {
    const size = 44;
    const badge = logo
        ? `<img src="${escapeHtml(logo)}" alt="" width="${size}" height="${size}" border="0" style="display:block;width:${size}px;height:${size}px;border-radius:50%;object-fit:cover">`
        : `<table role="presentation" width="${size}" cellpadding="0" cellspacing="0" border="0"><tr><td width="${size}" height="${size}" align="center" valign="middle" bgcolor="#dbeafe" style="border-radius:50%;${FONT};font-size:18px;font-weight:bold;color:#1d4ed8">${escapeHtml(name.trim().charAt(0).toUpperCase() || "?")}</td></tr></table>`;
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
        + `<td valign="middle" width="${size}" style="padding-right:12px">${badge}</td>`
        + `<td valign="middle" style="${FONT};color:#ffffff"><div style="font-size:17px;font-weight:bold;line-height:1.3;color:#ffffff">${escapeHtml(name)}</div>`
        + `<div style="font-size:12px;color:${NIGHT_MUTED};line-height:1.4">via Shaheb Bazar</div></td>`
        + `</tr></table>`;
}

/**
 * One card per product: photo, name, price and a View button to the business page. Photo beside the
 * text keeps each card one row, which fits a 320px screen and every mail app.
 */
function productCardsHtml(listings, lang, pageUrl, c) {
    const thumb = 96;
    const cards = listings.map((l) => {
        const title = lang === "bn" && l.title_bn ? l.title_bn : l.title;
        const price = listingPrice(lang, l);
        const photo = assetUrl(l.photo_url);
        return `<tr><td style="padding:0 0 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sb-line" style="border:1px solid ${LINE};border-radius:10px"><tr>`
            + (photo ? `<td width="${thumb}" valign="top" style="padding:10px 0 10px 10px"><img src="${escapeHtml(photo)}" alt="" width="${thumb}" height="${thumb}" border="0" style="display:block;width:${thumb}px;height:${thumb}px;border-radius:8px;object-fit:cover"></td>` : "")
            + `<td valign="middle" class="sb-text" style="padding:12px 14px;${FONT};color:${INK}">`
            + `<div style="font-size:15px;font-weight:bold;line-height:1.35">${escapeHtml(title)}</div>`
            + (price ? `<div style="margin-top:4px;font-size:15px;font-weight:bold;color:#15803d">${escapeHtml(price)}</div>` : "")
            + `<div style="margin-top:10px"><a href="${escapeHtml(`${pageUrl}#services`)}" style="${FONT};font-size:13px;font-weight:bold;color:${BRAND};text-decoration:none">${escapeHtml(c.view)} &rarr;</a></div>`
            + `</td></tr></table></td></tr>`;
    });
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cards.join("")}</table>`;
}

/** The offer's coupon in a dashed box, while it still works. */
function couponHtml(code, endsOn, c) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
        + `<td align="center" bgcolor="#eff6ff" style="padding:16px;border:2px dashed #93c5fd;border-radius:10px;${FONT}">`
        + `<div style="font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${MUTED}">${escapeHtml(c.couponLabel)}</div>`
        + `<div style="margin-top:6px;font-size:24px;font-weight:bold;letter-spacing:3px;color:#1d4ed8">${escapeHtml(code)}</div>`
        + `<div style="margin-top:6px;font-size:13px;color:${MUTED}">${escapeHtml(c.couponUntil(c.day(new Date(`${endsOn}T00:00:00+06:00`))))}</div>`
        + `</td></tr></table>`;
}

/**
 * campaign: the campaign row; content: the approved version's content; recipient: { user_id, user_name, address };
 * replyTo: the business's own email, if it has one.
 */
function buildCampaignEmail({ campaign, content, recipient, replyTo }) {
    const snapshot = campaign.campaign_source_snapshot;
    const { business } = snapshot;
    const lang = campaign.campaign_language === "bn" ? "bn" : "en";
    const c = COPY[lang];
    const name = lang === "bn" && business.name_bn ? business.name_bn : business.name;
    const unsubscribe = unsubscribeUrl(recipient.user_id, campaign.vendor_id, "email");
    const oneClick = `${apiUrl()}/api/unsubscribe/${unsubscribeToken(recipient.user_id, campaign.vendor_id, "email")}`;
    const businessUrl = business.page_url || `${siteUrl()}/business/${encodeURIComponent(business.slug)}`;
    // A campaign about one of the business's events (KAN-298) links to the event's page instead.
    const event = campaign.campaign_goal === "event" ? snapshot.event ?? null : null;
    const plainPageUrl = event?.page_url ?? businessUrl;
    // Every link to the page counts its visits for this campaign's email.
    const pageUrl = campaignLink(plainPageUrl, "email", campaign.campaign_id);
    const body = swapPageUrl(content.email.body, plainPageUrl, pageUrl);
    // A large photo under the header: the event's cover, or the business's.
    const hero = content.email.photos !== false ? assetUrl(event?.cover_url ?? business.cover_url ?? null) : null;
    // Opens a message to the business, after logging in if needed (frontend /message/<slug>).
    const reply = `${siteUrl()}/message/${encodeURIComponent(business.slug)}`;
    const directions = business.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name}, ${business.address}`)}`
        : null;
    // Product cards replace the photo strip; switching the email's photos off leaves the text alone.
    const cards = content.email.photos === false ? [] : snapshot.listings;
    const endsOn = isoDay(campaign.campaign_ends_on);
    const coupon = campaign.campaign_coupon_code && endsOn && todayInDhaka() <= endsOn ? campaign.campaign_coupon_code : null;
    // The line inboxes show after the subject: the start of the message.
    const preheader = content.email.body.split("\n").find((line) => line.trim())?.trim().slice(0, 140) ?? "";

    const secondary = [
        secondaryButton(pageUrl, c.page),
        business.phone ? secondaryButton(`tel:${business.phone}`, c.call(displayPhone(business.phone))) : "",
        directions ? secondaryButton(directions, c.directions) : "",
    ].join("");

    const labelFor = (url) => (url.startsWith(plainPageUrl) ? (event ? c.eventLink : c.pageLink) : url.startsWith(businessUrl) ? c.pageLink : null);
    // Wording made from the one message (greeting, message, name) shows its first line as a heading;
    // wording the owner wrote for the email alone shows as written.
    const fromMessage = content.message && channelsFromMessage(content.message, { lang, name }).email === content.email.body;
    const lines = body.split("\n");
    const bodyCell = fromMessage
        ? `<div class="sb-muted" style="color:${MUTED}">${bodyHtml(lines[0], labelFor)}</div>`
            + `<div style="margin:12px 0 14px;font-size:24px;line-height:1.25;font-weight:bold">${bodyHtml(lines[2], labelFor)}</div>`
            + bodyHtml(lines.slice(3).join("\n").replace(/^\n+/, ""), labelFor)
        : bodyHtml(body, labelFor);
    // Passing it on: the friend's visit counts for this campaign, under the channel it went by.
    const shareText = (fromMessage ? lines[2] : content.email.subject).trim();
    const share = [
        sharePill(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${campaignLink(plainPageUrl, "whatsapp", campaign.campaign_id)}`)}`, "WhatsApp", "#16a34a"),
        sharePill(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(campaignLink(plainPageUrl, "facebook", campaign.campaign_id))}`, "Facebook", "#1877f2"),
    ].join("");

    const html = `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(content.email.subject)}</title>${DARK_STYLE}</head>
<body class="sb-page" style="margin:0;padding:0;background:#e2e8f0">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e2e8f0" class="sb-page">
<tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td height="4" bgcolor="${BRAND}" style="font-size:0;line-height:0;border-radius:12px 12px 0 0">&nbsp;</td></tr>
<tr><td bgcolor="${NIGHT}" style="padding:20px 24px">${headerHtml(name, assetUrl(business.logo_url))}</td></tr>
${hero ? `<tr><td bgcolor="${NIGHT}" style="padding:0"><a href="${escapeHtml(pageUrl)}"><img src="${escapeHtml(hero)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>` : ""}
<tr><td bgcolor="#ffffff" class="sb-card sb-text" style="padding:28px 24px 8px;${FONT};font-size:15px;line-height:1.6;color:${INK};word-wrap:break-word;word-break:break-word">
${bodyCell}
</td></tr>
${cards.length ? `<tr><td bgcolor="#ffffff" class="sb-card" style="padding:16px 24px 4px">${productCardsHtml(cards, lang, campaignLink(businessUrl, "email", campaign.campaign_id), c)}</td></tr>` : ""}
${coupon ? `<tr><td bgcolor="#ffffff" class="sb-card" style="padding:12px 24px 4px">${couponHtml(coupon, endsOn, c)}</td></tr>` : ""}
<tr><td bgcolor="#ffffff" class="sb-card" style="padding:20px 24px 4px">${primaryButton(reply, c.reply)}</td></tr>
<tr><td bgcolor="#ffffff" class="sb-card" style="padding:12px 24px 16px">${secondary}</td></tr>
<tr><td bgcolor="#f8fafc" class="sb-soft sb-line" style="padding:14px 24px;border-top:1px solid ${LINE};${FONT};font-size:13px;color:${MUTED}">
<div class="sb-muted" style="margin-bottom:8px;color:${MUTED}">${escapeHtml(c.share)}</div>${share}
</td></tr>
<tr><td bgcolor="${NIGHT}" style="padding:18px 24px;border-radius:0 0 12px 12px;${FONT};font-size:12px;line-height:1.6;color:${NIGHT_MUTED}">
<strong style="color:#ffffff">${escapeHtml(name)}</strong>${business.address ? ` &middot; ${escapeHtml(business.address)}` : ""}<br>
${escapeHtml(c.sentWith)}<br>
${escapeHtml(c.why(name))} <a href="${escapeHtml(unsubscribe)}" style="color:#cbd5e1">${escapeHtml(c.stop)}</a>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

    const text = [
        body,
        "",
        c.replyText(reply),
        c.pageText(pageUrl),
        "",
        "--",
        c.why(name),
        c.stopText(unsubscribe),
        "",
    ].join("\n");

    return {
        from: { name: `${name} via Shaheb Bazar`, address: senderAddress() },
        replyTo: replyTo || undefined,
        to: { name: recipient.user_name || "", address: recipient.address },
        subject: content.email.subject,
        text,
        html,
        unsubscribeUrl: unsubscribe,
        headers: {
            "List-Unsubscribe": `<${oneClick}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    };
}

module.exports = { buildCampaignEmail, bodyHtml, escapeHtml, campaignLink };
