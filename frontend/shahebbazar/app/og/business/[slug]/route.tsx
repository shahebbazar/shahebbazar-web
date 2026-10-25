import { getBusiness } from "@/lib/api";
import { localiseDigits, toNumber } from "@/lib/format";
import { pick, resolveLocale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/seo";
import { shareCard } from "@/lib/shareCard";

// Link-preview card for a business, with its cover photo, sharing the profile page's cache; ?lang=bn
// gives the Bangla card.

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const locale = resolveLocale(new URL(req.url).searchParams.get("lang") ?? undefined);

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
    const bn = locale === "bn";
    const area = pick(locale, business.area_name, business.area_name_bn);
    const city = bn ? "রাজশাহী" : "Rajshahi";
    const place = [pick(locale, business.primary_category, business.primary_category_bn), area ? `${area}, ${city}` : city]
        .filter(Boolean)
        .join("  ·  ");

    return shareCard({
        label: business.is_verified ? (bn ? "যাচাইকৃত ব্যবসা" : "Verified business") : bn ? "ব্যবসা" : "Business",
        title: pick(locale, business.vendor_name, business.vendor_name_bn),
        subtitle: place,
        path: `/business/${business.vendor_slug}`,
        photo: business.vendor_cover_url,
        rating:
            reviews > 0
                ? { value: rating, text: bn ? `(${localiseDigits(String(reviews), locale)}টি রিভিউ)` : `(${reviews} review${reviews === 1 ? "" : "s"})` }
                : null,
    });
}
