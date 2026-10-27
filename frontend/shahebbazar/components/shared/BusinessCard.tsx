import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import { t, localeHref, pick, type Locale } from "@/lib/i18n";
import { formatRating, localiseDigits, toNumber } from "@/lib/format";
import type { BusinessCard as BusinessCardData } from "@/lib/types";
import { SaveButton } from "@/components/customer/SaveButton";
import { CategoryFallbackImage } from "@/components/shared/CategoryFallbackImage";

// Business summary card, shared by the home page, search results and the related-businesses list.
export function BusinessCard({
    locale,
    business,
    showSponsoredBadge = false,
}: {
    locale: Locale;
    business: BusinessCardData;
    // Displays the paid-placement label.
    showSponsoredBadge?: boolean;
}) {
    const copy = t(locale);
    const name = pick(locale, business.vendor_name, business.vendor_name_bn);
    const reviews = toNumber(business.review_count);
    // A visit from a Sponsored card is counted as a sponsored view (ProfileViewBeacon).
    const href = localeHref(`/business/${business.vendor_slug}${showSponsoredBadge ? "?from=sponsored" : ""}`, locale);

    return (
        <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-shadow hover:shadow-float">
            <div className="relative aspect-4/3 overflow-hidden bg-brand-50">
                <CategoryFallbackImage
                    slug={business.primary_category_slug}
                    businessName={business.vendor_name}
                    preferredImageUrl={business.vendor_cover_url}
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    alt=""
                />

                {showSponsoredBadge && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-sponsor-bg px-2 py-0.5 text-[0.6875rem] font-semibold text-sponsor-ink">
                        <Star className="size-2.5 fill-current" />
                        {copy.sponsored}
                    </span>
                )}

                <SaveButton
                    vendorId={business.vendor_id}
                    label={`${copy.save}: ${name}`}
                    savedLabel={`${copy.saved}: ${name}`}
                    variant="icon"
                    businessName={name}
                    locale={locale}
                />
            </div>

            <div className="flex flex-1 flex-col p-3.5">
                <h3 className="text-[0.9375rem] leading-tight font-semibold">
                    <Link href={href} className="hover:text-brand-600 after:absolute after:inset-0">
                        {name}
                    </Link>
                </h3>

                {business.primary_category && (
                    <p className="mt-1 text-[0.8125rem] text-muted">
                        {pick(locale, business.primary_category, business.primary_category_bn)}
                    </p>
                )}

                {business.area_name && (
                    <p className="mt-1.5 flex items-center gap-1 text-[0.8125rem] text-muted">
                        <MapPin className="size-3.5 shrink-0" />
                        {pick(locale, business.area_name, business.area_name_bn)}
                    </p>
                )}

                <div className="mt-3 flex items-center justify-between gap-2 pt-0.5">
                    <span className="flex items-center gap-1 text-[0.8125rem] font-medium">
                        <Star className="size-3.5 fill-star text-star" />
                        {localiseDigits(formatRating(business.rating), locale)}
                        {reviews > 0 && (
                            <span className="font-normal text-soft">
                                ({localiseDigits(String(reviews), locale)})
                            </span>
                        )}
                    </span>

                    <OpenBadge locale={locale} state={business.open_state} />
                </div>
            </div>
        </article>
    );
}

// Open or closed indicator.
export function OpenBadge({
    locale,
    state,
}: {
    locale: Locale;
    state: "open" | "closed" | null;
}) {
    const copy = t(locale);
    if (!state) return null;

    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                state === "open"
                    ? "bg-open-bg text-open-ink"
                    : "bg-shut-bg text-shut-ink"
            }`}
        >
            {state === "open" ? copy.open : copy.closed}
        </span>
    );
}

