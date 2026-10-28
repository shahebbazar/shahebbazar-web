// Cover photos are what Facebook and WhatsApp show when a business or event is shared, so they are cropped
// to the link-preview shape (1.91:1) and checked for size before upload. Facebook shows a preview as a
// large picture from 600 x 315 and recommends 1200 x 630; anything smaller becomes a small thumbnail.

export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 630;
export const COVER_RATIO = COVER_WIDTH / COVER_HEIGHT;
export const COVER_MIN_WIDTH = 600;
export const COVER_MIN_HEIGHT = 315;

export type CoverQuality = "good" | "ok" | "small";

/** How a photo of this size (in pixels) will look when shared. */
export function coverQuality(width: number, height: number): CoverQuality {
    if (width >= COVER_WIDTH && height >= COVER_HEIGHT) return "good";
    if (width >= COVER_MIN_WIDTH && height >= COVER_MIN_HEIGHT) return "ok";
    return "small";
}

export const COVER_ADVICE: Record<CoverQuality, string> = {
    good: "Sharp when shared on Facebook and WhatsApp.",
    ok: "Will look a little soft when shared. A photo at least 1200 × 630 is best.",
    small: "Too small to use as a cover: shared links would show it as a blurry thumbnail. Use a photo at least 600 × 315, ideally 1200 × 630.",
};

/** Where a crop was made, in the original photo's pixels, so cropping it again starts there (KAN-330). */
export type CropPosition = { zoom: number; centre: { x: number; y: number } };

/** The part of the photo that is kept, in the photo's own pixels. */
export type CropArea = { x: number; y: number; width: number; height: number };

/**
 * The largest 1.91:1 area of a `width` x `height` photo, divided by `zoom` and centred on (`cx`, `cy`),
 * moved back inside the photo where it would cross an edge.
 */
export function cropArea(width: number, height: number, zoom: number, cx: number, cy: number): CropArea {
    const fullWidth = width / height > COVER_RATIO ? height * COVER_RATIO : width;
    const w = fullWidth / zoom;
    const h = w / COVER_RATIO;
    const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
    return { x: clamp(cx - w / 2, width - w), y: clamp(cy - h / 2, height - h), width: w, height: h };
}

/** The furthest zoom that still keeps at least the minimum cover size (1 when the photo is already below it). */
export function maxZoom(width: number, height: number): number {
    const fullWidth = width / height > COVER_RATIO ? height * COVER_RATIO : width;
    return Math.max(1, Math.min(4, fullWidth / COVER_MIN_WIDTH));
}

/**
 * Below this furthest zoom the slider is switched off: a photo only just above the minimum could zoom by
 * a few pixels at most, and a full-width slider for that looks broken (KAN-326).
 */
export const MIN_ZOOM_ROOM = 1.05;

/** Loads an image file or address for measuring and drawing. */
export function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("The photo could not be read."));
        img.src = src;
    });
}

/** Draws the cropped area as a JPEG, 1200 x 630 at most, named after the original file. */
export async function cropToFile(img: HTMLImageElement, area: CropArea, name: string): Promise<File> {
    const width = Math.round(Math.min(COVER_WIDTH, area.width));
    const height = Math.round(width / COVER_RATIO);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't crop photos.");
    // A see-through PNG would turn black as a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("The photo could not be cropped.");
    return new File([blob], `${name.replace(/\.[^.]+$/, "") || "cover"}-cover.jpg`, { type: "image/jpeg" });
}
