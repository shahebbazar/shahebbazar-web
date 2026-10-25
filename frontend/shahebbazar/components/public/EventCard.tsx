import Link from "next/link";
import { CalendarDays, Globe, MapPin, Users } from "lucide-react";
import { assetUrl } from "@/lib/api";
import { fill, localeHref, pick, type Dictionary, type Locale } from "@/lib/i18n";
import { formatEventDate, formatEventWhen, localiseDigits } from "@/lib/format";
import { eventPrice, eventTypeLabel, venueAndArea } from "@/lib/events";
import type { EventDetail } from "@/lib/types";

// An event in a grid: cover photo with the date, type, time, place and how many are going (KAN-298).
// Used on the events page and in the customer's My events.
export function EventCard({
    event,
    locale,
    copy,
    past = false,
    badge,
}: {
    event: EventDetail;
    locale: Locale;
    copy: Dictionary;
    past?: boolean;
    /** Extra label under the type, e.g. the customer's own answer. */
    badge?: React.ReactNode;
}) {
    const { month, day } = formatEventDate(event.event_starts_at);
    const cover = assetUrl(event.event_image_url);
    const title = pick(locale, event.event_title, event.event_title_bn);
    const going = event.going_count + event.interested_count;

    return (
        <article className={`relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card ${past ? "opacity-80" : ""}`}>
            <div className="relative aspect-[16/9] bg-gradient-to-br from-brand-100 to-brand-200">
                {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="size-full object-cover" loading="lazy" />
                )}
                <span className="absolute top-3 left-3 grid size-12 place-items-center rounded-lg bg-surface/95 leading-none shadow-card" aria-hidden>
                    <span className="text-[0.625rem] font-semibold text-brand-600">{month}</span>
                    <span className="text-lg font-bold">{day}</span>
                </span>
                <span className="absolute top-3 right-3 rounded-full bg-surface/95 px-2 py-0.5 text-[0.6875rem] font-semibold text-ink shadow-card">
                    {eventPrice(event, copy)}
                </span>
            </div>
            <div className="flex flex-1 flex-col p-4">
                <p className="flex flex-wrap items-center gap-2 text-[0.75rem] font-semibold tracking-wide text-brand-600 uppercase">
                    {eventTypeLabel(event.event_type, locale)}
                    {event.event_status === "cancelled" && (
                        <span className="rounded-full bg-error-bg px-2 py-0.5 tracking-normal text-error-ink normal-case">{copy.eventCancelled}</span>
                    )}
                    {badge}
                </p>
                <h3 className="mt-0.5 font-semibold leading-snug">
                    {/* The link covers the whole card. */}
                    <Link href={localeHref(`/events/${event.event_slug}`, locale)} className="after:absolute after:inset-0 hover:text-brand-600">
                        {title}
                    </Link>
                </h3>
                <p className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] text-muted">
                    <CalendarDays className="mt-0.5 size-3.5 shrink-0" /> {formatEventWhen(event.event_starts_at, event.event_ends_at)}
                </p>
                <p className="mt-1 flex items-start gap-1.5 text-[0.8125rem] text-muted">
                    {event.event_is_online ? (
                        <>
                            <Globe className="mt-0.5 size-3.5 shrink-0" /> {copy.onlineEvent}
                        </>
                    ) : (
                        <>
                            <MapPin className="mt-0.5 size-3.5 shrink-0" /> {venueAndArea(event.event_venue, event.area_name)}
                        </>
                    )}
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-soft">
                    <span className="min-w-0 truncate">{event.vendor_name ? `${copy.organisedBy} ${event.vendor_name}` : ""}</span>
                    {going > 0 && (
                        <span className="inline-flex items-center gap-1">
                            <Users className="size-3.5" />
                            {localiseDigits(fill(copy.goingCount, { n: String(event.going_count) }), locale)} ·{" "}
                            {localiseDigits(fill(copy.interestedCount, { n: String(event.interested_count) }), locale)}
                        </span>
                    )}
                </div>
            </div>
        </article>
    );
}
