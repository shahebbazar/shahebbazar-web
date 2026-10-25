import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/ogFonts";

// The site-wide share image, 1200 x 630, rendered once at build time.

export const dynamic = "force-static";

const SECTORS = ["Silk", "Handicrafts", "Agro-supplies", "Health", "Tourism", "Services"];

export async function GET() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "72px 80px",
                    background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #3b82f6 100%)",
                    color: "white",
                    fontFamily: "Geist, sans-serif",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <MapPin />
                    <span style={{ fontSize: 60, fontWeight: 700, letterSpacing: -1.5 }}>Shahebbazar</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, maxWidth: 940 }}>
                        Find trusted businesses and services in Rajshahi
                    </span>
                    <span style={{ fontSize: 30, color: "#dbeafe" }}>
                        Search shops, suppliers and services by what they actually sell.
                    </span>
                </div>

                <div style={{ display: "flex", gap: 14 }}>
                    {SECTORS.map((s) => (
                        <span
                            key={s}
                            style={{
                                fontSize: 24,
                                padding: "10px 22px",
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.16)",
                                border: "1px solid rgba(255,255,255,0.35)",
                            }}
                        >
                            {s}
                        </span>
                    ))}
                </div>
            </div>
        ),
        { width: 1200, height: 630, fonts: await ogFonts() }
    );
}

/** lucide's map-pin, filled, as used in the site header. */
function MapPin() {
    return (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="white" stroke="#1d4ed8" strokeWidth="1.5">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
            <circle cx="12" cy="10" r="3" fill="#2563eb" stroke="none" />
        </svg>
    );
}
