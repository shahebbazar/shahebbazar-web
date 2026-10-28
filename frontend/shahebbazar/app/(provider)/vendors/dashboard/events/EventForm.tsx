"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crop, ImagePlus, Loader2, X } from "lucide-react";
import { BROWSER_API_BASE } from "@/lib/apiBase";
import { CoverCropDialog, type CropPosition, type CropSource } from "@/components/provider/CoverCropDialog";
import { EVENT_TYPES } from "@/lib/events";
import type { EventPhoto, VendorEvent } from "@/lib/types";
import { saveEvent, type EventFormBody } from "./actions";

// Adding or editing one of the business's events (KAN-298). A new event's photos are chosen here
// and uploaded once the event is saved; an existing event's photos are managed in EventPhotos.

type Area = { id: number; name: string; city: string };

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTOS_MAX = 7;

const inputClass =
    "mt-1 w-full rounded-[10px] border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100";
const border = (error?: string) => (error ? "border-error-ink" : "border-line-strong");

/** A stored time as a datetime-local value in Dhaka time ("2026-11-02T18:00"). */
function toLocalInput(iso: string | null): string {
    if (!iso) return "";
    return new Date(new Date(iso).getTime() + 6 * 3600000).toISOString().slice(0, 16);
}

function initialForm(event: VendorEvent | undefined, defaultAreaId: number | null): EventFormBody {
    return {
        title: event?.event_title ?? "",
        title_bn: event?.event_title_bn ?? "",
        description: event?.event_description ?? "",
        type: event?.event_type ?? "market",
        starts_at: toLocalInput(event?.event_starts_at ?? null),
        ends_at: toLocalInput(event?.event_ends_at ?? null),
        is_online: event?.event_is_online ?? false,
        online_url: event?.event_online_url ?? "",
        venue: event?.event_venue ?? "",
        location_id: event ? (event.location_id ? String(event.location_id) : "") : defaultAreaId ? String(defaultAreaId) : "",
        price_type: event?.event_price_type ?? "free",
        price_bdt: event?.event_price_bdt ? String(Number(event.event_price_bdt)) : "",
        ticket_url: event?.event_ticket_url ?? "",
    };
}

/** Why a chosen photo can't be uploaded, or null. */
export function photoProblem(file: File): string | null {
    if (!PHOTO_TYPES.includes(file.type)) return `"${file.name}" is not a JPG, PNG or WEBP image.`;
    if (file.size > PHOTO_MAX_BYTES) return `"${file.name}" is larger than 5 MB.`;
    return null;
}

/** A chosen photo and its preview; a cropped cover also has the photo it was cut from, and where. */
type ChosenPhoto = { file: File; url: string; original?: { file: File; url: string; start: CropPosition } };

function releasePhoto(photo: ChosenPhoto) {
    URL.revokeObjectURL(photo.url);
    if (photo.original) URL.revokeObjectURL(photo.original.url);
}

