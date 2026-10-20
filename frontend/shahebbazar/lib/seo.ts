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

/** Share card for one business, used when it has no cover photo. */
export function businessOgImage(slug: string, name: string) {
    return { url: `/og/business/${encodeURIComponent(slug)}`, width: 1200, height: 630, alt: name };
}

/** Share cards for events and categories (app/og/event and app/og/category). */
export function eventOgImage(slug: string, title: string) {
    return { url: `/og/event/${encodeURIComponent(slug)}`, width: 1200, height: 630, alt: title };
}

export function categoryOgImage(slug: string, name: string) {
    return { url: `/og/category/${encodeURIComponent(slug)}`, width: 1200, height: 630, alt: name };
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
