import { apiGet } from "@/lib/api";
import { formatEventRange } from "@/lib/format";
import { pick, resolveLocale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/seo";
import { shareCard } from "@/lib/shareCard";
import type { EventDetail } from "@/lib/types";

// Link-preview card for an event page, with its cover photo; ?lang=bn gives the Bangla card.

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const locale = resolveLocale(new URL(req.url).searchParams.get("lang") ?? undefined);

    let event;
    try {
        event = await apiGet<EventDetail>(`/events/${encodeURIComponent(slug)}`);
    } catch {
        return Response.redirect(new URL("/og.png", SITE_URL), 307);
    }
    if (!event) return new Response("Not found", { status: 404 });

    const place = event.event_is_online
        ? locale === "bn" ? "অনলাইন" : "Online"
        : event.event_venue ?? (event.area_name ? `${event.area_name}, Rajshahi` : locale === "bn" ? "রাজশাহী" : "Rajshahi");

    return shareCard({
        label: locale === "bn" ? "ইভেন্ট" : "Event",
        title: pick(locale, event.event_title, event.event_title_bn),
        subtitle: formatEventRange(event.event_starts_at, event.event_ends_at, locale),
        detail: place,
        path: `/events/${event.event_slug}`,
        photo: event.event_image_url,
    });
}
