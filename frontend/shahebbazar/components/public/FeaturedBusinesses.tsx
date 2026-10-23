import Link from "next/link";
import { BusinessCard } from "../shared/BusinessCard";
import { t, localeHref, type Locale } from "@/lib/i18n";
import type { BusinessCard as BusinessCardData } from "@/lib/types";

export function FeaturedBusinesses({
    locale,
    businesses,
}: {
    locale: Locale;
    businesses: BusinessCardData[];
}) {
    const copy = t(locale);

    return (
        // Columns follow this panel's own width (a container query), not the window's: beside the
        // home page's side rail the panel is narrower than the window suggests.
        <section
            className="@container rounded-xl border border-line bg-surface p-5 shadow-card"
            aria-labelledby="featured-businesses"
        >
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2
                    id="featured-businesses"
                    className="text-[1.0625rem] font-semibold tracking-tight"
                >
                    {copy.featuredBusinesses}
                </h2>
                <Link
                    href={localeHref("/search", locale)}
                    className="text-[0.8125rem] font-medium text-brand-600 hover:text-brand-700 hover:underline"
                >
                    {copy.viewAllBusinesses}
                </Link>
            </div>

            {businesses.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">{copy.noBusinesses}</p>
            ) : (
                <ul className="grid gap-3.5 @md:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5">
                    {businesses.map((business) => (
                        <li key={business.vendor_id} className="h-full">
                            {/* Featured entries are paid placements and are always rendered with a label. */}
                            <BusinessCard locale={locale} business={business} showSponsoredBadge />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
