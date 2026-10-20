import { createElement } from "react";
import type { Metadata } from "next";
import { categoryOgImage, pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/public/AppShell";
import { SearchResultRow } from "@/components/public/SearchResultRow";
import { categoryIcon } from "@/components/shared/icons";
import { getCategories, searchBusinesses } from "@/lib/api";
import { resolveLocale, t, localeHref, pick } from "@/lib/i18n";
import { localiseDigits } from "@/lib/format";
import type { CategoryNode } from "@/lib/types";

// A stable, indexable category URL, unlike search's query-string filter, which is kept out of the index.

const PAGE_SIZE = 20;

type Params = { slug: string };
type Query = { page?: string; lang?: string };

export async function generateMetadata({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<Query>;
}): Promise<Metadata> {
    const [{ slug }, { lang }] = await Promise.all([params, searchParams]);
    const locale = resolveLocale(lang);
    const categories = await getCategories();
    const category = categories.find((c) => c.category_slug === slug);
    if (!category) return { title: "Category not found" };

    const name = pick(locale, category.category_name, category.category_name_bn);
    return pageMetadata({
        title: locale === "bn" ? `রাজশাহীতে ${name} — ব্যবসা ও সেবা` : `${name} in Rajshahi — businesses and services`,
        description:
            locale === "bn"
                ? `রাজশাহীর ${name} খুঁজুন। রেটিং, খোলার সময় ও যোগাযোগের তথ্য তুলনা করুন সাহেববাজারে।`
                : `Find ${name.toLowerCase()} businesses in Rajshahi. Compare ratings, opening hours and contact details on Shahebbazar.`,
        locale,
        path: `/categories/${category.category_slug}`,
        image: categoryOgImage(category.category_slug, category.category_name),
    });
}

export default async function CategoryPage({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<Query>;
}) {
    const [{ slug }, query] = await Promise.all([params, searchParams]);
    const locale = resolveLocale(query.lang);
    const copy = t(locale);

    const categories = await getCategories();
    const category = categories.find((c) => c.category_slug === slug);

    // Unknown category: a 404 rather than an empty listing.
    if (!category) notFound();

    const parent =
        category.category_parent_id === null
            ? null
            : (categories.find((c) => c.category_id === category.category_parent_id) ?? null);
    const subcategories = categories.filter(
        (c) => c.category_parent_id === category.category_id
    );

    const page = Math.max(parseInt(query.page ?? "1", 10) || 1, 1);
    const offset = (page - 1) * PAGE_SIZE;

    const data = await searchBusinesses({
        category: slug,
        limit: PAGE_SIZE,
        offset,
    });

    const name = pick(locale, category.category_name, category.category_name_bn);
    const shownOnPage = data.sponsored.length + data.results.length;
    const hasMore = data.results.length === PAGE_SIZE;
    const num = (n: number) => localiseDigits(String(n), locale);
    const pageHref = (n: number) => {
        const qs = new URLSearchParams();
        if (n > 1) qs.set("page", String(n));
        if (locale === "bn") qs.set("lang", "bn");
        const suffix = qs.toString();
        return `/categories/${category.category_slug}${suffix ? `?${suffix}` : ""}`;
    };

    return (
        <AppShell locale={locale} current="/categories">
            <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted"
            >
                <Link href={localeHref("/", locale)} className="hover:text-brand-600">
                    {copy.home}
                </Link>
                <ChevronRight className="size-3.5" />
                <Link href={localeHref("/categories", locale)} className="hover:text-brand-600">
                    {copy.allCategories}
                </Link>
                {parent && (
                    <>
                        <ChevronRight className="size-3.5" />
                        <Link
                            href={localeHref(`/categories/${parent.category_slug}`, locale)}
                            className="hover:text-brand-600"
                        >
                            {pick(locale, parent.category_name, parent.category_name_bn)}
                        </Link>
                    </>
                )}
                <ChevronRight className="size-3.5" />
                <span className="text-ink">{name}</span>
            </nav>

            <div className="mt-3 flex items-start gap-3.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-600">
                    {createElement(categoryIcon(category.category_icon), {
                        className: "size-6",
                    })}
                </span>
                <div className="min-w-0">
                    <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
                        {name} <span className="text-brand-600">{copy.heroWhere}</span>
                    </h1>
                    <p className="mt-1.5 text-[0.875rem] text-muted">
                        {num(data.total)}{" "}
                        {data.total === 1 ? copy.businessCountOne : copy.businessesCount}
                    </p>
                </div>
            </div>

            {subcategories.length > 0 && (
                <nav aria-label={copy.subcategories} className="mt-5">
                    <h2 className="text-[0.75rem] font-medium tracking-wide text-muted uppercase">
                        {copy.subcategories}
                    </h2>
                    <ul className="mt-2 flex flex-wrap gap-2">
                        {subcategories.map((child) => (
                            <li key={child.category_id}>
                                <Link
                                    href={localeHref(
                                        `/categories/${child.category_slug}`,
                                        locale
                                    )}
                                    className="inline-flex rounded-full border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-brand-600 hover:text-brand-600"
                                >
                                    {pick(locale, child.category_name, child.category_name_bn)}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            )}

            {/* Promoted records stay in their own labelled block. */}
            {data.sponsored.length > 0 && (
                <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                    {data.sponsored.map((business) => (
                        <li key={`sponsored-${business.vendor_id}`}>
                            <SearchResultRow locale={locale} business={business} sponsored />
                        </li>
                    ))}
                </ul>
            )}

            {shownOnPage === 0 ? (
                <div className="mt-5 rounded-xl border border-line bg-surface p-12 text-center shadow-card">
                    <p className="font-medium">{copy.noBusinessesInCategory}</p>
                    <p className="mt-1.5 text-[0.875rem] text-muted">{copy.cantFindBody}</p>
                    <Link
                        href={localeHref("/vendors/register", locale)}
                        className="mt-5 inline-flex items-center justify-center rounded-[10px] bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                    >
                        {copy.addYourBusiness}
                    </Link>
                </div>
            ) : (
                data.results.length > 0 && (
                    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                        {data.results.map((business) => (
                            <li key={business.vendor_id}>
                                <SearchResultRow locale={locale} business={business} />
                            </li>
                        ))}
                    </ul>
                )
            )}

            {(page > 1 || hasMore) && (
                <nav
                    aria-label="Pagination"
                    className="mt-5 flex items-center justify-between gap-3"
                >
                    {page > 1 ? (
                        <Link
                            href={pageHref(page - 1)}
                            className="inline-flex items-center rounded-[10px] border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink hover:border-brand-600 hover:text-brand-600"
                        >
                            {copy.previous}
                        </Link>
                    ) : (
                        <span />
                    )}

                    {hasMore && (
                        <Link
                            href={pageHref(page + 1)}
                            className="inline-flex items-center rounded-[10px] border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink hover:border-brand-600 hover:text-brand-600"
                        >
                            {copy.next}
                        </Link>
                    )}
                </nav>
            )}

            <CategoryJsonLd category={category} parent={parent} total={data.total} />
        </AppShell>
    );
}

// Built from the same parent lookup as the visible breadcrumb, so the two cannot disagree.
function CategoryJsonLd({
    category,
    parent,
    total,
}: {
    category: CategoryNode;
    parent: CategoryNode | null;
    total: number;
}) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const url = `${siteUrl}/categories/${category.category_slug}`;

    const crumbs: { name: string; item: string }[] = [
        { name: "Home", item: siteUrl },
        { name: "Categories", item: `${siteUrl}/categories` },
    ];
    if (parent) {
        crumbs.push({
            name: parent.category_name,
            item: `${siteUrl}/categories/${parent.category_slug}`,
        });
    }
    crumbs.push({ name: category.category_name, item: url });

    const json = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "@id": url,
                name: `${category.category_name} in Rajshahi`,
                url,
                mainEntity: {
                    "@type": "ItemList",
                    numberOfItems: total,
                },
            },
            {
                "@type": "BreadcrumbList",
                itemListElement: crumbs.map((c, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    name: c.name,
                    item: c.item,
                })),
            },
        ],
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
        />
    );
}
