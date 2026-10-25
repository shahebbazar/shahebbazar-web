import { readFile } from "node:fs/promises";
import path from "node:path";

// Bangla text for the share images (lib/shareCard.tsx). The image renderer draws letters one by one, so
// Bangla vowel signs land on the wrong side and joined letters fall apart. HarfBuzz, the text shaper
// browsers use, arranges the letters properly; the result is drawn as an SVG picture of the text, which
// the card shows like a photo. Bangla runs use Noto Sans Bengali and everything else Geist, both in
// assets/og-fonts (SIL Open Font License).

type HarfBuzz = typeof import("harfbuzzjs");
type HbFont = InstanceType<HarfBuzz["Font"]>;
type Weight = 400 | 600 | 700;

const FONT_DIR = path.join(process.cwd(), "assets", "og-fonts");
const BANGLA = /[ঀ-৿‌‍]/;
const FILES = {
    bn: { 400: "NotoSansBengali-Regular.ttf", 600: "NotoSansBengali-Bold.ttf", 700: "NotoSansBengali-Bold.ttf" },
    latin: { 400: "Geist-Regular.ttf", 600: "Geist-SemiBold.ttf", 700: "Geist-Bold.ttf" },
} as const;

export const hasBangla = (text: string) => BANGLA.test(text);

let loading: Promise<{ hb: HarfBuzz; fonts: Map<string, { font: HbFont; upem: number }> }> | undefined;

function shaper() {
    loading ??= (async () => {
        const hb = await import("harfbuzzjs");
        const fonts = new Map<string, { font: HbFont; upem: number }>();
        for (const set of Object.values(FILES)) {
            for (const file of new Set(Object.values(set))) {
                const data = await readFile(path.join(FONT_DIR, file));
                const face = new hb.Face(new hb.Blob(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
                fonts.set(file, { font: new hb.Font(face), upem: face.upem });
            }
        }
        return { hb, fonts };
    })().catch((err) => {
        loading = undefined;
        throw err;
    });
    return loading;
}

/**
 * Splits text into Bangla and other runs. Noto Sans Bengali has no commas, brackets and the like, so
 * those use Geist; the Bangla full stop (।) and joining marks stay Bangla.
 */
function runs(text: string): { text: string; bangla: boolean }[] {
    const out: { text: string; bangla: boolean }[] = [];
    for (const ch of text) {
        const bangla = BANGLA.test(ch) || ch === "।" || ch === "॥";
        const last = out[out.length - 1];
        if (last && last.bangla === bangla) last.text += ch;
        else out.push({ text: ch, bangla });
    }
    return out;
}

type Glyph = { d: string; x: number; y: number; scale: number };

/**
 * Text drawn as an SVG data URL, wrapped at spaces to `maxWidth` pixels over at most `maxLines` lines
 * (the last ending in "…" when cut short). Returns null when the shaper can't load, so the caller can
 * fall back to other text.
 */
export async function shapedText(
    text: string,
    { size, weight = 400, color, maxWidth, maxLines = 1 }: { size: number; weight?: Weight; color: string; maxWidth: number; maxLines?: number }
): Promise<{ src: string; width: number; height: number } | null> {
    let loaded;
    try {
        loaded = await shaper();
    } catch (err) {
        console.error("Share images: could not load the text shaper, using English text.", err);
        return null;
    }
    const { hb, fonts } = loaded;

    /** One word's glyphs, from x = 0, and its width in pixels. */
    function shapeWord(word: string): { glyphs: Glyph[]; width: number } {
        const glyphs: Glyph[] = [];
        let x = 0;
        for (const run of runs(word)) {
            const { font, upem } = fonts.get(FILES[run.bangla ? "bn" : "latin"][weight])!;
            const scale = size / upem;
            const buffer = new hb.Buffer();
            buffer.addText(run.text);
            buffer.guessSegmentProperties();
            hb.shape(font, buffer);
            const positions = buffer.getGlyphPositions();
            buffer.getGlyphInfos().forEach((info, i) => {
                const p = positions[i];
                const d = font.glyphToPath(info.codepoint);
                if (d) glyphs.push({ d, x: x + p.xOffset * scale, y: -p.yOffset * scale, scale });
                x += p.xAdvance * scale;
            });
        }
        return { glyphs, width: x };
    }

    const space = shapeWord(" ").width || size * 0.28;
    const ellipsis = shapeWord("…");
    const lines: { glyphs: Glyph[]; width: number }[] = [];
    let line = { glyphs: [] as Glyph[], width: 0 };
    const words = text.trim().split(/\s+/);

    for (const word of words) {
        const shaped = shapeWord(word);
        const start = line.width === 0 ? 0 : line.width + space;
        if (line.width > 0 && start + shaped.width > maxWidth) {
            if (lines.length + 1 === maxLines) {
                // No room for another line: end this one with "…".
                line.glyphs.push(...ellipsis.glyphs.map((g) => ({ ...g, x: g.x + line.width })));
                line.width += ellipsis.width;
                break;
            }
            lines.push(line);
            line = { glyphs: [], width: 0 };
        }
        const offset = line.width === 0 ? 0 : line.width + space;
        line.glyphs.push(...shaped.glyphs.map((g) => ({ ...g, x: g.x + offset })));
        line.width = offset + shaped.width;
    }
    lines.push(line);

    // Bangla needs room above and below the line for its vowel signs.
    const lineHeight = Math.round(size * 1.45);
    const baseline = size * 1.08;
    const width = Math.ceil(Math.min(maxWidth, Math.max(...lines.map((l) => l.width))));
    const height = lineHeight * lines.length;
    const paths = lines
        .flatMap((l, row) =>
            l.glyphs.map(
                (g) =>
                    `<path transform="translate(${g.x.toFixed(1)} ${(row * lineHeight + baseline + g.y).toFixed(1)}) scale(${g.scale.toFixed(5)} ${(-g.scale).toFixed(5)})" d="${g.d}"/>`
            )
        )
        .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="${color}">${paths}</svg>`;
    return { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, width, height };
}
