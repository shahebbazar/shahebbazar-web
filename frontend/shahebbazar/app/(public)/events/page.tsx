import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/public/AppShell";
import { EventCard } from "@/components/public/EventCard";
import { apiGet } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";
import { resolveLocale, t, localeHref, type Dictionary, type Locale } from "@/lib/i18n";
import { EVENT_TYPES } from "@/lib/events";
import type { EventDetail, EventType } from "@/lib/types";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
    const locale = resolveLocale((await searchParams).lang);
    const copy = t(locale);
    return pageMetadata({
        title: copy.eventsHeading,
        description:
            locale === "bn"
                ? "রাজশাহী ও সাহেববাজারের ব্যবসাগুলোর মেলা, উৎসব, সেল ও কর্মশালা।"
                : "Fairs, festivals, sales and workshops from businesses around Rajshahi and Shaheb Bazar.",
        path: "/events",
        locale,
    });
}

type Filters = { type?: EventType; price?: "free"; online?: "1" };

export default async function EventsPage({
    searchParams,
}: {
    searchParams: Promise<{ lang?: string; type?: string; price?: string; online?: string }>;
}) {
    const params = await searchParams;
    const locale = resolveLocale(params.lang);
    const copy = t(locale);
    const filters: Filters = {
        type: EVENT_TYPES.some((x) => x.key === params.type) ? (params.type as EventType) : undefined,
        price: params.price === "free" ? "free" : undefined,
        online: params.online === "1" ? "1" : undefined,
    };
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
    const filtered = query.length > 0;
    const data = (await apiGet<{ upcoming: EventDetail[]; past: EventDetail[] }>(`/events${query ? `?${query}` : ""}`).catch(
        () => null
    )) ?? { upcoming: [], past: [] };

    return (
        <AppShell locale={locale} current="/events">
            <h1 className="text-2xl font-bold tracking-tight">{copy.eventsHeading}</h1>
            <p className="mt-1 text-[0.9375rem] text-muted">{copy.eventsIntro}</p>

            <FilterBar filters={filters} locale={locale} copy={copy} />

            <h2 className="mt-6 text-[1.0625rem] font-semibold">{copy.upcomingEvents}</h2>
            {data.upcoming.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                    {filtered ? copy.noMatchingEvents : copy.noEvents}{" "}
                    {filtered && (
                        <Link href={localeHref("/events", locale)} className="font-medium text-brand-600 hover:underline">
                            {copy.clearFilters}
                        </Link>
                    )}
                </p>
            ) : (
                <EventGrid events={data.upcoming} locale={locale} copy={copy} />
            )}

            {data.past.length > 0 && (
                <>
                    <h2 className="mt-10 text-[1.0625rem] font-semibold">{copy.pastEvents}</h2>
                    <EventGrid events={data.past} locale={locale} copy={copy} past />
                </>
            )}
        </AppShell>
    );
}

// Links rather than a form, so each filtered list has its own address and works without JavaScript.
function FilterBar({ filters, locale, copy }: { filters: Filters; locale: Locale; copy: Dictionary }) {
    const href = (change: Partial<Record<keyof Filters, string | undefined>>) => {
        const next = { ...filters, ...change };
        const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
        return localeHref(`/events${qs ? `?${qs}` : ""}`, locale);
    };
    const chip = (active: boolean) =>
        `inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium ${
            active ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-surface text-ink hover:bg-surface-2"
        }`;

    return (
        <nav aria-label="Filter events" className="mt-4 flex flex-wrap gap-2">
            <Link href={href({ type: undefined })} aria-current={!filters.type ? "true" : undefined} className={chip(!filters.type)}>
                {copy.allEvents}
            </Link>
            {EVENT_TYPES.filter((x) => x.key !== "other").map((x) => (
                <Link
                    key={x.key}
                    href={href({ type: filters.type === x.key ? undefined : x.key })}
                    aria-current={filters.type === x.key ? "true" : undefined}
                    className={chip(filters.type === x.key)}
                >
                    {x[locale]}
                </Link>
            ))}
            <span className="mx-1 hidden w-px self-stretch bg-line sm:block" aria-hidden />
            <Link
                href={href({ price: filters.price ? undefined : "free" })}
                aria-current={filters.price ? "true" : undefined}
                className={chip(Boolean(filters.price))}
            >
                {copy.freeEvents}
            </Link>
            <Link
                href={href({ online: filters.online ? undefined : "1" })}
                aria-current={filters.online ? "true" : undefined}
                className={chip(Boolean(filters.online))}
            >
                {copy.onlineEvents}
            </Link>
        </nav>
    );
}

function EventGrid({ events, locale, copy, past = false }: { events: EventDetail[]; locale: Locale; copy: Dictionary; past?: boolean }) {
    return (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
                <li key={event.event_id}>
                    <EventCard event={event} locale={locale} copy={copy} past={past} />
                </li>
            ))}
        </ul>
    );
}
