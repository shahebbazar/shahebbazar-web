/**
 * Where to go after logging in, from a ?next= value: only a path on this site ("/account/..."),
 * never another site ("//evil.example", "https://...", "/\evil.example"), so a link can't send
 * someone elsewhere after they log in. Returns null when there's nothing safe to use.
 */
export function safeNext(raw: string | string[] | undefined | null): string | null {
    if (typeof raw !== "string" || raw.length > 500) return null;
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
    return /[\u0000-\u001f]/.test(raw) ? null : raw;
}
