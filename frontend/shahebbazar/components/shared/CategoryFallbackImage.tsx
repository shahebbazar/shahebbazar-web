"use client";

import { useState } from "react";
import { browserAssetUrl } from "@/lib/apiBase";

// Use clean, text-free stock photography for each category. If a child category
// is not mapped yet, use its parent category before falling back to local artwork.
const CATEGORY_PHOTOS: Record<string, string> = {
    "silk-textiles": "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=80",
    "silk-sarees": "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=80",
    "raw-silk-yarn": "https://images.unsplash.com/photo-1604881988758-f76ad2f7cad1?auto=format&fit=crop&w=900&q=80",
    "tailoring": "https://images.unsplash.com/photo-1590736969955-71cc94901144?auto=format&fit=crop&w=900&q=80",
    "handicrafts": "https://images.unsplash.com/photo-1493106641515-6b5631de4bb9?auto=format&fit=crop&w=900&q=80",
    "jute-products": "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?auto=format&fit=crop&w=900&q=80",
    "bamboo-cane": "https://images.unsplash.com/photo-1493106641515-6b5631de4bb9?auto=format&fit=crop&w=900&q=80",
    "pottery": "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=900&q=80",
    "agro-supplies": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
    "seeds-fertiliser": "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
    "mango-fruit-trade": "https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=900&q=80",
    "farm-machinery": "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=900&q=80",
    "light-manufacturing": "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=900&q=80",
    "metal-fabrication": "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80",
    "plastic-packaging": "https://images.unsplash.com/photo-1605600659873-d808a13e4d9a?auto=format&fit=crop&w=900&q=80",
    "health": "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=900&q=80",
    "pharmacy": "https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=900&q=80",
    "hospitals": "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=900&q=80",
    "clinics": "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=900&q=80",
    "diagnostic-centre": "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=900&q=80",
    "doctor-chamber": "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=900&q=80",
    "tourism": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80",
    "hotels": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80",
    "tour-operators": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80",
    "travel": "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80",
    "attractions": "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=900&q=80",
    "restaurants": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
    "food": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
    "cafes": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80",
    "caterers": "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=900&q=80",
    "shopping": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80",
    "malls": "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?auto=format&fit=crop&w=900&q=80",
    "stores": "https://images.unsplash.com/photo-1604719312566-8912e9c8a213?auto=format&fit=crop&w=900&q=80",
    "boutiques": "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
    "education": "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80",
    "schools": "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=900&q=80",
    "coaching": "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=900&q=80",
    "colleges": "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=900&q=80",
    "services": "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80",
    "accounting": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80",
    "bookkeeping": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80",
    "tax-consultant": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80",
    "salons": "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80",
    "plumbers": "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=900&q=80",
    "carpenters": "https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=900&q=80",
};

const PARENT_BY_SLUG: Record<string, string> = {
    "silk-sarees": "silk-textiles", "raw-silk-yarn": "silk-textiles", tailoring: "silk-textiles",
    "jute-products": "handicrafts", "bamboo-cane": "handicrafts", pottery: "handicrafts",
    "seeds-fertiliser": "agro-supplies", "mango-fruit-trade": "agro-supplies", "farm-machinery": "agro-supplies",
    "metal-fabrication": "light-manufacturing", "plastic-packaging": "light-manufacturing",
    hospitals: "health", clinics: "health", pharmacy: "health", "diagnostic-centre": "health", "doctor-chamber": "health",
    hotels: "tourism", "tour-operators": "tourism", travel: "tourism", attractions: "tourism",
    food: "restaurants", cafes: "restaurants", caterers: "restaurants",
    malls: "shopping", stores: "shopping", boutiques: "shopping",
    schools: "education", coaching: "education", colleges: "education",
    salons: "services", plumbers: "services", carpenters: "services",
};

function normaliseBusinessName(value?: string | null): string {
    return (value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function categoryPhotoCandidates(slug?: string | null, businessName?: string | null): string[] {
    const key = (slug ?? "").toLowerCase().trim();
    const name = normaliseBusinessName(businessName);

    // Some businesses are assigned only to a broad parent category (e.g. Services).
    // Use their business name for a more relevant fallback when the category is broad.
    const businessSpecificSlug = /\b(accounting|accountant|bookkeeping|bookkeeper|tax|vat|audit|auditing|financial)\b/.test(name)
        ? "accounting"
        : undefined;
    const selectedSlug = businessSpecificSlug ?? key;
    const parent = PARENT_BY_SLUG[selectedSlug];

    return [...new Set([
        CATEGORY_PHOTOS[selectedSlug],
        parent ? CATEGORY_PHOTOS[parent] : undefined,
        CATEGORY_PHOTOS[key],
        PARENT_BY_SLUG[key] ? CATEGORY_PHOTOS[PARENT_BY_SLUG[key]] : undefined,
        "/images/category-default.svg",
    ].filter((src): src is string => Boolean(src)))];
}

export function categoryPhotoUrl(slug?: string | null, businessName?: string | null): string {
    return categoryPhotoCandidates(slug, businessName)[0] ?? "/images/category-default.svg";
}

/** Displays an uploaded image first, then a category photo, never a text initial. */
export function CategoryFallbackImage({
    slug,
    businessName,
    className,
    alt = "",
    logoUrl,
    preferredImageUrl,
}: {
    slug?: string | null;
    businessName?: string | null;
    className: string;
    alt?: string;
    logoUrl?: string | null;
    /** Cover image or other preferred image for this placement. */
    preferredImageUrl?: string | null;
}) {
    const [preferredFailed, setPreferredFailed] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);
    const [photoIndex, setPhotoIndex] = useState(0);
    const photoCandidates = categoryPhotoCandidates(slug, businessName);
    const preferred = preferredImageUrl && !preferredFailed ? browserAssetUrl(preferredImageUrl) : null;
    const logo = logoUrl && !logoFailed ? browserAssetUrl(logoUrl) : null;
    const photo = photoCandidates[Math.min(photoIndex, photoCandidates.length - 1)] ?? "/images/category-default.svg";
    const src = preferred ?? logo ?? photo;

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={alt}
            loading="lazy"
            className={className}
            onError={() => {
                if (preferred) {
                    setPreferredFailed(true);
                } else if (logo) {
                    setLogoFailed(true);
                } else if (photoIndex < photoCandidates.length - 1) {
                    setPhotoIndex((current) => Math.min(current + 1, photoCandidates.length - 1));
                }
            }}
        />
    );
}
