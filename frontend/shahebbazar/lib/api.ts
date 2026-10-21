import type {
    CategoryNode,
    HomePayload,
    BusinessSearchPayload,
    BusinessDetail,
    PaymentMethod,
} from "./types";

// Server-side data access layer.
const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";

// Resolves a stored relative asset path to an absolute URL.
export function assetUrl(storedPath: string | null): string | null {
    if (!storedPath) return null;
    if (/^https?:\/\//i.test(storedPath)) return storedPath;
    const base = process.env.NEXT_PUBLIC_ASSET_BASE_URL || API_BASE;
    return `${base}/${storedPath.replace(/^\/+/, "").replace(/\\/g, "/")}`;
}

class ApiError extends Error {
    constructor(readonly status: number, readonly path: string) {
        super(`API ${path} responded ${status}`);
    }
}

async function getJson<T>(path: string, revalidateSeconds: number): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        // Directory content changes rarely, so a short revalidation window reduces database load.
        // Not in development, where the database is often reloaded or edited directly (db:reset, seed
        // photos) and a cached page would show the old data for up to five minutes.
        next: { revalidate: process.env.NODE_ENV === "development" ? 0 : revalidateSeconds },
        headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new ApiError(res.status, path);
    return res.json() as Promise<T>;
}

// Retrieves home page content.
export async function getHomeData(): Promise<HomePayload> {
    try {
        return await getJson<HomePayload>("/api/home", 300);
    } catch (err) {
        console.error("getHomeData failed, rendering empty shell:", err);
        return { categories: [], featured: [], events: [], popularSearches: [] };
    }
}

/** Empty list rather than a throw, so the page renders its shell. */
export async function getCategories(): Promise<CategoryNode[]> {
    try {
        return await getJson<CategoryNode[]>("/api/categories", 300);
    } catch (err) {
        console.error("getCategories failed, rendering empty shell:", err);
        return [];
    }
}

export async function searchBusinesses(params: {
    q?: string;
    category?: string;
    area?: string;
    sort?: string;
    limit?: number;
    offset?: number;
}): Promise<BusinessSearchPayload> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") qs.set(key, String(value));
    }

    try {
        return await getJson<BusinessSearchPayload>(`/api/businesses?${qs}`, 60);
    } catch (err) {
        console.error("searchBusinesses failed:", err);
        return {
            results: [],
            sponsored: [],
            total: 0,
            limit: 20,
            offset: 0,
            sort: "relevance",
            facets: { areas: [], categories: [] },
        };
    }
}

// Retrieves a single business profile, or null when it does not exist.
export async function getBusiness(
    slug: string
): Promise<BusinessDetail | null> {
    const path =
        `/api/businesses/${encodeURIComponent(slug)}`;

    const res = await fetch(`${API_BASE}${path}`, {
        cache: "no-store",
        headers: {
            Accept: "application/json",
        },
    });

    if (res.status === 404) {
        return null;
    }

    if (!res.ok) {
        throw new ApiError(res.status, path);
    }

    return res.json() as Promise<BusinessDetail>;
}


// Returns null on failure so the profile still renders without the panel.
export async function getPaymentMethods(slug: string): Promise<PaymentMethod[] | null> {
    try {
        return await getJson<PaymentMethod[]>(
            `/api/businesses/${encodeURIComponent(slug)}/payment-methods`,
            300
        );
    } catch (err) {
        console.error(`getPaymentMethods(${slug}) failed:`, err);
        return null;
    }
}

// Signed-in pages and actions use authenticatedApiGet / authenticatedApiSend in lib/auth-server.ts,
// which forward the session cookie. The helpers here are for public data only.

// Reads a public JSON endpoint without caching; returns null on 404.
export async function apiGet<T>(path: string): Promise<T | null> {
    const res = await fetch(`${API_BASE}/api${path}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new ApiError(res.status, path);
    return res.json() as Promise<T>;
}

// Posts to a public endpoint with no body; returns the status and JSON.
export async function apiPostPublic<T>(path: string): Promise<{ status: number; data: T | null }> {
    const res = await fetch(`${API_BASE}/api${path}`, { method: "POST", cache: "no-store", headers: { Accept: "application/json" } });
    return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
}

// Result shape shared by server actions and the components that call them.
export type SendResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
