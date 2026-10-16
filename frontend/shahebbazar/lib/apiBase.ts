// Client components call the API from the browser, so they need a NEXT_PUBLIC_ variable.
export const BROWSER_API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

/** Browser counterpart of assetUrl() in lib/api.ts: resolves a stored "uploads/…" path to a full URL. */
export function browserAssetUrl(storedPath: string | null | undefined): string | null {
    if (!storedPath) return null;
    if (/^https?:\/\//i.test(storedPath)) return storedPath;
    const base = process.env.NEXT_PUBLIC_ASSET_BASE_URL || BROWSER_API_BASE;
    return `${base}/${storedPath.replace(/^\/+/, "").replace(/\\/g, "/")}`;
}
