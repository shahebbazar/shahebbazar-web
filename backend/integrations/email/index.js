// Email delivery (KAN-286). One interface, two adapters:
//
//   smtp     any SMTP provider: the client's provider in production, Brevo or similar for a real
//            test send, or Mailpit (docker compose) locally, which catches every email at
//            http://localhost:8025 and sends nothing on.
//   console  prints each email to the API console instead, like the sign-in code mock. Used when
//            MARKETING_EMAIL_ENABLED isn't "true" or SMTP_HOST is missing, so nothing is ever sent
//            by accident.
//
// send(message) resolves to { messageId } when the provider accepts the email, and rejects otherwise.
// message: { from: { name, address }, replyTo?, to: { name, address }, subject, text, html, headers }

const crypto = require("crypto");
const nodemailer = require("nodemailer");

const consoleAdapter = {
    name: "console",
    async send(message) {
        const line = (label, value) => console.log(`[mock email] ${label}: ${value}`);
        line("from", `${message.from.name} <${message.from.address}>`);
        line("to", message.to.address);
        line("subject", message.subject);
        line("unsubscribe", message.unsubscribeUrl);
        return { messageId: `console-${crypto.randomUUID()}` };
    },
};

let transport;
function smtpTransport() {
    transport ??= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        pool: true,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
    });
    return transport;
}

const smtpAdapter = {
    name: "smtp",
    async send(message) {
        const info = await smtpTransport().sendMail({
            from: message.from,
            replyTo: message.replyTo,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
            headers: message.headers,
        });
        return { messageId: info.messageId };
    },
};

/** The adapter in use: SMTP only when switched on and configured. */
function emailAdapter() {
    return process.env.MARKETING_EMAIL_ENABLED === "true" && process.env.SMTP_HOST ? smtpAdapter : consoleAdapter;
}

/** The address marketing emails come from. Shaheb Bazar owns it; the business is the display name. */
function senderAddress() {
    return process.env.MARKETING_EMAIL_FROM || "offers@shahebbazar.com";
}

module.exports = { emailAdapter, senderAddress };
