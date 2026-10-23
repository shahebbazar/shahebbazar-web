import Link from "next/link";
import { categoryIcon } from "../shared/icons";
import { t, localeHref, pick, type Locale } from "@/lib/i18n";
import type { CategoryTile } from "@/lib/types";

// Tile colour variants.
const TINTS = [
    "bg-emerald-50 text-emerald-600",
    "bg-sky-50 text-sky-600",
    "bg-orange-50 text-orange-600",
    "bg-violet-50 text-violet-600",
    "bg-amber-50 text-amber-600",
    "bg-teal-50 text-teal-600",
];

export function CategoryGrid({
    locale,
    categories,
}: {
    locale: Locale;
    categories: CategoryTile[];
}) {
    const copy = t(locale);
    if (categories.length === 0) return null;

    return (
        // Columns follow this panel's own width (a container query); see FeaturedBusinesses.
        <section
            className="@container rounded-xl border border-line bg-surface p-5 shadow-card"
            aria-labelledby="browse-categories"
        >
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2
                    id="browse-categories"
                    className="text-[1.0625rem] font-semibold tracking-tight"
                >
                    {copy.browseCategories}
                </h2>
                <Link
                    href={localeHref("/categories", locale)}
                    className="text-[0.8125rem] font-medium text-brand-600 hover:text-brand-700 hover:underline"
                >
                    {copy.viewAllCategories}
                </Link>
            </div>

            <ul className="grid gap-3 @md:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4">
                {categories.map((category, index) => {
                    const Icon = categoryIcon(category.category_icon);
                    const subtitle = pick(locale, category.subtitle, category.subtitle_bn);

                    return (
                        <li key={category.category_id}>
                            <Link
                                href={localeHref(
                                    `/search?category=${category.category_slug}`,
                                    locale
                                )}
                                className="flex h-full items-start gap-3 rounded-xl border border-line p-4 transition-colors hover:border-brand-200 hover:bg-brand-50"
                            >
                                <span
                                    className={`grid size-11 shrink-0 place-items-center rounded-full ${TINTS[index % TINTS.length]}`}
                                >
                                    <Icon className="size-[21px]" strokeWidth={1.75} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[0.9375rem] leading-tight font-semibold">
                                        {pick(
                                            locale,
                                            category.category_name,
                                            category.category_name_bn
                                        )}
                                    </span>
                                    {subtitle && (
                                        <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">
                                            {subtitle}
                                        </span>
                                    )}
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
