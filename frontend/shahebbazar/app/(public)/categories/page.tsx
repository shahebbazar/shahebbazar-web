import { createElement } from "react";
import type { Metadata } from "next";
import { SITE_URL, pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/public/AppShell";
import { categoryIcon } from "@/components/shared/icons";
import { getCategories } from "@/lib/api";
import { resolveLocale, t, localeHref, pick, type Locale } from "@/lib/i18n";
import { localiseDigits, toNumber } from "@/lib/format";
import type { CategoryNode } from "@/lib/types";

// The whole taxonomy on one indexable URL, so a crawler can reach every category page from here.

type Query = { lang?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
    const locale = resolveLocale((await searchParams).lang);
    return pageMetadata({
        title: locale === "bn" ? "সকল বিভাগ — রাজশাহীর ব্যবসা ও সেবা" : "All categories — businesses and services in Rajshahi",
        description:
            locale === "bn"
                ? "রাজশাহীর সব ব্যবসা ও সেবার বিভাগ দেখুন, রেশম ও হস্তশিল্প থেকে স্বাস্থ্য ও পর্যটন।"
                : "Browse every category of business and service in Rajshahi, from silk and handicrafts to health and tourism.",
        path: "/categories",
        locale,
    });
}

// Written in full because Tailwind resolves class names by scanning source.
const TINTS = [
    "bg-emerald-50 text-emerald-600",
    "bg-sky-50 text-sky-600",
    "bg-orange-50 text-orange-600",
    "bg-violet-50 text-violet-600",
    "bg-amber-50 text-amber-600",
    "bg-teal-50 text-teal-600",
];

export default async function CategoriesPage({
    searchParams,
}: {
    searchParams: Promise<Query>;
}) {
    const { lang } = await searchParams;
    const locale = resolveLocale(lang);
    const copy = t(locale);

    const categories = await getCategories();
    const parents = categories.filter((c) => c.category_parent_id === null);
    const childrenOf = (id: number) =>
        categories.filter((c) => c.category_parent_id === id);

    return (
        <AppShell locale={locale} current="/categories">
            <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-1.5 text-[0.8125rem] text-muted"
            >
                <Link href={localeHref("/", locale)} className="hover:text-brand-600">
                    {copy.home}
                </Link>
                <ChevronRight className="size-3.5" />
                <span className="text-ink">{copy.allCategories}</span>
            </nav>

            <h1 className="mt-3 text-[1.75rem] leading-tight font-bold tracking-tight">
                {copy.allCategories}
            </h1>
            <p className="mt-1.5 text-[0.875rem] text-muted">{copy.allCategoriesBody}</p>

            {parents.length === 0 ? (
                <div className="mt-5 rounded-xl border border-line bg-surface p-12 text-center shadow-card">
                    <p className="font-medium">{copy.noBusinesses}</p>
                </div>
            ) : (
                <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {parents.map((parent, index) => (
                        <li key={parent.category_id}>
                            <CategoryCard
                                locale={locale}
                                category={parent}
                                subcategories={childrenOf(parent.category_id)}
                                tint={TINTS[index % TINTS.length]}
                            />
                        </li>
                    ))}
                </ul>
            )}

            <CategoryListJsonLd categories={parents} />
        </AppShell>
    );
}

function CategoryCard({
    locale,
    category,
    subcategories,
    tint,
}: {
    locale: Locale;
    category: CategoryNode;
    subcategories: CategoryNode[];
    tint: string;
}) {
    const copy = t(locale);
    const count = toNumber(category.business_count);
    const href = localeHref(`/categories/${category.category_slug}`, locale);

    return (
        <div className="h-full rounded-xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand-200">
            <div className="flex items-start gap-3.5">
                <span className={`grid size-11 shrink-0 place-items-center rounded-[10px] ${tint}`}>
                    {createElement(categoryIcon(category.category_icon), {
                        className: "size-5",
                    })}
                </span>

                <div className="min-w-0 flex-1">
                    <h2 className="text-[1rem] font-semibold tracking-tight">
                        <Link href={href} className="hover:text-brand-600">
                            {pick(locale, category.category_name, category.category_name_bn)}
                        </Link>
                    </h2>
                    <p className="mt-0.5 text-[0.8125rem] text-muted">
                        {localiseDigits(String(count), locale)}{" "}
                        {count === 1 ? copy.businessCountOne : copy.businessesCount}
                    </p>
                </div>
            </div>

            {subcategories.length > 0 && (
                <>
                    <h3 className="mt-4 text-[0.75rem] font-medium tracking-wide text-muted uppercase">
                        {copy.subcategories}
                    </h3>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                        {subcategories.map((child) => (
                            <li key={child.category_id}>
                                <Link
                                    href={localeHref(
                                        `/categories/${child.category_slug}`,
                                        locale
                                    )}
                                    className="inline-flex rounded-full border border-line px-2.5 py-1 text-[0.75rem] text-ink transition-colors hover:border-brand-600 hover:text-brand-600"
                                >
                                    {pick(locale, child.category_name, child.category_name_bn)}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}


function CategoryListJsonLd({ categories }: { categories: CategoryNode[] }) {
    if (categories.length === 0) return null;

    const json = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "All categories",
        url: `${SITE_URL}/categories`,
        mainEntity: {
            "@type": "ItemList",
            itemListElement: categories.map((c, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: c.category_name,
                url: `${SITE_URL}/categories/${c.category_slug}`,
            })),
        },
    };

    return (
        <script
            type="application/ld+json"
            // Serialised with JSON.stringify, which escapes the content.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
        />
    );
}
