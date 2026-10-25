import { getCategories } from "@/lib/api";
import { localiseDigits, toNumber } from "@/lib/format";
import { pick, resolveLocale } from "@/lib/i18n";
import { shareCard } from "@/lib/shareCard";

// Link-preview card for a category page; ?lang=bn gives the Bangla card.

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const locale = resolveLocale(new URL(req.url).searchParams.get("lang") ?? undefined);
    const category = (await getCategories()).find((c) => c.category_slug === slug);
    if (!category) return new Response("Not found", { status: 404 });

    const count = toNumber(category.business_count);
    const name = pick(locale, category.category_name, category.category_name_bn);

    return shareCard({
        label: locale === "bn" ? "বিভাগ" : "Category",
        title: locale === "bn" ? `রাজশাহীতে ${name}` : `${name} in Rajshahi`,
        subtitle:
            locale === "bn"
                ? count > 0 ? `${localiseDigits(String(count), locale)}টি ব্যবসা তালিকাভুক্ত` : "ব্যবসা ও সেবা"
                : count > 0 ? `${count} ${count === 1 ? "business" : "businesses"} listed` : "Businesses and services",
        path: `/categories/${category.category_slug}`,
    });
}
