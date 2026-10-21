import { BROWSER_API_BASE } from "./apiBase";

// Browser-side analytics helpers, used by the beacons in components/analytics/.

export type ViewSource = "search" | "category" | "direct" | "share" | "sponsored" | "email" | "facebook" | "whatsapp";

/**
 * The business page's address marked with a campaign's channel and id (?from=whatsapp&c=12), so a
 * visit from the link counts for the campaign. The backend's emails use the same form.
 */
export function campaignLink(pageUrl: string, channel: "email" | "facebook" | "whatsapp", campaignId: number): string {
    const [base, hash] = pageUrl.split("#");
    const tracked = `${base}${base.includes("?") ? "&" : "?"}from=${channel}&c=${campaignId}`;
    return hash === undefined ? tracked : `${tracked}#${hash}`;
}

/** Text with the bare page address (not a longer address starting with it) swapped for `to`. */
export function swapPageUrl(text: string, pageUrl: string, to: string): string {
    const escaped = pageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`${escaped}(?![\\w/?#-])`, "g"), () => to);
}

// Sends one analytics event.
export function sendAnalytics(path: string, payload: unknown): void {
    try {
        fetch(`${BROWSER_API_BASE}${path}`, {
            method: "POST",
            keepalive: true,
            credentials: "omit",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload),
        }).catch(() => {});
    } catch {
        // fetch itself unavailable or refused; nothing to report.
    }
}

// Where a visitor came from. document.referrer only describes the first, full page load.

let currentPath: string | null = null;
let previousPath: string | null = null;

/** Called by NavigationTracker on every pathname change. */
export function recordPath(path: string): void {
    if (path === currentPath) return;
    previousPath = currentPath;
    currentPath = path;
}

// The path visited before `path`, or null on the first page of a visit.
function pathBefore(path: string): string | null {
    return currentPath === path ? previousPath : currentPath;
}

const SEARCH_ENGINE = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu)\./i;

function sourceFromPath(path: string): ViewSource {
    if (path.startsWith("/search")) return "search";
    if (path.startsWith("/categories")) return "category";
    return "direct";
}

// Classifies how the visitor reached `path`: search, a category page, a shared link, or directly.
export function viewSource(path: string): ViewSource {
    const before = pathBefore(path);
    if (before !== null) return sourceFromPath(before);

    if (!document.referrer) return "direct";

    let referrer: URL;
    try {
        referrer = new URL(document.referrer);
    } catch {
        return "direct";
    }

    if (referrer.origin === window.location.origin) return sourceFromPath(referrer.pathname);
    return SEARCH_ENGINE.test(referrer.hostname) ? "search" : "share";
}
