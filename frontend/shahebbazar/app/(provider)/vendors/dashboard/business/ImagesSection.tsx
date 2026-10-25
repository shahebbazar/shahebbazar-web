"use client";

import { useRef, useState } from "react";
import { Crop, ImagePlus, Loader2, Star, Trash2, Upload } from "lucide-react";
import { BROWSER_API_BASE } from "@/lib/apiBase";
import { CoverCropDialog, type CropSource } from "@/components/provider/CoverCropDialog";
import { coverQuality, type CoverQuality } from "@/lib/coverPhoto";

type Photo = { id: number; url: string };

/** The cover being cropped: the first of a new upload, or a saved photo re-cropped in place. */
type Cropping = CropSource & ({ kind: "upload"; rest: File[] } | { kind: "replace"; photo: Photo });

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const LOGO_MAX = 2 * 1024 * 1024;
const PHOTO_MAX = 5 * 1024 * 1024;

const ASSET_BASE = process.env.NEXT_PUBLIC_ASSET_BASE_URL || BROWSER_API_BASE;

/** Stored "uploads/x.jpg" -> absolute URL for an <img>. */
export function imageSrc(stored: string | null): string | null {
    if (!stored) return null;
    if (/^https?:\/\//i.test(stored)) return stored;
    return `${ASSET_BASE}/${stored.replace(/^\/+/, "").replace(/\\/g, "/")}`;
}

/** Why a chosen file cannot be uploaded, or null when it can. */
function checkFile(file: File, max: number): string | null {
    if (!TYPES.includes(file.type)) return `"${file.name}" is not a JPG, PNG or WEBP image.`;
    if (file.size > max) return `"${file.name}" is larger than ${max / 1024 / 1024} MB.`;
    return null;
}

async function errorText(res: Response) {
    const body = await res.json().catch(() => null);
    return body?.error ?? `Upload failed (${res.status}).`;
}

// Logo and business photos.
export function ImagesSection({
    vendorId,
    logoUrl,
    photos,
    photosMax,
    onLogoChange,
    onPhotosReordered,
    onPhotosFromServer,
}: {
    vendorId: number;
    logoUrl: string | null;
    photos: Photo[];
    photosMax: number;
    onLogoChange: (url: string | null) => void;
    /** A local reorder, saved with the form. */
    onPhotosReordered: (photos: Photo[]) => void;
    /** The server's list after an upload or removal. */
    onPhotosFromServer: (photos: Photo[]) => void;
}) {
    const [busy, setBusy] = useState<"logo" | "photos" | null>(null);
    const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
    const [cropping, setCropping] = useState<Cropping | null>(null);
    // How each saved photo would look as a cover, measured once it has loaded.
    const [quality, setQuality] = useState<Record<number, CoverQuality>>({});
    const logoInput = useRef<HTMLInputElement>(null);
    const photoInput = useRef<HTMLInputElement>(null);
    const left = photosMax - photos.length;

    async function uploadLogo(file: File) {
        const problem = checkFile(file, LOGO_MAX);
        if (problem) return setMessage({ type: "error", text: problem });

        setBusy("logo");
        setMessage(null);
        try {
            const form = new FormData();
            form.append("logo", file);
            const res = await fetch(`${BROWSER_API_BASE}/api/vendors/${vendorId}/logo`, { method: "POST", body: form, credentials: "include" });
            if (!res.ok) return setMessage({ type: "error", text: await errorText(res) });
            const { logo_url } = await res.json();
            onLogoChange(logo_url);
            setMessage({ type: "success", text: "Logo updated." });
        } catch {
            setMessage({ type: "error", text: "Could not reach the server. Try again." });
        } finally {
            setBusy(null);
        }
    }

    async function removeLogo() {
        setBusy("logo");
        setMessage(null);
        try {
            const res = await fetch(`${BROWSER_API_BASE}/api/vendors/${vendorId}/logo`, { method: "DELETE", credentials: "include" });
            if (!res.ok) return setMessage({ type: "error", text: await errorText(res) });
            onLogoChange(null);
        } catch {
            setMessage({ type: "error", text: "Could not reach the server. Try again." });
        } finally {
            setBusy(null);
        }
    }

    function uploadPhotos(files: File[]) {
        if (files.length > left) {
            return setMessage({
                type: "error",
                text: left > 0 ? `You can add ${left} more photo${left === 1 ? "" : "s"}.` : "Remove a photo to add another.",
            });
        }
        for (const file of files) {
            const problem = checkFile(file, PHOTO_MAX);
            if (problem) return setMessage({ type: "error", text: problem });
        }
        setMessage(null);
        // The first photo becomes the cover, so it is cropped to the share-card shape first.
        if (photos.length === 0) {
            return setCropping({ kind: "upload", src: URL.createObjectURL(files[0]), name: files[0].name, rest: files.slice(1) });
        }
        sendPhotos(files);
    }

    function closeCrop() {
        if (cropping?.src.startsWith("blob:")) URL.revokeObjectURL(cropping.src);
        setCropping(null);
    }

    async function cropped(file: File) {
        if (!cropping) return;
        if (cropping.kind === "upload") {
            const files = [file, ...cropping.rest];
            closeCrop();
            return sendPhotos(files);
        }
        setBusy("photos");
        try {
            const form = new FormData();
            form.append("photo", file);
            const res = await fetch(`${BROWSER_API_BASE}/api/vendors/${vendorId}/photos/${cropping.photo.id}/file`, {
                method: "PUT",
                body: form,
                credentials: "include",
            });
            if (!res.ok) return setMessage({ type: "error", text: await errorText(res) });
            onPhotosFromServer((await res.json()).photos);
            setMessage({ type: "success", text: "Cover photo cropped." });
            closeCrop();
        } catch {
            setMessage({ type: "error", text: "Could not reach the server. Try again." });
        } finally {
            setBusy(null);
        }
    }

    async function sendPhotos(files: File[]) {
        setBusy("photos");
        setMessage(null);
        try {
            const form = new FormData();
            for (const file of files) form.append("photos", file);
            const res = await fetch(`${BROWSER_API_BASE}/api/vendors/${vendorId}/photos`, { method: "POST", body: form, credentials: "include" });
            if (!res.ok) return setMessage({ type: "error", text: await errorText(res) });
            const body = await res.json();
            onPhotosFromServer(body.photos);
            setMessage({ type: "success", text: `${files.length} photo${files.length === 1 ? "" : "s"} added.` });
        } catch {
            setMessage({ type: "error", text: "Could not reach the server. Try again." });
        } finally {
            setBusy(null);
        }
    }

    async function removePhoto(photo: Photo) {
        if (!window.confirm("Remove this photo from your business?")) return;
        setBusy("photos");
        setMessage(null);
        try {
            const res = await fetch(`${BROWSER_API_BASE}/api/vendors/${vendorId}/photos/${photo.id}`, { method: "DELETE", credentials: "include" });
            if (!res.ok && res.status !== 404) return setMessage({ type: "error", text: await errorText(res) });
            onPhotosFromServer(photos.filter((p) => p.id !== photo.id));
        } catch {
            setMessage({ type: "error", text: "Could not reach the server. Try again." });
        } finally {
            setBusy(null);
        }
    }

    const logo = imageSrc(logoUrl);

    return (
        <div>
            <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
                {/* ---- logo */}
                <div>
                    <p className="mb-1.5 text-[0.8125rem] font-medium">Business Logo</p>
                    <div className="relative grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-surface-2">
                        {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt="Business logo" className="size-full object-contain p-3" />
                        ) : (
                            <ImagePlus className="size-8 text-soft" />
                        )}
                        {busy === "logo" && (
                            <span className="absolute inset-0 grid place-items-center bg-surface/70">
                                <Loader2 className="size-6 animate-spin text-brand-600" />
                            </span>
                        )}
                    </div>
                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => logoInput.current?.click()}
                            className="rounded-[10px] border border-line-strong px-3 py-1.5 text-[0.8125rem] font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                        >
                            {logo ? "Replace" : "Upload logo"}
                        </button>
                        {logo && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={removeLogo}
                                className="rounded-[10px] px-3 py-1.5 text-[0.8125rem] font-medium text-error-ink hover:bg-error-bg disabled:opacity-50"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                    <p className="mt-1.5 text-[0.75rem] text-muted">JPG, PNG or WEBP, up to 2 MB.</p>
                    <input
                        ref={logoInput}
                        type="file"
                        accept={TYPES.join(",")}
                        className="sr-only"
                        tabIndex={-1}
                        aria-label="Choose a logo image"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) uploadLogo(file);
                        }}
                    />
                </div>

                {/* ---- photos */}
                <div className="min-w-0">
                    <p className="mb-1.5 text-[0.8125rem] font-medium">
                        Business Images <span className="font-normal text-muted">({photos.length} of {photosMax})</span>
                    </p>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {photos.map((photo, index) => (
                            <li key={photo.id} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-surface-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={imageSrc(photo.url) ?? ""}
                                    alt={`Business photo ${index + 1}`}
                                    className="size-full object-cover"
                                    onLoad={(e) => {
                                        const q = coverQuality(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
                                        setQuality((current) => (current[photo.id] === q ? current : { ...current, [photo.id]: q }));
                                    }}
                                />
                                {index === 0 && (
                                    <span className="absolute top-2 left-2 rounded-full bg-brand-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
                                        Cover
                                    </span>
                                )}
                                {index === 0 && quality[photo.id] === "small" && (
                                    <span className="absolute top-2 right-2 rounded-full bg-error-bg px-2 py-0.5 text-[0.6875rem] font-semibold text-error-ink">
                                        Too small to share well
                                    </span>
                                )}
                                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink/60 to-transparent p-1.5">
                                    {index === 0 && (
                                        <button
                                            type="button"
                                            disabled={busy !== null}
                                            onClick={() => setCropping({ kind: "replace", src: imageSrc(photo.url) ?? "", name: `cover-${photo.id}`, photo })}
                                            className="inline-flex items-center gap-1 rounded-md bg-surface/95 px-2 py-1 text-[0.6875rem] font-medium text-ink hover:bg-surface"
                                        >
                                            <Crop className="size-3" /> Crop
                                        </button>
                                    )}
                                    {index > 0 && (
                                        <button
                                            type="button"
                                            disabled={busy !== null}
                                            onClick={() => onPhotosReordered([photo, ...photos.filter((p) => p.id !== photo.id)])}
                                            className="inline-flex items-center gap-1 rounded-md bg-surface/95 px-2 py-1 text-[0.6875rem] font-medium text-ink hover:bg-surface"
                                        >
                                            <Star className="size-3" /> Make cover
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        disabled={busy !== null}
                                        onClick={() => removePhoto(photo)}
                                        aria-label={`Remove photo ${index + 1}`}
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
                                    disabled={busy !== null}
                                    onClick={() => photoInput.current?.click()}
                                    className="grid size-full place-items-center rounded-lg border border-dashed border-line-strong text-[0.8125rem] font-medium text-brand-600 hover:border-brand-600 hover:bg-brand-50 disabled:opacity-50"
                                >
                                    <span className="flex flex-col items-center gap-1.5">
                                        {busy === "photos" ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                                        {photos.length === 0 ? "Upload photos" : "Upload more"}
                                    </span>
                                </button>
                            </li>
                        )}
                    </ul>
                    <p className="mt-1.5 text-[0.75rem] text-muted">
                        Up to {photosMax} images, JPG, PNG or WEBP, 5 MB each. The first is your cover photo, shown
                        when your page is shared: at least 1200 × 630 pixels looks best. The order is saved when you
                        save the page.
                    </p>
                    <input
                        ref={photoInput}
                        type="file"
                        accept={TYPES.join(",")}
                        multiple
                        className="sr-only"
                        tabIndex={-1}
                        aria-label="Choose business photos"
                        onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            if (files.length > 0) uploadPhotos(files);
                        }}
                    />
                </div>
            </div>

            <CoverCropDialog source={cropping} busy={busy === "photos"} onCancel={closeCrop} onCropped={cropped} />

            {message && (
                <p
                    role={message.type === "error" ? "alert" : "status"}
                    className={`mt-4 rounded-lg p-3 text-[0.8125rem] ${
                        message.type === "error" ? "bg-error-bg text-error-ink" : "bg-success-bg text-success-ink"
                    }`}
                >
                    {message.text}
                </p>
            )}
        </div>
    );
}
