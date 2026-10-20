import { getCategories } from "@/lib/api";
import { toNumber } from "@/lib/format";
import { shareCard } from "@/lib/shareCard";

// Link-preview card for a category page.

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const category = (await getCategories()).find((c) => c.category_slug === slug);
    if (!category) return new Response("Not found", { status: 404 });

    const count = toNumber(category.business_count);

    return shareCard({
        label: "Category",
        title: `${category.category_name} in Rajshahi`,
        subtitle: count > 0 ? `${count} ${count === 1 ? "business" : "businesses"} listed` : "Businesses and services",
        path: `/categories/${category.category_slug}`,
    });
}
