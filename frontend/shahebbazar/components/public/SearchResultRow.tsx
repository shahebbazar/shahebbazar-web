import Link from "next/link";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { OpenBadge } from "../shared/BusinessCard";
import { assetUrl } from "@/lib/api";
import { t, localeHref, pick, type Locale } from "@/lib/i18n";
import { formatRating, localiseDigits, toNumber } from "@/lib/format";
import type { BusinessCard } from "@/lib/types";

// Search result row.
export function SearchResultRow({
    locale,
    business,
    sponsored = false,
}: {
    locale: Locale;
    business: BusinessCard;
    /** Set only for records returned in the API's `sponsored` array. */
    sponsored?: boolean;
}) {
    const copy = t(locale);
    const name = pick(locale, business.vendor_name, business.vendor_name_bn);
    const cover = assetUrl(business.vendor_cover_url);
    const reviews = toNumber(business.review_count);
    // A visit from a Sponsored row is counted as a sponsored view (ProfileViewBeacon).
    const href = localeHref(`/business/${business.vendor_slug}${sponsored ? "?from=sponsored" : ""}`, locale);

    return (
        <article className="flex flex-col gap-4 p-4 sm:flex-row">
            <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden rounded-lg bg-brand-50 sm:aspect-auto sm:h-[130px] sm:w-[180px]">
                {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                    <div className="grid size-full place-items-center bg-gradient-to-br from-brand-100 to-brand-200">
                        <span className="text-2xl font-bold text-brand-600 opacity-70">
                            {name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                    </div>
                )}

                {sponsored && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-sponsor-bg px-2 py-0.5 text-[0.6875rem] font-semibold text-sponsor-ink">
                        <Star className="size-2.5 fill-current" />
                        {copy.sponsored}
                    </span>
                )}
            </div>

            <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-1.5 text-base font-semibold">
                    <Link href={href} className="hover:text-brand-600">
                        {name}
                    </Link>
                    {business.is_verified && (
                        <BadgeCheck
                            className="size-4 shrink-0 fill-brand-600 text-white"
                            aria-label={copy.verified}
                        />
                    )}
                </h3>

                {business.primary_category && (
                    <p className="mt-0.5 text-[0.8125rem] text-muted">
                        {pick(locale, business.primary_category, business.primary_category_bn)}
                    </p>
                )}

                {(business.vendor_address || business.area_name) && (
                    <p className="mt-1.5 flex items-center gap-1 text-[0.8125rem] text-muted">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">
                            {business.vendor_address ||
                                pick(locale, business.area_name, business.area_name_bn)}
                        </span>
                    </p>
                )}

                {business.vendor_description && (
                    <p className="mt-2 line-clamp-2 text-[0.8125rem] leading-relaxed text-muted">
                        {business.vendor_description}
                    </p>
                )}
            </div>

            <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:w-[190px] sm:flex-col sm:items-end sm:justify-start">
                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-sm font-medium">
                        <Star className="size-4 fill-star text-star" />
                        {localiseDigits(formatRating(business.rating), locale)}
                        {reviews > 0 && (
                            <span className="font-normal text-soft">
                                ({localiseDigits(String(reviews), locale)})
                            </span>
                        )}
                    </span>
                    <OpenBadge locale={locale} state={business.open_state} />
                </div>

                <Link
                    href={href}
                    className="inline-flex h-10 items-center justify-center rounded-[10px] border border-brand-600 bg-surface px-5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-600 hover:text-white sm:mt-auto sm:w-full"
                >
                    {copy.viewBusiness}
                </Link>
            </div>
        </article>
    );
}