export function EventForm({
    vendorId,
    areas,
    event,
    defaultAreaId = null,
}: {
    vendorId: number;
    areas: Area[];
    /** The event being edited; absent when adding one. */
    event?: VendorEvent;
    defaultAreaId?: number | null;
}) {
    const router = useRouter();
    const [form, setForm] = useState(() => initialForm(event, defaultAreaId));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
    // Chosen photos with a preview address each, released when removed or when the form goes away. The
    // cropped cover also keeps the photo it was cut from and where, so cropping it again can zoom back
    // out to the whole photo (KAN-330).
    const [chosen, setChosen] = useState<ChosenPhoto[]>([]);
    const [pending, startTransition] = useTransition();
    const chosenRef = useRef(chosen);
    useEffect(() => {
        chosenRef.current = chosen;
    }, [chosen]);
    useEffect(() => () => chosenRef.current.forEach(releasePhoto), []);
    const files = chosen.map((c) => c.file);
    // The cover being cropped: the first of newly chosen photos (`rest` are the others), or the current
    // cover again (`rest` null); `original` is the photo being cropped, kept with the cover.
    const [cropping, setCropping] = useState<(CropSource & { original: File; rest: File[] | null }) | null>(null);

    const set =<K extends keyof EventFormBody>(key: K, value: EventFormBody[K]) => setForm((f) => ({ ...f, [key]: value }));

    function addFiles(added: File[]) {
        for (const file of added) {
            const problem = photoProblem(file);
            if (problem) return setMessage({ type: "error", text: problem });
        }
        if (chosen.length + added.length > PHOTOS_MAX) {
            return setMessage({ type: "error", text: `Up to ${PHOTOS_MAX} photos per event.` });
        }
        setMessage(null);
        // The first photo is the cover, so it is cropped to the share-card shape first.
        if (chosen.length === 0) {
            return setCropping({ src: URL.createObjectURL(added[0]), name: added[0].name, original: added[0], rest: added.slice(1) });
        }
        setChosen((current) => [...current, ...added.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    }

    function closeCrop() {
        // Cancelling the first crop drops the photo; a re-crop opens the original, which stays in use.
        if (cropping?.rest) URL.revokeObjectURL(cropping.src);
        setCropping(null);
    }

    function cropped(cover: File, start: CropPosition) {
        if (!cropping) return;
        // `cropping.src` is the original photo either way: just chosen, or kept from the first crop.
        const coverEntry = { file: cover, url: URL.createObjectURL(cover), original: { file: cropping.original, url: cropping.src, start } };
        if (cropping.rest) {
            const rest = cropping.rest.map((file) => ({ file, url: URL.createObjectURL(file) }));
            setChosen([coverEntry, ...rest]);
        } else {
            // The old preview goes, unless it was the photo just cropped (a cover never cropped before).
            if (chosen[0].url !== cropping.src) URL.revokeObjectURL(chosen[0].url);
            setChosen((current) => [coverEntry, ...current.slice(1)]);
        }
        setCropping(null);
    }

    function cropAgain() {
        const cover = chosen[0];
        const original = cover.original ?? { file: cover.file, url: cover.url, start: undefined };
        setCropping({ src: original.url, name: original.file.name, start: original.start, original: original.file, rest: null });
    }

    function removeFile(index: number) {
        releasePhoto(chosen[index]);
        setChosen((current) => current.filter((_, j) => j !== index));
    }

    async function uploadPhotos(eventId: number): Promise<string | null> {
        if (files.length === 0) return null;
        try {
            const body = new FormData();
            for (const file of files) body.append("photos", file);
            const res = await fetch(`${BROWSER_API_BASE}/api/events/${eventId}/photos`, { method: "POST", body, credentials: "include" });
            const data = await res.json().catch(() => null);
            if (!res.ok) return data?.error ?? "The photos could not be uploaded.";
            // The cover keeps the photo it was cropped from. If that fails the event and its photos are
            // still saved; cropping the cover again then starts from the cropped cover.
            const cover = (data?.photos as EventPhoto[] | undefined)?.find((p) => p.photo_is_cover);
            const original = chosen[0]?.original;
            if (cover && original) {
                const form = new FormData();
                form.append("original", original.file);
                form.append("crop", JSON.stringify(original.start));
                await fetch(`${BROWSER_API_BASE}/api/events/${eventId}/photos/${cover.photo_id}/original`, {
                    method: "PUT",
                    body: form,
                    credentials: "include",
                }).catch(() => null);
            }
            return null;
        } catch {
            return "The photos could not be uploaded.";
        }
    }

    function submit() {
        setErrors({});
        setMessage(null);
        startTransition(async () => {
            const result = await saveEvent(vendorId, event?.event_id ?? null, form);
            if (!result.ok) {
                setErrors(result.errors ?? {});
                setMessage({ type: "error", text: result.errors ? "Check the highlighted details." : result.error });
                return;
            }
            const saved = result.data.event;
            if (event) {
                const told = result.data.notified ?? 0;
                setMessage({
                    type: "success",
                    text:
                        saved.event_status === "pending"
                            ? "Saved and sent for approval."
                            : `Changes saved.${told > 0 ? ` The ${told} ${told === 1 ? "person" : "people"} going got a message with the new time and place.` : ""}`,
                });
                router.refresh();
                return;
            }
            const photoError = await uploadPhotos(saved.event_id);
            const next = new URLSearchParams({ vendor: String(vendorId), added: saved.event_status });
            if (photoError) next.set("photos", "failed");
            router.push(`/vendors/dashboard/events/${saved.event_id}?${next}`);
        });
    }

    const field = (key: string) => ({
        "aria-invalid": Boolean(errors[key]) || undefined,
        "aria-describedby": errors[key] ? `e-${key}-error` : undefined,
    });
    const errorText = (key: string) =>
        errors[key] ? (
            <span id={`e-${key}-error`} className="mt-1 block text-[0.75rem] text-error-ink">
                {errors[key]}
            </span>
        ) : null;

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
            noValidate
            className="space-y-6"
        >
            <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="text-[1.0625rem] font-semibold">The event</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block text-[0.8125rem] font-medium md:col-span-2">
                        Event name <span className="text-error-ink">*</span>
                        <input
                            name="title"
                            value={form.title}
                            onChange={(e) => set("title", e.target.value)}
                            maxLength={150}
                            className={`${inputClass} ${border(errors.title)}`}
                            {...field("title")}
                        />
                        {errorText("title")}
                    </label>
                    <label className="block text-[0.8125rem] font-medium">
                        Name in Bangla <span className="font-normal text-muted">(optional)</span>
                        <input
                            name="title_bn"
                            lang="bn"
                            value={form.title_bn}
                            onChange={(e) => set("title_bn", e.target.value)}
                            maxLength={150}
                            className={`${inputClass} ${border(errors.title_bn)}`}
                            {...field("title_bn")}
                        />
                        {errorText("title_bn")}
                    </label>
                    <label className="block text-[0.8125rem] font-medium">
                        Kind of event
                        <select
                            name="type"
                            value={form.type}
                            onChange={(e) => set("type", e.target.value)}
                            className={`${inputClass} ${border(errors.type)}`}
                            {...field("type")}
                        >
                            {EVENT_TYPES.map((t) => (
                                <option key={t.key} value={t.key}>
                                    {t.en}
                                </option>
                            ))}
                        </select>
                        {errorText("type")}
                    </label>
                    <label className="block text-[0.8125rem] font-medium md:col-span-2">
                        Details <span className="font-normal text-muted">(what happens, who it&apos;s for, what to bring)</span>
                        <textarea
                            name="description"
                            value={form.description}
                            onChange={(e) => set("description", e.target.value)}
                            rows={5}
                            maxLength={5000}
                            className={`${inputClass} ${border(errors.description)}`}
                            {...field("description")}
                        />
                        {errorText("description")}
                    </label>
                </div>
            </section>

            <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="text-[1.0625rem] font-semibold">When and where</h2>
                <p className="mt-1 text-[0.8125rem] text-muted">Times are Bangladesh time.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block text-[0.8125rem] font-medium">
                        Starts <span className="text-error-ink">*</span>
                        <input
                            type="datetime-local"
                            name="starts_at"
                            value={form.starts_at}
                            onChange={(e) => set("starts_at", e.target.value)}
                            className={`${inputClass} ${border(errors.starts_at)}`}
                            {...field("starts_at")}
                        />
                        {errorText("starts_at")}
                    </label>
                    <label className="block text-[0.8125rem] font-medium">
                        Ends <span className="font-normal text-muted">(optional)</span>
                        <input
                            type="datetime-local"
                            name="ends_at"
                            value={form.ends_at}
                            min={form.starts_at || undefined}
                            onChange={(e) => set("ends_at", e.target.value)}
                            className={`${inputClass} ${border(errors.ends_at)}`}
                            {...field("ends_at")}
                        />
                        {errorText("ends_at")}
                    </label>

                    <fieldset className="md:col-span-2">
                        <legend className="text-[0.8125rem] font-medium">Where is it?</legend>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {[
                                [false, "In person"],
                                [true, "Online"],
                            ].map(([online, label]) => (
                                <label
                                    key={String(online)}
                                    className={`inline-flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm ${
                                        form.is_online === online ? "border-brand-600 bg-brand-50 font-medium text-brand-700" : "border-line-strong"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="is_online"
                                        checked={form.is_online === online}
                                        onChange={() => set("is_online", online as boolean)}
                                        className="accent-brand-600"
                                    />
                                    {label as string}
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {form.is_online ? (
                        <label className="block text-[0.8125rem] font-medium md:col-span-2">
                            Link to join <span className="text-error-ink">*</span>
                            <input
                                type="url"
                                name="online_url"
                                inputMode="url"
                                placeholder="https://"
                                value={form.online_url}
                                onChange={(e) => set("online_url", e.target.value)}
                                className={`${inputClass} ${border(errors.online_url)}`}
                                {...field("online_url")}
                            />
                            {errorText("online_url")}
                        </label>
                    ) : (
                        <>
                            <label className="block text-[0.8125rem] font-medium">
                                Venue or address <span className="text-error-ink">*</span>
                                <input
                                    name="venue"
                                    value={form.venue}
                                    onChange={(e) => set("venue", e.target.value)}
                                    maxLength={255}
                                    className={`${inputClass} ${border(errors.venue)}`}
                                    {...field("venue")}
                                />
                                {errorText("venue")}
                            </label>
                            <label className="block text-[0.8125rem] font-medium">
                                Area
                                <select
                                    name="location_id"
                                    value={form.location_id}
                                    onChange={(e) => set("location_id", e.target.value)}
                                    className={`${inputClass} ${border(errors.location_id)}`}
                                    {...field("location_id")}
                                >
                                    <option value="">Choose an area</option>
                                    {areas.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}, {a.city}
                                        </option>
                                    ))}
                                </select>
                                {errorText("location_id")}
                            </label>
                        </>
                    )}
                </div>
            </section>

            <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="text-[1.0625rem] font-semibold">Entry</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                    {[
                        ["free", "Free"],
                        ["paid", "Paid or ticketed"],
                    ].map(([value, label]) => (
                        <label
                            key={value}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm ${
                                form.price_type === value ? "border-brand-600 bg-brand-50 font-medium text-brand-700" : "border-line-strong"
                            }`}
                        >
                            <input
                                type="radio"
                                name="price_type"
                                checked={form.price_type === value}
                                onChange={() => set("price_type", value)}
                                className="accent-brand-600"
                            />
                            {label}
                        </label>
                    ))}
                </div>
                {form.price_type === "paid" && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="block text-[0.8125rem] font-medium">
                            Ticket price (৳) <span className="font-normal text-muted">(optional)</span>
                            <input
                                name="price_bdt"
                                inputMode="decimal"
                                value={form.price_bdt}
                                onChange={(e) => set("price_bdt", e.target.value)}
                                className={`${inputClass} ${border(errors.price_bdt)}`}
                                {...field("price_bdt")}
                            />
                            {errorText("price_bdt")}
                        </label>
                        <label className="block text-[0.8125rem] font-medium">
                            Where to buy tickets <span className="font-normal text-muted">(optional link)</span>
                            <input
                                type="url"
                                name="ticket_url"
                                inputMode="url"
                                placeholder="https://"
                                value={form.ticket_url}
                                onChange={(e) => set("ticket_url", e.target.value)}
                                className={`${inputClass} ${border(errors.ticket_url)}`}
                                {...field("ticket_url")}
                            />
                            {errorText("ticket_url")}
                        </label>
                    </div>
                )}
            </section>

            {!event && (
                <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <h2 className="text-[1.0625rem] font-semibold">
                        Photos <span className="font-normal text-muted">({files.length} of {PHOTOS_MAX})</span>
                    </h2>
                    <p className="mt-1 text-[0.8125rem] text-muted">
                        The first is the cover, shown when the event is shared: at least 1200 × 630 pixels looks best.
                        JPG, PNG or WEBP, up to 5 MB each.
                    </p>
                    <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {chosen.map(({ url: src }, i) => (
                            <li key={src} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-surface-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={src} alt={`Chosen photo ${i + 1}`} className="size-full object-cover" />
                                {i === 0 && (
                                    <>
                                        <span className="absolute top-2 left-2 rounded-full bg-brand-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
                                            Cover
                                        </span>
                                        <button
                                            type="button"
                                            onClick={cropAgain}
                                            className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-surface/95 px-2 py-1 text-[0.6875rem] font-medium text-ink hover:bg-surface"
                                        >
                                            <Crop className="size-3" /> Crop
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeFile(i)}
                                    aria-label={`Remove chosen photo ${i + 1}`}
                                    className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md bg-surface/95 text-error-ink hover:bg-surface"
                                >
                                    <X className="size-4" />
                                </button>
                            </li>
                        ))}
                        {files.length < PHOTOS_MAX && (
                            <li className="aspect-[4/3]">
                                <label className="grid size-full cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong text-[0.8125rem] font-medium text-brand-600 hover:border-brand-600 hover:bg-brand-50">
                                    <span className="flex flex-col items-center gap-1.5">
                                        <ImagePlus className="size-5" /> {files.length === 0 ? "Add photos" : "Add more"}
                                    </span>
                                    <input
                                        type="file"
                                        accept={PHOTO_TYPES.join(",")}
                                        multiple
                                        className="sr-only"
                                        aria-label="Choose event photos"
                                        onChange={(e) => {
                                            const picked = Array.from(e.target.files ?? []);
                                            e.target.value = "";
                                            if (picked.length > 0) addFiles(picked);
                                        }}
                                    />
                                </label>
                            </li>
                        )}
                    </ul>
                    <CoverCropDialog source={cropping} onCancel={closeCrop} onCropped={cropped} />
                </section>
            )}

            {message && (
                <p
                    role={message.type === "error" ? "alert" : "status"}
                    className={`rounded-lg p-3 text-[0.8125rem] ${message.type === "error" ? "bg-error-bg text-error-ink" : "bg-success-bg text-success-ink"}`}
                >
                    {message.text}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex items-center gap-2 rounded-[10px] bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                    {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {event ? "Save changes" : "Add event"}
                </button>
            </div>
        </form>
    );
}
