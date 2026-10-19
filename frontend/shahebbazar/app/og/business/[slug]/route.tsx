import { getBusiness } from "@/lib/api";
import { toNumber } from "@/lib/format";
import { SITE_URL } from "@/lib/seo";
import { shareCard } from "@/lib/shareCard";

// Link-preview card for a business with no cover photo, sharing the profile page's cache.

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    let detail;
    try {
        detail = await getBusiness(slug);
    } catch {
        // The API is down: fall back to the site-wide image rather than no image.
        return Response.redirect(new URL("/og.png", SITE_URL), 307);
    }
    if (!detail) return new Response("Not found", { status: 404 });

    const { business } = detail;
    const rating = toNumber(business.rating);
    const reviews = toNumber(business.review_count);
    const place = [business.primary_category, business.area_name ? `${business.area_name}, Rajshahi` : "Rajshahi"]
        .filter(Boolean)
        .join("  ·  ");

    return shareCard({
        label: business.is_verified ? "Verified business" : "Business",
        title: business.vendor_name,
        subtitle: place,
        path: `/business/${business.vendor_slug}`,
        detail:
            reviews > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 34, color: "#0f172a" }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="#f59e0b">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span style={{ fontWeight: 700 }}>{rating.toFixed(1)}</span>
                    <span style={{ color: "#64748b" }}>
                        ({reviews} review{reviews === 1 ? "" : "s"})
                    </span>
                </div>
            ) : undefined,
    });
}
