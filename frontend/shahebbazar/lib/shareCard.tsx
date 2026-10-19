import { ImageResponse } from "next/og";
import { SITE_URL } from "./seo";

// The 1200 x 630 link-preview card shared by businesses, events and categories (KAN-245).
// Text is English only: the image renderer's built-in font has no Bangla glyphs.

export function shareCard({
    label,
    title,
    subtitle,
    detail,
    path,
}: {
    label: string;
    title: string;
    subtitle?: string | null;
    /** Extra line under the subtitle, such as a rating. */
    detail?: React.ReactNode;
    path: string;
}) {
    const host = new URL(SITE_URL).host;

    return new ImageResponse(
        (
            <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f8fc", fontFamily: "sans-serif" }}>
                <div style={{ width: 24, height: "100%", background: "#2563eb", display: "flex" }} />
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        padding: "64px 72px",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#2563eb" }}>
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="#2563eb" stroke="#2563eb" strokeWidth="1.5">
                            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                            <circle cx="12" cy="10" r="3" fill="white" stroke="none" />
                        </svg>
                        <span style={{ fontSize: 38, fontWeight: 700 }}>Shahebbazar</span>
                        <span
                            style={{
                                marginLeft: 12,
                                padding: "6px 18px",
                                borderRadius: 999,
                                background: "#dbeafe",
                                color: "#1d4ed8",
                                fontSize: 24,
                                fontWeight: 600,
                            }}
                        >
                            {label}
                        </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        <span
                            style={{
                                fontSize: title.length > 34 ? 60 : 76,
                                fontWeight: 700,
                                color: "#0f172a",
                                lineHeight: 1.05,
                                letterSpacing: -2,
                                maxWidth: 1000,
                            }}
                        >
                            {title}
                        </span>
                        {subtitle && <span style={{ fontSize: 34, color: "#64748b" }}>{subtitle}</span>}
                        {detail}
                    </div>

                    <span style={{ fontSize: 26, color: "#94a3b8" }}>
                        {host}
                        {path}
                    </span>
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
            headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
        }
    );
}
