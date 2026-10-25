import Link from "next/link";
import {
    Activity,
    Award,
    Bed,
    Building2,
    CalendarDays,
    Car,
    Clock,
    Factory,
    Navigation,
    Star,
    Stethoscope,
    UtensilsCrossed,
    Users,
    type LucideIcon,
} from "lucide-react";
import { assetUrl } from "@/lib/api";
import { t, localeHref, pick, type Locale } from "@/lib/i18n";
import { formatClockTime, formatRating, localiseDigits, toNumber } from "@/lib/format";
import type { BusinessDetail } from "@/lib/types";

/** Icon components keyed by the value stored in `vendor_facts.fact_icon`. */
const FACT_ICONS: Record<string, LucideIcon> = {
    calendar: CalendarDays,
    badge: Award,
    building: Building2,
    siren: Activity,
    utensils: UtensilsCrossed,
    users: Users,
    car: Car,
    clock: Clock,
    factory: Factory,
    bed: Bed,
    stethoscope: Stethoscope,
    activity: Activity,
};

const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

export function BusinessSidebar({
    locale,
    detail,
}: {
    locale: Locale;
    detail: BusinessDetail;
}) {
    const copy = t(locale);
    const { business, hours, facts, similar } = detail;
    const quickFacts = facts.filter((f) => f.group === "quick");

    // Matches PostgreSQL EXTRACT(DOW), used by the opening hours rows.
    // Evaluated in Asia/Dhaka so the current day reflects the business's
    // local date.
    const todayIndex = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" })
    ).getDay();

    const lat = business.vendor_lat;
    const lng = business.vendor_lng;
    // Standard Google Maps URL; requires no API key and opens the native
    // application on mobile devices.
    const directionsUrl =
        lat && lng
            ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${business.vendor_name} ${business.vendor_address ?? "Rajshahi"}`
              )}`;

    return (
        <div className="space-y-5">
            {/* --- opening hours --- */}
            <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold tracking-tight">
                    <Clock className="size-[18px] text-muted" />
                    {copy.openingHours}
                </h2>

                {hours.length === 0 ? (
                    <p className="mt-3 text-[0.8125rem] text-muted">{copy.hoursNotSet}</p>
                ) : (
                    <ul className="mt-3.5 space-y-2">
                        {hours.map((row) => {
                            const isToday = row.day === todayIndex;
                            const value = row.is_24h
                                ? copy.hours24
                                : row.is_closed
                                  ? copy.closed
                                  : `${formatClockTime(row.open_time)} – ${formatClockTime(row.close_time)}`;

                            return (
                                <li
                                    key={row.day}
                                    className="flex items-baseline justify-between gap-3 text-[0.875rem]"
                                >
                                    <span className={isToday ? "font-semibold" : "text-muted"}>
                                        {DAY_NAMES[row.day]}
                                        {isToday && ` (${copy.today})`}
                                    </span>
                                    {/* Today's hours are green only while the business is open now, red once it has closed. */}
                                    <span
                                        className={
                                            row.is_closed
                                                ? "text-shut-ink"
                                                : isToday
                                                  ? `font-medium ${business.open_state === "open" ? "text-open-ink" : "text-shut-ink"}`
                                                  : "text-muted"
                                        }
                                    >
                                        {value}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {/* --- location --- */}
            <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="text-[1.0625rem] font-semibold tracking-tight">{copy.location}</h2>
                <LocationSketch address={business.vendor_address} />
                <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-brand-600 transition-colors hover:border-brand-600 hover:bg-brand-50"
                >
                    <Navigation className="size-4" />
                    {copy.getDirections}
                </a>
            </section>

            {/* --- quick facts --- */}
            {quickFacts.length > 0 && (
                <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <h2 className="text-[1.0625rem] font-semibold tracking-tight">
                        {copy.quickFacts}
                    </h2>
                    <ul className="mt-3.5 grid grid-cols-2 gap-4">
                        {quickFacts.map((fact) => {
                            const Icon = (fact.icon && FACT_ICONS[fact.icon]) || Activity;
                            return (
                                <li key={fact.label} className="flex items-start gap-2">
                                    <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[0.8125rem] text-muted">
                                            {fact.label}
                                        </span>
                                        <span className="block text-[0.875rem] font-semibold">
                                            {localiseDigits(fact.value, locale)}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {/* --- similar businesses --- */}
            {similar.length > 0 && (
                <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <div className="mb-3.5 flex items-center justify-between gap-3">
                        <h2 className="text-[1.0625rem] font-semibold tracking-tight">
                            {copy.similarBusinesses}
                        </h2>
                        <Link
                            href={localeHref("/search", locale)}
                            className="text-[0.8125rem] font-medium text-brand-600 hover:underline"
                        >
                            {copy.viewAll}
                        </Link>
                    </div>

                    <ul className="space-y-3.5">
                        {similar.map((item) => {
                            const cover = assetUrl(item.vendor_cover_url);
                            const distance = toNumber(item.distance_km);
                            return (
                                <li key={item.vendor_id} className="flex gap-3">
                                    <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                                        {cover ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={cover}
                                                alt=""
                                                loading="lazy"
                                                className="size-full object-cover"
                                            />
                                        ) : (
                                            <div className="grid size-full place-items-center bg-gradient-to-br from-brand-100 to-brand-200 text-sm font-bold text-brand-600">
                                                {item.vendor_name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={localeHref(
                                                `/business/${item.vendor_slug}`,
                                                locale
                                            )}
                                            className="block truncate text-[0.875rem] font-semibold hover:text-brand-600"
                                        >
                                            {pick(locale, item.vendor_name, item.vendor_name_bn)}
                                        </Link>
                                        <span className="block truncate text-[0.8125rem] text-muted">
                                            {pick(
                                                locale,
                                                item.primary_category,
                                                item.primary_category_bn
                                            )}
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-1 text-[0.8125rem]">
                                            <Star className="size-3.5 fill-star text-star" />
                                            {localiseDigits(formatRating(item.rating), locale)}
                                            <span className="text-soft">
                                                ({localiseDigits(String(item.review_count), locale)})
                                            </span>
                                            {distance > 0 && (
                                                <span className="ml-auto shrink-0 text-soft">
                                                    {localiseDigits(distance.toFixed(1), locale)} km
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </div>
    );
}

/**
 * Schematic location illustration.
 *
 * Placeholder pending an interactive map provider. See SearchSidebar.
 */
function LocationSketch({ address }: { address: string | null }) {
    return (
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
            <svg viewBox="0 0 300 150" className="w-full" role="img" aria-label="Location map">
                <rect width="300" height="150" className="fill-emerald-50" />
                <g className="stroke-amber-200" strokeWidth="7" fill="none">
                    <path d="M0 96 H300" />
                    <path d="M186 0 V150" />
                </g>
                <g className="stroke-white" strokeWidth="3" fill="none">
                    <path d="M0 40 H300" />
                </g>
                <rect x="24" y="18" width="52" height="34" rx="3" className="fill-slate-200" />
                <rect x="222" y="110" width="56" height="30" rx="3" className="fill-slate-200" />
                <g transform="translate(150 70)">
                    <circle r="15" className="fill-brand-600/20" />
                    <path
                        d="M0 10 C -7 0, -10 -5, -10 -9 A 10 10 0 1 1 10 -9 C 10 -5, 7 0, 0 10 Z"
                        className="fill-brand-600"
                    />
                    <circle cy="-9" r="3.4" className="fill-white" />
                </g>
                {address && (
                    <text
                        x="150"
                        y="130"
                        textAnchor="middle"
                        fontSize="9"
                        className="fill-slate-600"
                    >
                        {address.length > 44 ? `${address.slice(0, 42)}…` : address}
                    </text>
                )}
            </svg>
        </div>
    );
}
