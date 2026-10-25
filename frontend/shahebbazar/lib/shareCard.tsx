import { ImageResponse } from "next/og";
import { serverAssetUrl } from "./api";
import { ogFonts } from "./ogFonts";
import { hasBangla, shapedText } from "./ogText";
import { SITE_URL } from "./seo";

// The 1200 x 630 link-preview card for businesses, events and categories (KAN-245). It is always this
// size, which Facebook and WhatsApp show as a large preview, and it carries the cover photo when there
// is one, so a small or oddly shaped photo still makes a full-size preview. Bangla text is drawn by
// lib/ogText.ts, since the image renderer can't join Bangla letters.

const PHOTO_WIDTH = 480;
const PHOTO_TYPES = ["image/jpeg", "image/png"];

/** The cover photo as a data URL, or null when there is none or it can't be fetched or drawn. */
async function photoData(stored: string | null | undefined): Promise<string | null> {
    if (!stored) return null;
    try {
        const res = await fetch(serverAssetUrl(stored), { signal: AbortSignal.timeout(4000) });
        const type = res.headers.get("content-type")?.split(";")[0] ?? "";
        // The image renderer reads JPEG and PNG; a WEBP cover leaves the card without a photo.
        if (!res.ok || !PHOTO_TYPES.includes(type)) return null;
        return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    } catch {
        return null;
    }
}

type TextStyle = { size: number; weight?: 400 | 600 | 700; color: string; maxLines?: number };

/** A line of card text: an ordinary text span, or for Bangla a shaped picture of it. */
async function cardText(text: string, style: TextStyle, maxWidth: number, extra: React.CSSProperties = {}) {
    if (hasBangla(text)) {
        const shaped = await shapedText(text, { ...style, maxWidth });
        if (shaped) {
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            return <img src={shaped.src} width={shaped.width} height={shaped.height} style={extra} />;
        }
    }
    return (
        <span
            style={{
                fontSize: style.size,
                fontWeight: style.weight ?? 400,
                color: style.color,
                maxWidth,
                ...(style.maxLines ? { lineClamp: style.maxLines, display: "block" } : {}),
                ...extra,
            }}
        >
            {text}
        </span>
    );
}

export async function shareCard({
    label,
    title,
    subtitle,
    detail,
    rating,
    path,
    photo,
}: {
    label: string;
    title: string;
    subtitle?: string | null;
    /** A further line under the subtitle, such as the venue. */
    detail?: string | null;
    /** A star rating line, e.g. { value: 4.6, text: "(12 reviews)" }. */
    rating?: { value: number; text: string } | null;
    path: string;
    /** The stored cover photo ("uploads/x.jpg"). */
    photo?: string | null;
}) {
    const host = new URL(SITE_URL).host;
    const image = await photoData(photo);
    // Room for text: the card less its edge stripe, padding and the photo.
    const textWidth = image ? 1200 - 24 - PHOTO_WIDTH - 112 : 1000;
    const titleSize = image ? (title.length > 40 ? 46 : title.length > 22 ? 54 : 62) : title.length > 34 ? 60 : 76;

    const [labelNode, titleNode, subtitleNode, detailNode, ratingNode] = await Promise.all([
        cardText(label, { size: 24, weight: 600, color: "#1d4ed8" }, 400),
        cardText(title, { size: titleSize, weight: 700, color: "#0f172a", maxLines: 3 }, textWidth, {
            lineHeight: 1.08,
            letterSpacing: hasBangla(title) ? 0 : -1.5,
        }),
        subtitle ? cardText(subtitle, { size: image ? 30 : 34, color: "#475569", maxLines: 2 }, textWidth) : null,
        detail ? cardText(detail, { size: image ? 26 : 30, color: "#64748b", maxLines: 2 }, textWidth) : null,
        rating ? cardText(rating.text, { size: image ? 28 : 34, color: "#64748b" }, textWidth - 140) : null,
    ]);

    const png = new ImageResponse(
        (
            <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f8fc", fontFamily: "Geist, sans-serif" }}>
                <div style={{ width: 24, height: "100%", background: "#2563eb", display: "flex" }} />
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        padding: image ? "56px 56px" : "64px 72px",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#2563eb" }}>
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="#2563eb" stroke="#2563eb" strokeWidth="1.5">
                            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                            <circle cx="12" cy="10" r="3" fill="white" stroke="none" />
                        </svg>
                        <span style={{ fontSize: 38, fontWeight: 700 }}>Shahebbazar</span>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                marginLeft: 12,
                                padding: "6px 18px",
                                borderRadius: 999,
                                background: "#dbeafe",
                            }}
                        >
                            {labelNode}
                        </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                        {titleNode}
                        {subtitleNode}
                        {detailNode}
                        {rating && (
                            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: image ? 30 : 34, color: "#0f172a" }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="#f59e0b">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                                <span style={{ fontWeight: 700 }}>{rating.value.toFixed(1)}</span>
                                {ratingNode}
                            </div>
                        )}
                    </div>

                    <span style={{ fontSize: image ? 22 : 26, color: "#94a3b8" }}>{`${host}${path}`}</span>
                </div>
                {image && (
                    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                    <img src={image} width={PHOTO_WIDTH} height={630} style={{ objectFit: "cover" }} />
                )}
            </div>
        ),
        { width: 1200, height: 630, fonts: await ogFonts() }
    );
    const body = Buffer.from(await png.arrayBuffer());

    // With a photo the PNG is about 1 MB, and WhatsApp skips preview images much over 300 KB, so the
    // card is sent as a JPEG (around 100 KB). Without sharp it stays a PNG.
    let card: { data: Buffer; type: string } = { data: body, type: "image/png" };
    try {
        const sharp = (await import("sharp")).default;
        card = { data: await sharp(body).jpeg({ quality: 82, mozjpeg: true }).toBuffer(), type: "image/jpeg" };
    } catch (err) {
        console.error("Share images: could not convert the card to JPEG, sending a PNG.", err);
    }
    return new Response(new Uint8Array(card.data), {
        headers: {
            "Content-Type": card.type,
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
    });
}
