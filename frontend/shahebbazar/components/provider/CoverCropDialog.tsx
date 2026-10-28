"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ZoomIn } from "lucide-react";
import {
    COVER_ADVICE,
    COVER_HEIGHT,
    COVER_WIDTH,
    coverQuality,
    cropArea,
    cropToFile,
    loadImage,
    maxZoom,
    MIN_ZOOM_ROOM,
    type CropPosition,
} from "@/lib/coverPhoto";

export type { CropPosition };

export type CropSource = { src: string; name: string; start?: CropPosition };

const ADVICE_STYLE = {
    good: "bg-success-bg text-success-ink",
    ok: "bg-sponsor-bg text-sponsor-ink",
    small: "bg-error-bg text-error-ink",
};

// Crops a business or event cover photo to the link-preview shape before it is uploaded (or re-saved),
// and says whether it is big enough to look sharp when shared. A photo below the minimum can't be used.
// `source.src` is a picked file's object URL or a saved photo's address.
export function CoverCropDialog({
    source,
    busy = false,
    onCancel,
    onCropped,
}: {
    source: CropSource | null;
    busy?: boolean;
    onCancel: () => void;
    onCropped: (file: File, position: CropPosition) => void;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const frame = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [centre, setCentre] = useState({ x: 0, y: 0 });
    const [saving, setSaving] = useState(false);
    const drag = useRef<{ pointer: number; x: number; y: number; centre: { x: number; y: number } } | null>(null);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (source && !dialog.open) dialog.showModal();
        else if (!source && dialog.open) dialog.close();
    }, [source]);

    // A saved photo is fetched into a local copy first: a canvas can't export a photo drawn straight
    // from another address.
    useEffect(() => {
        if (!source) return;
        let cancelled = false;
        let local: string | null = null;
        (async () => {
            try {
                let src = source.src;
                if (!src.startsWith("blob:")) {
                    const res = await fetch(src);
                    if (!res.ok) throw new Error();
                    local = URL.createObjectURL(await res.blob());
                    src = local;
                }
                const loaded = await loadImage(src);
                if (cancelled) return;
                setImg(loaded);
                // The last crop of this photo when there is one, else the whole photo.
                setZoom(source.start?.zoom ?? 1);
                setCentre(source.start?.centre ?? { x: loaded.naturalWidth / 2, y: loaded.naturalHeight / 2 });
            } catch {
                if (!cancelled) setError("The photo could not be opened. Try another one.");
            }
        })();
        return () => {
            cancelled = true;
            if (local) URL.revokeObjectURL(local);
            setImg(null);
            setError(null);
            setSaving(false);
        };
    }, [source]);

    const width = img?.naturalWidth ?? 0;
    const height = img?.naturalHeight ?? 0;
    const area = img ? cropArea(width, height, zoom, centre.x, centre.y) : null;
    const quality = area ? coverQuality(area.width, area.height) : null;
    const zoomLimit = img ? maxZoom(width, height) : 1;
    const canZoom = zoomLimit >= MIN_ZOOM_ROOM;
    const zoomHintId = useId();

    function moveTo(x: number, y: number) {
        if (!img) return;
        // Kept inside the photo, so the next drag starts from where the photo actually is.
        const a = cropArea(width, height, zoom, x, y);
        setCentre({ x: a.x + a.width / 2, y: a.y + a.height / 2 });
    }

    async function save() {
        if (!img || !area || !source || quality === "small") return;
        setSaving(true);
        try {
            onCropped(await cropToFile(img, area, source.name), {
                zoom,
                centre: { x: area.x + area.width / 2, y: area.y + area.height / 2 },
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "The photo could not be cropped.");
        } finally {
            setSaving(false);
        }
    }

    const working = busy || saving;

    return (
        <dialog
            ref={ref}
            aria-labelledby={titleId}
            onCancel={(event) => {
                event.preventDefault();
                if (!working) onCancel();
            }}
            className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
        >
            <div className="p-5">
                <h2 id={titleId} className="text-[1.0625rem] font-semibold">
                    Position your cover photo
                </h2>
                <p className="mt-1 text-[0.8125rem] text-muted">
                    This is how it appears when your page is shared on Facebook or WhatsApp. Drag to move it and
                    use the slider to zoom.
                </p>

                <div
                    ref={frame}
                    tabIndex={0}
                    role="application"
                    aria-label="Cover photo crop. Drag, or use the arrow keys, to move the photo."
                    className="relative mt-4 aspect-[1200/630] w-full cursor-move touch-none overflow-hidden rounded-lg border border-line bg-surface-2 outline-none select-none focus-visible:ring-3 focus-visible:ring-brand-100"
                    onPointerDown={(e) => {
                        if (!img) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, centre };
                    }}
                    onPointerMove={(e) => {
                        const d = drag.current;
                        if (!d || d.pointer !== e.pointerId || !area || !frame.current) return;
                        // Screen pixels to photo pixels.
                        const scale = area.width / frame.current.getBoundingClientRect().width;
                        moveTo(d.centre.x - (e.clientX - d.x) * scale, d.centre.y - (e.clientY - d.y) * scale);
                    }}
                    onPointerUp={() => (drag.current = null)}
                    onPointerCancel={() => (drag.current = null)}
                    onKeyDown={(e) => {
                        if (!area) return;
                        const step = area.width * 0.03;
                        const moves: Record<string, [number, number]> = {
                            ArrowLeft: [-step, 0],
                            ArrowRight: [step, 0],
                            ArrowUp: [0, -step],
                            ArrowDown: [0, step],
                        };
                        const move = moves[e.key];
                        if (!move) return;
                        e.preventDefault();
                        moveTo(centre.x + move[0], centre.y + move[1]);
                    }}
                >
                    {img && area ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={img.src}
                            alt=""
                            draggable={false}
                            className="pointer-events-none absolute max-w-none"
                            style={{
                                width: `${(width / area.width) * 100}%`,
                                left: `${(-area.x / area.width) * 100}%`,
                                top: `${(-area.y / area.height) * 100}%`,
                            }}
                        />
                    ) : (
                        !error && (
                            <span className="absolute inset-0 grid place-items-center">
                                <Loader2 className="size-6 animate-spin text-brand-600" />
                            </span>
                        )
                    )}
                </div>

                <label className="mt-3 flex items-center gap-3 text-[0.8125rem] font-medium">
                    <ZoomIn className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="sr-only">Zoom</span>
                    <input
                        type="range"
                        min={1}
                        max={zoomLimit}
                        // Any position, not steps: a step of 0.01 left only a few stops on a short range.
                        step="any"
                        value={zoom}
                        disabled={!img || !canZoom}
                        aria-describedby={img && !canZoom ? zoomHintId : undefined}
                        onChange={(e) => {
                            const next = Number(e.target.value);
                            setZoom(next);
                            const a = cropArea(width, height, next, centre.x, centre.y);
                            setCentre({ x: a.x + a.width / 2, y: a.y + a.height / 2 });
                        }}
                        className="w-full accent-brand-600 disabled:opacity-50"
                    />
                </label>
                {img && !canZoom && quality !== "small" && (
                    <p id={zoomHintId} className="mt-1 pl-7 text-xs text-soft">
                        This photo is only just big enough for a cover, so it can&apos;t be zoomed in. To zoom, use a
                        photo at least {COVER_WIDTH} × {COVER_HEIGHT}.
                    </p>
                )}

                {quality && area && (
                    <p className={`mt-3 flex gap-2 rounded-lg p-3 text-[0.8125rem] ${ADVICE_STYLE[quality]}`} role={quality === "small" ? "alert" : "status"}>
                        {quality === "good" ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                        ) : (
                            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        )}
                        <span>
                            {COVER_ADVICE[quality]}{" "}
                            <span className="opacity-80">
                                (This crop: {Math.round(area.width)} × {Math.round(area.height)}. Best: {COVER_WIDTH} × {COVER_HEIGHT}.)
                            </span>
                        </span>
                    </p>
                )}
                {error && (
                    <p role="alert" className="mt-3 rounded-lg bg-error-bg p-3 text-[0.8125rem] text-error-ink">
                        {error}
                    </p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={working}
                        className="rounded-[10px] border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={!area || quality === "small" || working}
                        className="inline-flex items-center gap-2 rounded-[10px] bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                        {working && <Loader2 className="size-4 animate-spin" />} Use this cover
                    </button>
                </div>
            </div>
        </dialog>
    );
}
