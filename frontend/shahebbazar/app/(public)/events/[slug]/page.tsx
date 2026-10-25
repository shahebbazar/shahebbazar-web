import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, CalendarPlus, ChevronLeft, Globe, MapPin, Store, Ticket } from "lucide-react";
import { AppShell } from "@/components/public/AppShell";
import { EventResponseButtons } from "@/components/public/EventResponseButtons";
import { apiGet, assetUrl } from "@/lib/api";
import { BROWSER_API_BASE } from "@/lib/apiBase";
import { authenticatedApiGet, getViewer } from "@/lib/auth-server";
import { eventOgImage, pageMetadata, SITE_URL } from "@/lib/seo";
import { ShareMenu } from "@/components/shared/ShareMenu";
import { resolveLocale, t, localeHref, pick } from "@/lib/i18n";
import { formatEventRange, formatEventWhen } from "@/lib/format";
import { eventPrice, eventTypeLabel, googleCalendarUrl } from "@/lib/events";
import type { EventDetail, EventResponseState } from "@/lib/types";

type Params = { slug: string };

export async function generateMetadata({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
    const [{ slug }, { lang }] = await Promise.all([params, searchParams]);
    const locale = resolveLocale(lang);
    const event = await apiGet<EventDetail>(`/events/${encodeURIComponent(slug)}`).catch(() => null);
    if (!event) return { title: "Event not found" };

    const title = pick(locale, event.event_title, event.event_title_bn);
    const place = event.event_is_online ? "online" : `at ${event.event_venue ?? "Rajshahi"}`;
    return pageMetadata({
        title,
        description:
            locale === "bn"
                ? `${title}, ${formatEventRange(event.event_starts_at, event.event_ends_at)}। বিস্তারিত দেখুন সাহেববাজারে।`
                : event.event_description?.slice(0, 155) ??
                  `${title}, ${formatEventRange(event.event_starts_at, event.event_ends_at)} ${place}.`,
        locale,
        path: `/events/${event.event_slug}`,
        image: eventOgImage(event.event_slug, event.event_title),
    });
}

export default async function EventPage({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<{ lang?: string }>;
}) {
    const [{ slug }, { lang }] = await Promise.all([params, searchParams]);
    const locale = resolveLocale(lang);
    const copy = t(locale);
    const event = await apiGet<EventDetail>(`/events/${encodeURIComponent(slug)}`);
    if (!event) notFound();

    const viewer = await getViewer();
    // Customers and vendors can answer; admins see the page as visitors do.
    const canRespond = viewer && viewer.user_role !== "admin";
    const response = canRespond ? await authenticatedApiGet<EventResponseState>(`/events/${event.event_id}/response`) : null;

    const title = pick(locale, event.event_title, event.event_title_bn);
    const path = localeHref(`/events/${event.event_slug}`, locale);
    const pageUrl = `${SITE_URL}${path}`;
    const cover = assetUrl(event.event_image_url);
    const gallery = (event.photos ?? []).filter((p) => !p.photo_is_cover);
    const cancelled = event.event_status === "cancelled";
    const ended = event.ended;
    const logo = assetUrl(event.vendor_logo_url);

    return (
        <AppShell locale={locale} current="/events">
            <Link href={localeHref("/events", locale)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
                <ChevronLeft className="size-4" /> {copy.backToEvents}
            </Link>

            <article className="mt-4 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                <div className="aspect-[16/7] bg-gradient-to-br from-brand-100 to-brand-200">
                    {cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="size-full object-cover" />
                    )}
                </div>

                {(cancelled || ended) && (
                    <p
                        role="status"
                        className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold sm:px-6 ${
                            cancelled ? "bg-error-bg text-error-ink" : "bg-surface-2 text-muted"
                        }`}
                    >
                        <AlertTriangle className="size-4 shrink-0" /> {cancelled ? copy.eventCancelled : copy.eventEnded}
                    </p>
                )}

                <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="min-w-0">
                        <p className="text-[0.8125rem] font-semibold tracking-wide text-brand-600 uppercase">
                            {eventTypeLabel(event.event_type, locale)}
                        </p>
                        <h1 className={`mt-1 text-2xl font-bold tracking-tight ${cancelled ? "line-through decoration-2" : ""}`}>{title}</h1>

                        <ul className="mt-3 space-y-1.5 text-[0.9375rem]">
                            <li className="flex items-start gap-2">
                                <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted" />
                                {formatEventWhen(event.event_starts_at, event.event_ends_at)}
                            </li>
                            <li className="flex items-start gap-2">
                                {event.event_is_online ? (
                                    <>
                                        <Globe className="mt-0.5 size-4 shrink-0 text-muted" />
                                        <span>
                                            {copy.onlineEvent}
                                            {event.event_online_url && !cancelled && (
                                                <>
                                                    {" · "}
                                                    <a href={event.event_online_url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-brand-600 hover:underline">
                                                        {copy.joinOnline}
                                                    </a>
                                                </>
                                            )}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                                        {[event.event_venue, event.area_name].filter(Boolean).join(", ")}
                                    </>
                                )}
                            </li>
                            <li className="flex items-start gap-2">
                                <Ticket className="mt-0.5 size-4 shrink-0 text-muted" />
                                <span>
                                    {eventPrice(event, copy)}
                                    {event.event_ticket_url && !cancelled && (
                                        <>
                                            {" · "}
                                            <a href={event.event_ticket_url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-brand-600 hover:underline">
                                                {copy.getTickets}
                                            </a>
                                        </>
                                    )}
                                </span>
                            </li>
                        </ul>

                        <div className="mt-5">
                            <EventResponseButtons
                                eventId={event.event_id}
                                initial={response}
                                counts={event}
                                loginHref={`/login?next=${encodeURIComponent(path)}`}
                                closed={cancelled || ended}
                                locale={locale}
                                words={{
                                    interested: copy.interested,
                                    going: copy.going,
                                    signIn: copy.respondSignIn,
                                    error: copy.respondError,
                                    goingCount: copy.goingCount,
                                    interestedCount: copy.interestedCount,
                                }}
                            />
                        </div>

                        {event.event_description && (
                            <section className="mt-6">
                                <h2 className="text-[1.0625rem] font-semibold">{copy.aboutEvent}</h2>
                                <p className="mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-line">{event.event_description}</p>
                            </section>
                        )}

                        {gallery.length > 0 && (
                            <section className="mt-6">
                                <h2 className="text-[1.0625rem] font-semibold">{copy.eventPhotos}</h2>
                                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {gallery.map((photo, i) => {
                                        const src = assetUrl(photo.photo_url) ?? "";
                                        return (
                                            <li key={photo.photo_id} className="aspect-[4/3] overflow-hidden rounded-lg bg-surface-2">
                                                <a href={src} target="_blank" rel="noopener noreferrer">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={src} alt={`${title}, photo ${i + 2}`} className="size-full object-cover hover:opacity-90" loading="lazy" />
                                                </a>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}
                    </div>

                    <aside className="space-y-4 self-start">
                        {event.vendor_name && event.vendor_slug && (
                            <div className="rounded-xl border border-line p-4">
                                <p className="text-[0.75rem] font-medium text-muted">{copy.organisedBy}</p>
                                <Link href={localeHref(`/business/${event.vendor_slug}`, locale)} className="mt-2 flex items-center gap-3 hover:text-brand-600">
                                    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-50 text-brand-600">
                                        {logo ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={logo} alt="" className="size-full object-contain p-1" />
                                        ) : (
                                            <Store className="size-5" />
                                        )}
                                    </span>
                                    <span className="font-semibold">{event.vendor_name}</span>
                                </Link>
                            </div>
                        )}

                        {!cancelled && !ended && (
                            <div className="rounded-xl border border-line p-4">
                                <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
                                    <CalendarPlus className="size-4" /> {copy.addToCalendar}
                                </p>
                                <ul className="mt-2 space-y-1.5 text-[0.875rem]">
                                    <li>
                                        <a
                                            href={googleCalendarUrl({ ...event, event_title: title }, pageUrl)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-brand-600 hover:underline"
                                        >
                                            {copy.googleCalendar}
                                        </a>
                                    </li>
                                    <li>
                                        <a href={`${BROWSER_API_BASE}/api/events/${event.event_slug}/calendar.ics`} className="font-medium text-brand-600 hover:underline">
                                            {copy.calendarFile}
                                        </a>
                                    </li>
                                </ul>
                            </div>
                        )}

                        <ShareMenu url={pageUrl} title={title} label={copy.share} locale={locale} align="left" className="w-40" />
                    </aside>
                </div>
            </article>
        </AppShell>
    );
}
