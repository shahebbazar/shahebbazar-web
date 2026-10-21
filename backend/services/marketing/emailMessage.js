// Builds one campaign email for one customer (KAN-286): the approved wording, the product photos
// if the owner kept them, and the customer's own unsubscribe link, both in the email and as the
// one-click List-Unsubscribe header (RFC 8058) that mail apps show as an "Unsubscribe" button.

const { apiUrl, assetUrl } = require("../../lib/site");
const { senderAddress } = require("../../integrations/email");
const { unsubscribeToken, unsubscribeUrl } = require("./consent");

const FOOTER = {
    en: {
        why: (name) => `You get this because you chose to get offers from ${name} on Shaheb Bazar.`,
        stop: "Unsubscribe",
        stopText: (url) => `Unsubscribe: ${url}`,
    },
    bn: {
        why: (name) => `আপনি সাহেব বাজারে ${name}-এর অফার পেতে চেয়েছেন বলে এই ইমেইল পেয়েছেন।`,
        stop: "আর অফার চাই না",
        stopText: (url) => `আর অফার চাই না: ${url}`,
    },
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Escaped text with web addresses made into links and line breaks kept. Paragraphs are separated by
 * a blank line (<br><br>) rather than CSS margins, which some mail apps ignore.
 */
function bodyHtml(text) {
    return escapeHtml(text)
        .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" style="color:#1d4ed8">${url}</a>`)
        .replace(/\n/g, "<br>\n");
}

// The card is 600px wide with 24px each side, so photos share 552px.
const CONTENT_WIDTH = 552;
const PHOTO_GAP = 8;

/**
 * The product photos side by side, each in an equal share of a full-width row, shrinking with the
 * screen. The pixel width attribute is for Outlook on Windows, which ignores the CSS width.
 */
function photosHtml(photos) {
    const width = Math.floor((CONTENT_WIDTH - PHOTO_GAP * (photos.length - 1)) / photos.length);
    const share = Math.floor(100 / photos.length);
    const cells = photos.map((src, i) =>
        `<td valign="top" width="${share}%" style="padding-left:${i ? PHOTO_GAP : 0}px"><img src="${escapeHtml(src)}" alt="" width="${width}" border="0" style="width:100%;max-width:${width}px;height:auto"></td>`);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells.join("")}</tr></table>`;
}

/**
 * campaign: the campaign row; content: the approved version's content; recipient: { user_id, user_name, address };
 * replyTo: the business's own email, if it has one.
 */
function buildCampaignEmail({ campaign, content, recipient, replyTo }) {
    const snapshot = campaign.campaign_source_snapshot;
    const lang = campaign.campaign_language === "bn" ? "bn" : "en";
    const name = lang === "bn" && snapshot.business.name_bn ? snapshot.business.name_bn : snapshot.business.name;
    const footer = FOOTER[lang];
    const unsubscribe = unsubscribeUrl(recipient.user_id, campaign.vendor_id, "email");
    const oneClick = `${apiUrl()}/api/unsubscribe/${unsubscribeToken(recipient.user_id, campaign.vendor_id, "email")}`;
    const photos = content.email.photos === false ? [] : snapshot.listings.map((l) => assetUrl(l.photo_url)).filter(Boolean);

    // Email-safe and phone-first: a full-width table for the background, and a card that fills a
    // phone screen and stops at 600px elsewhere. Colours are attributes, because many mail apps drop
    // <body> styles. Outlook on Windows ignores max-width, so a table only it reads holds it at 600px.
    const font = "font-family:Arial,Helvetica,sans-serif";
    const html = `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(content.email.subject)}</title></head>
<body style="margin:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9">
<tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;${font};font-size:16px;color:#1e293b"><strong>${escapeHtml(name)}</strong> <span style="font-size:13px;color:#64748b">via Shaheb Bazar</span></td></tr>
${photos.length ? `<tr><td style="padding:16px 24px 0">${photosHtml(photos)}</td></tr>` : ""}
<tr><td style="padding:20px 24px;${font};font-size:15px;color:#1e293b;word-wrap:break-word;word-break:break-word">
${bodyHtml(content.email.body)}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;${font};font-size:12px;color:#64748b">
${escapeHtml(footer.why(name))} <a href="${escapeHtml(unsubscribe)}" style="color:#64748b">${footer.stop}</a>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

    const text = `${content.email.body}\n\n--\n${footer.why(name)}\n${footer.stopText(unsubscribe)}\n`;

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

module.exports = { buildCampaignEmail, bodyHtml, escapeHtml };
