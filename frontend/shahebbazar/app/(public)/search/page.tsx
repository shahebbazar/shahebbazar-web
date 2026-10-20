import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/public/AppShell";
import { SearchControls, searchHref, type SearchQuery } from "@/components/public/SearchControls";
import { SearchResultRow } from "@/components/public/SearchResultRow";
import { SearchSidebar } from "@/components/public/SearchSidebar";
import { SearchBeacon } from "@/components/analytics/SearchBeacon";
import { getHomeData, searchBusinesses } from "@/lib/api";
import { resolveLocale, t, localeHref } from "@/lib/i18n";
import { localiseDigits } from "@/lib/format";

// Search results page.

const PAGE_SIZE = 20;

type Params = {
    q?: string;
    category?: string;
    area?: string;
    sort?: string;
    page?: string;
    lang?: string;
};

export async function generateMetadata({
    searchParams,
}: {
    searchParams: Promise<Params>;
}): Promise<Metadata> {
    const { q, lang } = await searchParams;
    const locale = resolveLocale(lang);
    const bn = locale === "bn";
    const title = q
        ? bn ? `রাজশাহীতে "${q}" — অনুসন্ধানের ফল` : `${q} in Rajshahi — search results`
        : bn ? "রাজশাহীর ব্যবসা দেখুন" : "Browse businesses in Rajshahi";

    // Result pages are excluded from the index because arbitrary queries produce unbounded near-duplicate pages.
    return pageMetadata({
        title,
        description: q
            ? bn
                ? `রাজশাহীতে "${q}" সম্পর্কিত ব্যবসা ও সেবা। রেটিং, খোলার সময় ও যোগাযোগের তথ্য দেখুন সাহেববাজারে।`
                : `Businesses and services matching "${q}" in Rajshahi. Compare ratings, opening hours and contact details on Shahebbazar.`
            : bn
              ? "বিভাগ ও এলাকা অনুযায়ী রাজশাহীর বিশ্বস্ত ব্যবসা ও সেবা খুঁজুন।"
              : "Browse trusted businesses and services across Rajshahi by category and area.",
        path: q ? `/search?q=${encodeURIComponent(q)}` : "/search",
        noindex: true,
        locale,
    });
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
    const params = await searchParams;
    const locale = resolveLocale(params.lang);
    const copy = t(locale);

    const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
    const offset = (page - 1) * PAGE_SIZE;

    // The category list is read from the cached home payload rather than requested separately.
    const [data, home] = await Promise.all([
        searchBusinesses({
            q: params.q,
            category: params.category,
            area: params.area,
            sort: params.sort,
            limit: PAGE_SIZE,
            offset,
        }),
        getHomeData(),
    ]);

    const query: SearchQuery = {
        q: params.q,
        category: params.category,
        area: params.area,
        sort: params.sort,
        lang: locale === "bn" ? "bn" : undefined,
    };

    // Promoted records are displayed and therefore included in the count.
    const shownOnPage = data.sponsored.length + data.results.length;
    const firstRow = shownOnPage === 0 ? 0 : offset + 1;
    const lastRow = offset + shownOnPage;
    // Derived from the page size, as the total includes promoted records outside the paginated set.
    const hasMore = data.results.length === PAGE_SIZE;
    const nothingFound = shownOnPage === 0;
    const num = (n: number) => localiseDigits(String(n), locale);
    const typedQuery = params.q?.trim();

    return (
        <AppShell locale={locale} current="/search">
            {/* Logs typed searches and first-page appearances only, matching what the provider dashboard reports. */}
            {typedQuery && page === 1 && (
                <SearchBeacon
                    q={typedQuery}
                    category={params.category}
                    area={params.area}
                    resultCount={data.total}
                    vendorIds={[...data.sponsored, ...data.results].map((b) => b.vendor_id)}
                />
            )}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0">
                    <nav
                        aria-label="Breadcrumb"
                        className="flex items-center gap-1.5 text-[0.8125rem] text-muted"
                    >
                        <Link href={localeHref("/", locale)} className="hover:text-brand-600">
                            {copy.home}
                        </Link>
                        <ChevronRight className="size-3.5" />
                        <span className="text-ink">{copy.searchResults}</span>
                    </nav>

                    <h1 className="mt-3 text-[1.75rem] leading-tight font-bold tracking-tight">
                        {params.q ? (
                            <>
                                {copy.searchResultsFor} <span>&ldquo;{params.q}&rdquo;</span>{" "}
                                {copy.inLocation}{" "}
                                <span className="text-brand-600">{copy.heroWhere}</span>
                            </>
                        ) : (
                            <>
                                {copy.allBusinesses}{" "}
                                <span className="text-brand-600">{copy.heroWhere}</span>
                            </>
                        )}
                    </h1>

                    <p className="mt-1.5 text-[0.875rem] text-muted">
                        {copy.showing} {num(firstRow)}–{num(lastRow)} {copy.of} {num(data.total)}{" "}
                        {copy.results}
                    </p>

                    <div className="mt-5">
                        <SearchControls
                            locale={locale}
                            query={query}
                            categories={home.categories}
                            areas={data.facets.areas}
                        />
                    </div>

                    {/* Promoted records are rendered in a separate labelled block above the organic results. */}
                    {data.sponsored.length > 0 && (
                        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                            {data.sponsored.map((business) => (
                                <li key={`sponsored-${business.vendor_id}`}>
                                    <SearchResultRow locale={locale} business={business} sponsored />
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Shown only when neither organic nor promoted records are present. */}
                    {nothingFound ? (
                        <div className="mt-5 rounded-xl border border-line bg-surface p-12 text-center shadow-card">
                            <p className="font-medium">{copy.noResults}</p>
                            <p className="mt-1.5 text-[0.875rem] text-muted">{copy.noResultsHint}</p>
                            <Link
                                href={locale === "bn" ? "/search?lang=bn" : "/search"}
                                className="mt-5 inline-flex items-center justify-center rounded-[10px] border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-brand-600 transition-colors hover:border-brand-600 hover:bg-brand-50"
                            >
                                {copy.clearAll}
                            </Link>
                        </div>
                    ) : data.results.length > 0 ? (
                        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                            {data.results.map((business) => (
                                <li key={business.vendor_id}>
                                    <SearchResultRow locale={locale} business={business} />
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {(page > 1 || hasMore) && (
                        <nav
                            aria-label="Pagination"
                            className="mt-5 flex items-center justify-between gap-3"
                        >
                            {page > 1 ? (
                                <Link
                                    href={`${searchHref(query, {})}${
                                        searchHref(query, {}).includes("?") ? "&" : "?"
                                    }page=${page - 1}`}
                                    className="inline-flex items-center rounded-[10px] border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink hover:border-brand-600 hover:text-brand-600"
                                >
                                    {copy.previous}
                                </Link>
                            ) : (
                                <span />
                            )}

                            {hasMore && (
                                <Link
                                    href={`${searchHref(query, {})}${
                                        searchHref(query, {}).includes("?") ? "&" : "?"
                                    }page=${page + 1}`}
                                    className="inline-flex items-center rounded-[10px] border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink hover:border-brand-600 hover:text-brand-600"
                                >
                                    {copy.next}
                                </Link>
                            )}
                        </nav>
                    )}
                </div>

                <SearchSidebar
                    locale={locale}
                    query={query}
                    areas={data.facets.areas}
                    categories={data.facets.categories}
                />
            </div>
        </AppShell>
    );
}
