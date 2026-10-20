import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// /sitemap.xml: every page search engines should index.

export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";

type SitemapData = {
    businesses: { slug: string; updated_at: string }[];
    categories: { slug: string }[];
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const fixed: MetadataRoute.Sitemap = ["/", "/categories", "/about", "/faq", "/terms", "/privacy", "/refunds"].map((path) => ({
        url: `${SITE_URL}${path === "/" ? "" : path}`,
    }));

    let data: SitemapData;
    try {
        const res = await fetch(`${API_BASE}/api/sitemap`, {
            next: { revalidate: 3600 },
            headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`API responded ${res.status}`);
        data = await res.json();
    } catch (err) {
        // Still a valid sitemap; the dynamic entries return with the API.
        console.error("sitemap: could not load businesses and categories:", err);
        return fixed;
    }

    return [
        ...fixed,
        ...data.categories.map((c) => ({ url: `${SITE_URL}/categories/${encodeURIComponent(c.slug)}` })),
        ...data.businesses.map((b) => ({
            url: `${SITE_URL}/business/${encodeURIComponent(b.slug)}`,
            lastModified: new Date(b.updated_at),
        })),
    ];
}
