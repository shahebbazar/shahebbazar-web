import { apiGet } from "@/lib/api";
import { formatEventRange } from "@/lib/format";
import { SITE_URL } from "@/lib/seo";
import { shareCard } from "@/lib/shareCard";
import type { EventDetail } from "@/lib/types";

// Link-preview card for an event page.

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    let event;
    try {
        event = await apiGet<EventDetail>(`/events/${encodeURIComponent(slug)}`);
    } catch {
        return Response.redirect(new URL("/og.png", SITE_URL), 307);
    }
    if (!event) return new Response("Not found", { status: 404 });

    const place = event.event_venue ?? (event.area_name ? `${event.area_name}, Rajshahi` : "Rajshahi");

    return shareCard({
        label: "Event",
        title: event.event_title,
        subtitle: formatEventRange(event.event_starts_at, event.event_ends_at),
        path: `/events/${event.event_slug}`,
        detail: <span style={{ fontSize: 30, color: "#64748b" }}>{place}</span>,
    });
}
