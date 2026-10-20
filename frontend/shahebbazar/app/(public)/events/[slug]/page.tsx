import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, MapPin, Store } from "lucide-react";
import { AppShell } from "@/components/public/AppShell";
import { apiGet, assetUrl } from "@/lib/api";
import { eventOgImage, pageMetadata, SITE_URL } from "@/lib/seo";
import { ShareMenu } from "@/components/shared/ShareMenu";
import { resolveLocale, t, localeHref, pick } from "@/lib/i18n";
import { formatEventRange } from "@/lib/format";
import type { EventDetail } from "@/lib/types";

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
    const place = event.event_venue ?? "Rajshahi";
    return pageMetadata({
        title,
        description:
            locale === "bn"
                ? `${title}, ${formatEventRange(event.event_starts_at, event.event_ends_at)}। বিস্তারিত দেখুন সাহেববাজারে।`
                : event.event_description?.slice(0, 155) ??
                  `${title}, ${formatEventRange(event.event_starts_at, event.event_ends_at)} at ${place}.`,
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
    const image = assetUrl(event.event_image_url);

    return (
        <AppShell locale={locale} current="/events">
            <Link href={localeHref("/events", locale)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
                <ChevronLeft className="size-4" /> {copy.backToEvents}
            </Link>
            <article className="mt-4 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="h-56 w-full object-cover" />
                )}
                <div className="p-5 sm:p-6">
                    <h1 className="text-2xl font-bold tracking-tight">{pick(locale, event.event_title, event.event_title_bn)}</h1>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                        <CalendarDays className="size-4" /> {formatEventRange(event.event_starts_at, event.event_ends_at)}
                    </p>
                    {event.event_venue && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                            <MapPin className="size-4" /> {event.event_venue}
                            {event.area_name ? `, ${event.area_name}` : ""}
                        </p>
                    )}
                    {event.vendor_name && event.vendor_slug && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                            <Store className="size-4" /> {copy.organisedBy}{" "}
                            <Link href={localeHref(`/business/${event.vendor_slug}`, locale)} className="font-medium text-brand-600 hover:underline">
                                {event.vendor_name}
                            </Link>
                        </p>
                    )}
                    {event.event_description && (
                        <p className="mt-4 text-[0.9375rem] leading-relaxed whitespace-pre-line">{event.event_description}</p>
                    )}
                </div>
            </article>
            <ShareMenu
                url={`${SITE_URL}${localeHref(`/events/${event.event_slug}`, locale)}`}
                title={pick(locale, event.event_title, event.event_title_bn)}
                label={copy.share}
                locale={locale}
                align="left"
                className="mt-4 w-40"
            />
        </AppShell>
    );
}
