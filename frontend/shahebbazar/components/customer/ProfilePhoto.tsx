"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { BROWSER_API_BASE, browserAssetUrl } from "@/lib/apiBase";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 2 * 1024 * 1024;

// The customer's profile photo on My details: shown beside their name in the header and on their
// reviews. Saved as soon as it is chosen or removed, like a business's logo.
export function ProfilePhoto({ name, initial }: { name: string; initial: string | null }) {
    const router = useRouter();
    const [photo, setPhoto] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const src = browserAssetUrl(photo);

    async function send(method: "POST" | "DELETE", file?: File) {
        setBusy(true);
        setMessage(null);
        try {
            const body = file ? new FormData() : undefined;
            if (file) body!.append("avatar", file);
            const res = await fetch(`${BROWSER_API_BASE}/api/me/avatar`, { method, body, credentials: "include" });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                return setMessage({ ok: false, text: data?.error ?? `Something went wrong (${res.status}).` });
            }
            setPhoto(file ? (await res.json()).avatar_url : null);
            setMessage({ ok: true, text: file ? "Photo saved." : "Photo removed." });
            // The header shows the photo too.
            router.refresh();
        } catch {
            setMessage({ ok: false, text: "Could not reach the server. Try again." });
        } finally {
            setBusy(false);
        }
    }

    function choose(file: File) {
        if (!TYPES.includes(file.type)) return setMessage({ ok: false, text: "Choose a JPG, PNG or WEBP image." });
        if (file.size > MAX) return setMessage({ ok: false, text: "The photo must be 2 MB or smaller." });
        send("POST", file);
    }

    return (
        <section aria-labelledby="photo-heading" className="mb-5 max-w-lg rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 id="photo-heading" className="text-sm font-semibold">
                Profile photo <span className="font-normal text-muted">(optional)</span>
            </h2>
            <div className="mt-3 flex items-center gap-4">
                <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 text-2xl font-semibold text-brand-700">
                    {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="Your profile photo" className="size-full object-cover" />
                    ) : (
                        <span aria-hidden>{name.trim().charAt(0).toUpperCase() || "?"}</span>
                    )}
                    {busy && (
                        <span className="absolute inset-0 grid place-items-center bg-surface/70">
                            <Loader2 className="size-5 animate-spin text-brand-600" />
                        </span>
                    )}
                </span>
                <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => input.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-[10px] border border-line-strong px-3 py-1.5 text-[0.8125rem] font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                        >
                            <Camera className="size-4" aria-hidden /> {src ? "Change photo" : "Add a photo"}
                        </button>
                        {src && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => send("DELETE")}
                                className="rounded-[10px] px-3 py-1.5 text-[0.8125rem] font-medium text-error-ink hover:bg-error-bg disabled:opacity-50"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                        Shown beside your name at the top of the site and on your reviews. JPG, PNG or WEBP, up to 2 MB.
                    </p>
                </div>
            </div>
            <input
                ref={input}
                type="file"
                accept={TYPES.join(",")}
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose a profile photo"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) choose(file);
                }}
            />
            {message && (
                <p role={message.ok ? "status" : "alert"} className={`mt-3 text-[0.8125rem] ${message.ok ? "text-success-ink" : "text-error-ink"}`}>
                    {message.text}
                </p>
            )}
        </section>
    );
}
