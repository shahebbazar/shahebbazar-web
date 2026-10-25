// Shared by the public event pages, the business dashboard and the admin queue (KAN-298).

import type { EventType } from "./types";
import type { Locale } from "./i18n";

export const EVENT_TYPES: { key: EventType; en: string; bn: string }[] = [
    { key: "market", en: "Fair or market", bn: "মেলা বা হাট" },
    { key: "festival", en: "Festival", bn: "উৎসব" },
    { key: "sale", en: "Sale or offer", bn: "সেল বা অফার" },
    { key: "workshop", en: "Class or workshop", bn: "ক্লাস বা কর্মশালা" },
    { key: "launch", en: "Opening or launch", bn: "উদ্বোধন" },
    { key: "trade", en: "Trade expo", bn: "বাণিজ্য মেলা" },
    { key: "community", en: "Community", bn: "কমিউনিটি" },
    { key: "other", en: "Other", bn: "অন্যান্য" },
];

export function eventTypeLabel(type: EventType, locale: Locale = "en"): string {
    const found = EVENT_TYPES.find((t) => t.key === type) ?? EVENT_TYPES[EVENT_TYPES.length - 1];
    return found[locale];
}

/** "Free", "৳250" or "Tickets" (paid without a price). */
export function eventPrice(
    event: { event_price_type: "free" | "paid"; event_price_bdt: string | null },
    words: { free: string; ticketed: string }
): string {
    if (event.event_price_type === "free") return words.free;
    const price = event.event_price_bdt === null ? null : Number(event.event_price_bdt);
    return price === null || !Number.isFinite(price) ? words.ticketed : `৳${price.toLocaleString("en-IN")}`;
}

/** "Venue, Area", without the area when the venue already names it. */
export function venueAndArea(venue: string | null, area: string | null): string {
    if (!venue) return area ?? "";
    return area && !venue.toLowerCase().includes(area.toLowerCase()) ? `${venue}, ${area}` : venue;
}

const googleDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** A link that opens Google Calendar with the event filled in. */
export function googleCalendarUrl(event: {
    event_title: string;
    event_starts_at: string;
    event_ends_at: string | null;
    event_description: string | null;
    event_venue: string | null;
    event_is_online: boolean;
    event_online_url: string | null;
}, pageUrl: string): string {
    const end = event.event_ends_at ?? new Date(new Date(event.event_starts_at).getTime() + 2 * 3600000).toISOString();
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: event.event_title,
        dates: `${googleDate(event.event_starts_at)}/${googleDate(end)}`,
        details: [event.event_description, pageUrl].filter(Boolean).join("\n\n"),
        location: (event.event_is_online ? event.event_online_url : event.event_venue) ?? "",
        ctz: "Asia/Dhaka",
    });
    return `https://calendar.google.com/calendar/render?${params}`;
}
