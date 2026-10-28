import { assetUrl } from "@/lib/api";
import { CategoryFallbackImage } from "@/components/shared/CategoryFallbackImage";

/**
 * The other side of a conversation. A customer: their photo, or the first letter of their name. A
 * business (`business` set): its logo, or its main category's picture, as in every logo spot (KAN-333).
 */
export function Avatar({
    name,
    photo,
    business,
    size = "size-10",
}: {
    name: string;
    photo: string | null;
    business?: { categorySlug: string | null };
    size?: string;
}) {
    return (
        <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700`}>
            {business ? (
                <CategoryFallbackImage slug={business.categorySlug} businessName={name} logoUrl={photo} className="size-full object-cover" />
            ) : photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(photo) ?? ""} alt="" className="size-full object-cover" loading="lazy" />
            ) : (
                name.charAt(0).toUpperCase()
            )}
        </span>
    );
}
