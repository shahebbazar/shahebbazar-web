import { assetUrl } from "@/lib/api";

/** The other side of a conversation: their photo or logo, or the first letter of their name. */
export function Avatar({ name, photo, size = "size-10" }: { name: string; photo: string | null; size?: string }) {
    return (
        <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700`}>
            {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(photo) ?? ""} alt="" className="size-full object-cover" loading="lazy" />
            ) : (
                name.charAt(0).toUpperCase()
            )}
        </span>
    );
}
