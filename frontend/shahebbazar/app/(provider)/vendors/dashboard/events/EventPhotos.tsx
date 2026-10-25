"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star, Trash2, Upload } from "lucide-react";
import { BROWSER_API_BASE, browserAssetUrl } from "@/lib/apiBase";
import type { EventPhoto } from "@/lib/types";
import { PHOTO_TYPES, PHOTOS_MAX, photoProblem } from "./EventForm";

// A saved event's cover photo and gallery (KAN-298). Each change is saved straight away.
export function EventPhotos({ eventId, initial }: { eventId: number; initial: EventPhoto[] }) {
    const router = useRouter();
    const [photos, setPhotos] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const left = PHOTOS_MAX - photos.length;

    async function send(method: string, path: string, body?: FormData, done?: string) {
        setBusy(true);
        setMessage(null);
        try {
            const res = await fetch(`${BROWSER_API_BASE}/api/events/${eventId}/photos${path}`, { method, body, credentials: "include" });
            const data = await res.json().catch(() => null);
            if (!res.ok) return setMessage({ type: "error", text: data?.error ?? `Something went wrong (${res.status}).` });
            setPhotos(data.photos);
            if (done) setMessage({ type: "success", text: done });
            // The cover is also the event's image on the pages around this one.
            router.refresh();
        } catch {
            setMessage({ type: "error", text: "Could not reach the server. Try again." });
        } finally {
            setBusy(false);
        }
    }

    function upload(files: File[]) {
        if (files.length > left) {
            return setMessage({ type: "error", text: left > 0 ? `You can add ${left} more photo${left === 1 ? "" : "s"}.` : "Remove a photo to add another." });
        }
        for (const file of files) {
            const problem = photoProblem(file);
            if (problem) return setMessage({ type: "error", text: problem });
        }
        const form = new FormData();
        for (const file of files) form.append("photos", file);
        send("POST", "", form, `${files.length} photo${files.length === 1 ? "" : "s"} added.`);
    }

    return (
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="text-[1.0625rem] font-semibold">
                Photos <span className="font-normal text-muted">({photos.length} of {PHOTOS_MAX})</span>
            </h2>
            <p className="mt-1 text-[0.8125rem] text-muted">
                The cover is shown on the events page and when the event is shared. JPG, PNG or WEBP, up to 5 MB each.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((photo, i) => (
                    <li key={photo.photo_id} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-surface-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={browserAssetUrl(photo.photo_url) ?? ""} alt={`Event photo ${i + 1}`} className="size-full object-cover" />
                        {photo.photo_is_cover && (
                            <span className="absolute top-2 left-2 rounded-full bg-brand-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
                                Cover
                            </span>
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink/60 to-transparent p-1.5">
                            {!photo.photo_is_cover && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => send("PUT", `/${photo.photo_id}/cover`)}
                                    className="inline-flex items-center gap-1 rounded-md bg-surface/95 px-2 py-1 text-[0.6875rem] font-medium text-ink hover:bg-surface"
                                >
                                    <Star className="size-3" /> Make cover
                                </button>
                            )}
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => window.confirm("Remove this photo from the event?") && send("DELETE", `/${photo.photo_id}`)}
                                aria-label={`Remove photo ${i + 1}`}
                                className="grid size-7 place-items-center rounded-md bg-surface/95 text-error-ink hover:bg-surface"
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    </li>
                ))}
                {left > 0 && (
                    <li className="aspect-[4/3]">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => input.current?.click()}
                            className="grid size-full place-items-center rounded-lg border border-dashed border-line-strong text-[0.8125rem] font-medium text-brand-600 hover:border-brand-600 hover:bg-brand-50 disabled:opacity-50"
                        >
                            <span className="flex flex-col items-center gap-1.5">
                                {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                                {photos.length === 0 ? "Upload photos" : "Upload more"}
                            </span>
                        </button>
                    </li>
                )}
            </ul>
            <input
                ref={input}
                type="file"
                accept={PHOTO_TYPES.join(",")}
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose event photos"
                onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (files.length > 0) upload(files);
                }}
            />
            {message && (
                <p
                    role={message.type === "error" ? "alert" : "status"}
                    className={`mt-3 rounded-lg p-3 text-[0.8125rem] ${message.type === "error" ? "bg-error-bg text-error-ink" : "bg-success-bg text-success-ink"}`}
                >
                    {message.text}
                </p>
            )}
        </section>
    );
}
