import type { Metadata } from "next";
import { localeHref, type Locale } from "./i18n";

// Page metadata for the public site: title, description, canonical URL and OpenGraph tags.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const SITE_NAME = "Shahebbazar";

/** Site-wide share image, generated at build time by app/og.png/route.tsx. */
export const DEFAULT_OG_IMAGE = {
    url: "/og.png",
    width: 1200,
    height: 630,
    alt: "Shahebbazar — find trusted businesses and services in Rajshahi",
};

/**
 * A share card's address (app/og/...). The Bangla page gets the Bangla card, and `photo` (the stored
 * cover) adds a version mark, so Facebook and WhatsApp fetch a new card when the cover changes rather
 * than showing the one they saved.
 */
function ogCard(kind: "business" | "event" | "category", slug: string, alt: string, locale: Locale, photo?: string | null) {
    const query = new URLSearchParams();
    if (locale === "bn") query.set("lang", "bn");
    if (photo) {
        let hash = 0;
        for (const ch of photo) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
        query.set("v", (hash >>> 0).toString(36));
    }
    const qs = query.toString();
    return { url: `/og/${kind}/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`, width: 1200, height: 630, alt };
}

/** Share card for one business, carrying its cover photo when it has one. */
export function businessOgImage(slug: string, name: string, locale: Locale = "en", cover?: string | null) {
    return ogCard("business", slug, name, locale, cover);
}

/** Share cards for events (with the cover photo) and categories. */
export function eventOgImage(slug: string, title: string, locale: Locale = "en", cover?: string | null) {
    return ogCard("event", slug, title, locale, cover);
}

export function categoryOgImage(slug: string, name: string, locale: Locale = "en") {
    return ogCard("category", slug, name, locale);
}

const OG_LOCALE: Record<Locale, string> = { en: "en_GB", bn: "bn_BD" };

type OgImage = { url: string; width?: number; height?: number; alt?: string };

export function pageMetadata({
    title,
    description,
    path,
    image = DEFAULT_OG_IMAGE,
    noindex = false,
    locale = "en",
}: {
    /** Page title; the root layout's template appends " | Shahebbazar". */
    title: string;
    description: string;
    /** Canonical path, e.g. "/business/padma-view-restaurant". */
    path: string;
    image?: OgImage;
    /** Keep out of search results but still follow its links. */
    noindex?: boolean;
    /** The Bangla version lives at the same path with ?lang=bn. */
    locale?: Locale;
}): Metadata {
    const url = localeHref(path, locale);
    return {
        title,
        description,
        alternates: {
            canonical: url,
            languages: { en: path, bn: localeHref(path, "bn"), "x-default": path },
        },
        ...(noindex ? { robots: { index: false, follow: true } } : {}),
        openGraph: {
            type: "website",
            siteName: SITE_NAME,
            locale: OG_LOCALE[locale],
            alternateLocale: OG_LOCALE[locale === "bn" ? "en" : "bn"],
            title,
            description,
            url,
            images: [image],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image.url],
        },
    };
}
