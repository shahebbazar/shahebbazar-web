import Link from "next/link";
import { ChevronDown, ListFilter, MapPin, X } from "lucide-react";
import { t, type Locale } from "@/lib/i18n";
import { AutoApplyFilters } from "./AutoApplyFilters";
import type { CategoryTile, Facet } from "@/lib/types";

// Search filter controls and active filter indicators.

export interface SearchQuery {
    q?: string;
    category?: string;
    area?: string;
    sort?: string;
    lang?: string;
}

/** Builds a search URL from the current filters merged with `changes`. */
export function searchHref(current: SearchQuery, changes: Partial<SearchQuery>): string {
    const merged: SearchQuery = { ...current, ...changes };
    const params = new URLSearchParams();

    for (const key of ["q", "category", "area", "sort", "lang"] as const) {
        const value = merged[key];
        if (value) params.set(key, value);
    }

    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
}

export function SearchControls({
    locale,
    query,
    categories,
    areas,
}: {
    locale: Locale;
    query: SearchQuery;
    categories: CategoryTile[];
    areas: Facet[];
}) {
    const copy = t(locale);

    const sorts = [
        { value: "relevance", label: copy.sortRelevance },
        { value: "rating", label: copy.sortRating },
        { value: "reviews", label: copy.sortReviews },
        { value: "name", label: copy.sortName },
    ];

    const activeChips = [
        query.category && {
            label: `${copy.category}: ${
                categories.find((c) => c.category_slug === query.category)?.category_name ??
                query.category
            }`,
            href: searchHref(query, { category: undefined }),
        },
        query.area && {
            label: `${copy.area}: ${
                areas.find((a) => a.slug === query.area)?.name ?? query.area
            }`,
            href: searchHref(query, { area: undefined }),
        },
        query.q && {
            label: `“${query.q}”`,
            href: searchHref(query, { q: undefined }),
        },
    ].filter(Boolean) as { label: string; href: string }[];

    return (
        <>
            {/* Filters apply as soon as one changes. The key remounts the form when the URL's filters change
                (a removed chip, Clear all), so the selects always show the current filters. */}
            <AutoApplyFilters
                key={`${query.category ?? ""}|${query.area ?? ""}|${query.sort ?? ""}|${query.q ?? ""}`}
                className="flex flex-wrap items-center gap-3"
                loadingLabel={copy.updatingResults}
            >
                {query.q && <input type="hidden" name="q" value={query.q} />}
                {locale === "bn" && <input type="hidden" name="lang" value="bn" />}

                <SelectField name="category" label={copy.category} value={query.category}>
                    <option value="">{copy.category}</option>
                    {categories.map((c) => (
                        <option key={c.category_slug} value={c.category_slug}>
                            {c.category_name}
                        </option>
                    ))}
                </SelectField>

                <SelectField name="area" label={copy.area} value={query.area} icon>
                    <option value="">{copy.area}</option>
                    {areas.map((a) => (
                        <option key={a.slug} value={a.slug}>
                            {a.name}
                        </option>
                    ))}
                </SelectField>

                <SelectField
                    name="sort"
                    label={copy.sortBy}
                    value={query.sort}
                    prefix={copy.sortBy}
                >
                    {sorts.map((s) => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </SelectField>

                {/* Only needed without JavaScript; otherwise filters apply on change. */}
                <noscript>
                    <button
                        type="submit"
                        className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-brand-600 hover:bg-brand-50"
                    >
                        <ListFilter className="size-4" />
                        {copy.search}
                    </button>
                </noscript>
            </AutoApplyFilters>

            {activeChips.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {activeChips.map((chip) => (
                        <Link
                            key={chip.label}
                            href={chip.href}
                            className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-[0.8125rem] text-brand-700 transition-colors hover:bg-brand-100"
                        >
                            {chip.label}
                            <X className="size-3.5" />
                        </Link>
                    ))}
                    <Link
                        href={locale === "bn" ? "/search?lang=bn" : "/search"}
                        className="ml-1 text-[0.8125rem] font-medium text-brand-600 hover:underline"
                    >
                        {copy.clearAll}
                    </Link>
                </div>
            )}
        </>
    );
}

// Styled native select.
function SelectField({
    name,
    label,
    value,
    prefix,
    icon = false,
    children,
}: {
    name: string;
    label: string;
    value?: string;
    prefix?: string;
    icon?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="relative">
            <label htmlFor={`filter-${name}`} className="sr-only">
                {label}
            </label>
            {icon && (
                <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            )}
            {prefix && (
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">
                    {prefix}
                </span>
            )}
            <select
                id={`filter-${name}`}
                name={name}
                defaultValue={value ?? ""}
                className={`h-11 min-w-[150px] appearance-none rounded-[10px] border border-line-strong bg-surface pr-9 text-sm text-ink outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100 ${
                    icon ? "pl-9" : prefix ? "pl-[4.5rem]" : "pl-3.5"
                }`}
            >
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
        </div>
    );
}
