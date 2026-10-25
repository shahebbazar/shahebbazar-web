// One message for a campaign's three channels: the owner writes it once and the email, Facebook post and
// WhatsApp message are made from it as they type. The same as channelsFromMessage in
// backend/services/marketing/templates.js, which writes the first drafts; the two must stay alike.

const HELLO = { en: "Hello,", bn: "প্রিয় গ্রাহক," };

const tag = (s: string) => `#${s.replace(/[^\p{L}\p{N}]+/gu, "")}`;

export type Channels = { email: string; facebook: string; whatsapp: string };

/** The email adds a greeting and signs off with the business's name, Facebook adds hashtags, WhatsApp makes the first line bold. */
export function channelsFromMessage(message: string, { lang, name }: { lang: "en" | "bn"; name: string }): Channels {
    const text = message.replace(/\r\n/g, "\n").trim();
    const [first, ...rest] = text.split("\n");
    const bold = /^\*.*\*$/.test(first.trim()) || !first.trim() ? first : `*${first.trim()}*`;
    return {
        email: [HELLO[lang], "", text, "", name].join("\n"),
        facebook: [text, "", [tag(name), "#Rajshahi", "#ShahebBazar"].join(" ")].join("\n"),
        whatsapp: [bold, ...rest].join("\n"),
    };
}

/**
 * A message to start from for a campaign saved before there was one: its Facebook post without the
 * hashtag line, which is the closest of the three to the plain message.
 */
export function messageFromFacebook(text: string): string {
    return text.replace(/\n+#[^\n]*$/, "").trim();
}
