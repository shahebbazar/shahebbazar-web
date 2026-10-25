import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ImageResponse } from "next/og";

// Geist, the site's font, for the share images (lib/shareCard.tsx, app/og.png). The image renderer's
// built-in font is regular weight only, so headings came out thin; these give it the weights the cards
// use. The files are in assets/og-fonts (SIL Open Font License, OFL.txt there); next.config.ts adds them
// to the server build.

type Fonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

const FONT_DIR = path.join(process.cwd(), "assets", "og-fonts");
const WEIGHTS = [
    [400, "Regular"],
    [600, "SemiBold"],
    [700, "Bold"],
] as const;

let loading: Promise<Fonts> | undefined;

/** The fonts, read once. If they can't be read, the cards still render with the built-in font. */
export function ogFonts(): Promise<Fonts> {
    loading ??= Promise.all(
        WEIGHTS.map(async ([weight, name]) => ({
            name: "Geist",
            data: await readFile(path.join(FONT_DIR, `Geist-${name}.ttf`)),
            weight,
            style: "normal" as const,
        }))
    ).catch((err) => {
        console.error("Share images: could not read assets/og-fonts, using the built-in font.", err);
        loading = undefined;
        return undefined;
    });
    return loading;
}
