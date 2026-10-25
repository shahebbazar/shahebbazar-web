import type { Metadata } from "next";
import { SITE_URL, pageMetadata } from "@/lib/seo";
import { AppShell } from "@/components/public/AppShell";
import { Hero } from "@/components/public/Hero";
import { CategoryGrid } from "@/components/public/CategoryGrid";
import { FeaturedBusinesses } from "@/components/public/FeaturedBusinesses";
import { WhyShahebbazar, PopularSearches, UpcomingEvents } from "@/components/public/HomeRail";
import { getHomeData } from "@/lib/api";
import { resolveLocale } from "@/lib/i18n";

// Home page.

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
    const locale = resolveLocale((await searchParams).lang);
    const title =
        locale === "bn"
            ? "সাহেববাজার — রাজশাহীর ব্যবসা ও সেবা খুঁজুন"
            : "Shahebbazar — Find businesses and services in Rajshahi";
    return {
        ...pageMetadata({
            title,
            description:
                locale === "bn"
                    ? "রাজশাহীর ব্যবসা খুঁজতে, যোগাযোগ করতে ও পাশে দাঁড়াতে স্থানীয় ডিরেক্টরি। চিকিৎসা, পর্যটন, রেস্টুরেন্ট, কেনাকাটা, শিক্ষা ও নানা সেবা।"
                    : "Your local directory to discover, connect and support businesses in Rajshahi. Browse medical, tourism, restaurants, shopping, education and services.",
            path: "/",
            locale,
        }),
        // The home page is the brand itself, so the layout's " | Shahebbazar" suffix is not added.
        title: { absolute: title },
    };
}

export default async function HomePage({
    searchParams,
}: {
    // Resolved asynchronously in Next.js 15 and later.
    searchParams: Promise<{ lang?: string }>;
}) {
    const [{ lang }, data] = await Promise.all([searchParams, getHomeData()]);
    const locale = resolveLocale(lang);

    return (
        <AppShell locale={locale} current="/">
            <SiteJsonLd />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 space-y-5">
                    <Hero locale={locale} />
                    <CategoryGrid locale={locale} categories={data.categories} />
                    <FeaturedBusinesses locale={locale} businesses={data.featured} />
                </div>

                <div className="space-y-5">
                    <WhyShahebbazar locale={locale} />
                    <PopularSearches locale={locale} terms={data.popularSearches} />
                    <UpcomingEvents locale={locale} events={data.events} />
                </div>
            </div>
        </AppShell>
    );
}

// Site-level structured data.
function SiteJsonLd() {

    const json = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Shahebbazar",
        url: SITE_URL,
        inLanguage: ["en", "bn"],
        potentialAction: {
            "@type": "SearchAction",
            target: {
                "@type": "EntryPoint",
                urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
        },
    };

    return (
        <script
            type="application/ld+json"
            // Serialised from application constants, not user input.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
        />
    );
}
