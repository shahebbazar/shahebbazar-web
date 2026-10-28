"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SiFacebook, SiInstagram, SiTiktok, SiYoutube } from "@icons-pack/react-simple-icons";
import { CheckCircle2, Circle, ExternalLink, Loader2, MapPin, Phone, Plus, Trash2 } from "lucide-react";
import type {
    FactEntry,
    SocialPlatform,
    VendorProfile,
    VendorProfileInput,
    VendorProfileWithOptions,
    PhoneType,
} from "@/lib/types";
import { formatLocalPhone, formatPhone, toStoredPhone } from "@/lib/format";
import { refreshPublicPages, saveBusinessProfile } from "./actions";
import { Field, Section, borderFor, describedBy, inputClass } from "./formParts";
import { DAY_NAMES, HoursSection, type DayHours } from "./HoursSection";
import { ImagesSection, imageSrc } from "./ImagesSection";

// Add / Edit Business, built to UIs/…18.25.27 (3).jpeg.

type Photo = { id: number; url: string };
type FactRow = FactEntry & { key: number };

const ALT_PHONE_HINTS: Record<PhoneType, string> = {
    landline: "Optional. An office or shop landline, e.g. 0721-775544.",
    mobile: "Optional. Another mobile for customers to call, e.g. +8801812345678.",
    whatsapp: "Optional. A WhatsApp number customers can message, e.g. +8801812345678.",
};

type FormState = {
    name: string;
    name_bn: string;
    categories: string[]; // select values; "" = none chosen
    location_id: string;
    address: string;
    phone: string;
    alt_phone: string;
    alt_phone_type: PhoneType;
    description: string;
    email: string;
    website: string;
    facts: FactRow[];
    social: Record<SocialPlatform, string>;
    hours: DayHours[]; // index = day, 0 = Sunday
};

const SOCIAL: { platform: SocialPlatform; label: string; Icon: typeof SiFacebook; placeholder: string }[] = [
    { platform: "facebook", label: "Facebook", Icon: SiFacebook, placeholder: "facebook.com/yourpage" },
    { platform: "instagram", label: "Instagram", Icon: SiInstagram, placeholder: "instagram.com/yourname" },
    { platform: "youtube", label: "YouTube", Icon: SiYoutube, placeholder: "youtube.com/@yourchannel" },
    { platform: "tiktok", label: "TikTok", Icon: SiTiktok, placeholder: "tiktok.com/@yourname" },
];

// Converting between the API's shape and the form's

function toForm(p: VendorProfile): FormState {
    const v = p.vendor;
    return {
        name: v.vendor_name,
        name_bn: v.vendor_name_bn ?? "",
        categories: p.category_ids.length > 0 ? p.category_ids.map(String) : [""],
        location_id: v.location_id ? String(v.location_id) : "",
        address: v.vendor_address ?? "",
        // Main numbers as +8801712345678; the second number in the local style (0721-775544).
        // The owner's sign-in mobile, shown read-only.
        phone: formatPhone(v.owner_phone ?? v.vendor_phone ?? ""),
        // The second number in the style of its type: a landline as 0721-775544, a mobile or WhatsApp
        // number as +8801712345678.
        alt_phone: v.vendor_phone_alt ? (v.vendor_phone_alt_type === "landline" ? formatLocalPhone : formatPhone)(v.vendor_phone_alt) : "",
        alt_phone_type: v.vendor_phone_alt_type ?? "landline",
        description: v.vendor_description ?? "",
        email: v.vendor_email ?? "",
        website: v.vendor_website ?? "",
        facts: p.facts.map((f, key) => ({ ...f, key })),
        social: {
            facebook: p.social.facebook ?? "",
            instagram: p.social.instagram ?? "",
            youtube: p.social.youtube ?? "",
            tiktok: p.social.tiktok ?? "",
        },
        hours: DAY_NAMES.map((_, day) => {
            const h = p.hours.find((x) => x.day === day);
            return h ? { mode: h.mode, open: h.open ?? "", close: h.close ?? "" } : { mode: "unset", open: "", close: "" };
        }),
    };
}

function toInput(f: FormState, photos: Photo[], submit: boolean): VendorProfileInput {
    return {
        name: f.name,
        name_bn: f.name_bn,
        category_ids: [...new Set(f.categories.filter(Boolean).map(Number))],
        location_id: f.location_id ? Number(f.location_id) : null,
        address: f.address,
        phone: f.phone,
        alt_phone: f.alt_phone,
        alt_phone_type: f.alt_phone_type,
        description: f.description,
        email: f.email,
        website: f.website,
        // Sent as displayed, blank rows included, so an error's index ("facts.2.label") matches the row on screen.
        facts: f.facts.map(({ label, value, group }) => ({ label, value, group })),
        social: f.social,
        hours: f.hours.flatMap((h, day) =>
            h.mode === "unset"
                ? []
                : [{ day, mode: h.mode, open: h.mode === "open" ? h.open : null, close: h.mode === "open" ? h.close : null }]
        ),
        photo_order: photos.map((p) => p.id),
        submit,
    };
}

/** Comparable form of what would be saved, for "unsaved changes". */
const fingerprint = (f: FormState, photos: Photo[]) => JSON.stringify(toInput(f, photos, false));

/** Today's weekday in Rajshahi, 0 = Sunday. */
function dhakaWeekday(): number {
    const name = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Dhaka" }).format(new Date());
    return DAY_NAMES.indexOf(name);
}

function clock(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ---------------------------------------------------------------------

export function BusinessForm({ initial }: { initial: VendorProfileWithOptions }) {
    const { options, limits } = initial;
    const vendorId = initial.vendor.vendor_id;

    const [profile, setProfile] = useState<VendorProfile>(initial);
    const [form, setForm] = useState<FormState>(() => toForm(initial));
    const [photos, setPhotos] = useState<Photo[]>(initial.photos);
    const [logoUrl, setLogoUrl] = useState<string | null>(initial.vendor.vendor_logo_url);
    // What the server holds; "unsaved changes" compares against it.
    const [saved, setSaved] = useState(() => fingerprint(toForm(initial), initial.photos));
    const [nextKey, setNextKey] = useState(initial.facts.length);

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<{ type: "error" | "success"; text: string } | null>(null);
    const [saving, setSaving] = useState(false);

    const current = fingerprint(form, photos);
    const dirty = current !== saved;
    const vendorStatus = profile.vendor.vendor_status;
    const canSubmit = vendorStatus === "draft" || vendorStatus === "rejected";
    const locked = vendorStatus === "suspended";

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
        // An edited field's old error no longer applies.
        setErrors((e) => {
            if (!(key in e)) return e;
            const rest = { ...e };
            delete rest[key as string];
            return rest;
        });
    };

    // ---- leaving with unsaved changes
    useEffect(() => {
        if (!dirty) return;
        const warnUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        // Client-side navigation does not fire beforeunload, so in-app links are checked before Next.js handles them.
        const warnLink = (e: MouseEvent) => {
            const link = (e.target as Element | null)?.closest?.("a[href]");
            if (!link || link.getAttribute("target") === "_blank" || e.defaultPrevented) return;
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (!window.confirm("You have unsaved changes. Leave this page without saving?")) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener("beforeunload", warnUnload);
        document.addEventListener("click", warnLink, true);
        return () => {
            window.removeEventListener("beforeunload", warnUnload);
            document.removeEventListener("click", warnLink, true);
        };
    }, [dirty]);

    // ---- saving
    async function save(submit: boolean) {
        if (saving || locked) return;
        setSaving(true);
        setStatus(null);
        const result = await saveBusinessProfile(vendorId, toInput(form, photos, submit));
        setSaving(false);

        if (!result.ok) {
            setErrors(result.errors ?? {});
            setStatus({ type: "error", text: result.error });
            // Bring the first problem into view.
            const first = Object.keys(result.errors ?? {})[0];
            if (first) {
                const target = document.getElementById(fieldId(first));
                target?.scrollIntoView({ behavior: "smooth", block: "center" });
                target?.focus({ preventScroll: true });
            }
            return;
        }

        const next = result.profile;
        const nextForm = toForm(next);
        setProfile(next);
        setForm(nextForm);
        setPhotos(next.photos);
        setNextKey(next.facts.length);
        setSaved(fingerprint(nextForm, next.photos));
        setErrors({});
        setStatus({
            type: "success",
            text:
                next.vendor.vendor_status === "pending" && submit
                    ? "Saved and sent for approval. An administrator will review it."
                    : next.vendor.vendor_status === "approved"
                        ? "Saved. Your public page shows the changes now."
                        : "Saved.",
        });
    }

    function discard() {
        if (dirty && !window.confirm("Discard your unsaved changes?")) return;
        const fresh = toForm(profile);
        setForm(fresh);
        setPhotos((ps) => {
            // Keep uploads and removals already saved; restore the order.
            const byId = new Map(ps.map((p) => [p.id, p]));
            return JSON.parse(saved).photo_order.map((id: number) => byId.get(id)).filter(Boolean);
        });
        setErrors({});
        setStatus(null);
    }

    /** After an upload or removal: the server's list becomes the saved order. */
    function photosFromServer(serverPhotos: Photo[]) {
        // A local, unsaved reorder is kept for photos that still exist, with the server's copy of each: a
        // cropped cover keeps its id but gets a new file, and the old one is deleted (KAN-327).
        const byId = new Map(serverPhotos.map((p) => [p.id, p]));
        const kept = photos.flatMap((p) => byId.get(p.id) ?? []);
        const added = serverPhotos.filter((p) => !photos.some((q) => q.id === p.id));
        setPhotos([...kept, ...added]);
        setSaved((s) => JSON.stringify({ ...JSON.parse(s), photo_order: serverPhotos.map((p) => p.id) }));
        refreshPublicPages();
    }

    // ---- progress, as in the design's checklist
    const steps = useMemo(() => {
        const basic =
            form.name.trim().length >= limits.nameMin &&
            form.categories.some(Boolean) &&
            form.location_id !== "" &&
            form.address.trim().length >= 5 &&
            form.phone.trim() !== "" &&
            form.description.trim().length >= limits.descriptionMin &&
            form.description.trim().length <= limits.descriptionMax;
        return [
            { id: "basic", label: "Basic Information", done: basic },
            { id: "images", label: "Images & Logo", done: Boolean(logoUrl) || photos.length > 0 },
            { id: "hours", label: "Opening Hours", done: form.hours.some((h) => h.mode !== "unset") },
            { id: "products", label: "Products / Services", done: profile.listings.total > 0 },
            { id: "additional", label: "Additional Information", done: Boolean(form.email || form.website) || form.facts.some((f) => f.label && f.value) },
            { id: "social", label: "Social Links (Optional)", done: Object.values(form.social).some(Boolean) },
            { id: "preview", label: "Preview & Submit", done: basic && !dirty },
        ];
    }, [form, logoUrl, photos.length, profile.listings.total, dirty, limits]);
    const doneCount = steps.filter((s) => s.done).length;

    // ---- preview values
    const categoryNames = form.categories
        .filter(Boolean)
        .map((id) => options.categories.find((c) => String(c.id) === id)?.name.replace(/ \(general\)$/, ""))
        .filter(Boolean);
    const area = options.areas.find((a) => String(a.id) === form.location_id);
    const today = form.hours[dhakaWeekday()];
    const todayText =
        !today || today.mode === "unset"
            ? null
            : today.mode === "closed"
                ? "Closed today"
                : today.mode === "24h"
                    ? "Open 24 hours today"
                    : today.open && today.close
                        ? `Today ${clock(today.open)} – ${clock(today.close)}`
                        : null;
    const cover = imageSrc(photos[0]?.url ?? null);
    const logo = imageSrc(logoUrl);

    const categoriesByParent = useMemo(() => {
        const groups = new Map<string, { id: number; name: string }[]>();
        for (const c of options.categories) {
            groups.set(c.parent, [...(groups.get(c.parent) ?? []), { id: c.id, name: c.name }]);
        }
        return [...groups.entries()];
    }, [options.categories]);

    const listingsHref = `/vendors/dashboard/listings?vendor=${vendorId}`;

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
                {profile.vendor.vendor_status === "rejected" && (
                    <div role="status" className="rounded-xl bg-error-bg p-4 text-[0.875rem] text-error-ink">
                        <p className="font-semibold">Your business was not approved.</p>
                        {profile.vendor.vendor_rejection_reason && (
                            <p className="mt-1">Reason: {profile.vendor.vendor_rejection_reason}</p>
                        )}
                        <p className="mt-1">Fix the details below, then choose “Save &amp; submit for approval”.</p>
                    </div>
                )}
                {locked && (
                    <div role="status" className="rounded-xl bg-error-bg p-4 text-[0.875rem] text-error-ink">
                        This business is suspended and cannot be edited. Contact support.
                    </div>
                )}

                <fieldset disabled={locked} className="min-w-0 space-y-6">
                    {/* ------------------------------------------------ basic */}
                    <Section id="basic" title="Basic Information">
                        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                            <Field id="f-name" label="Business Name" required error={errors.name} hint="Enter your business name as you want it to appear.">
                                <input
                                    id="f-name"
                                    value={form.name}
                                    maxLength={limits.nameMax}
                                    onChange={(e) => set("name", e.target.value)}
                                    className={`${inputClass} ${borderFor(errors.name)}`}
                                    {...describedBy("f-name", errors.name, true)}
                                />
                            </Field>

                            <Field id="f-category" label="Category" required error={errors.category_ids} hint="Choose the category that best describes your business.">
                                <div className="space-y-2">
                                    {form.categories.map((value, i) => (
                                        <div key={i} className="flex gap-2">
                                            <select
                                                id={i === 0 ? "f-category" : `f-category-${i}`}
                                                aria-label={i === 0 ? undefined : `Additional category ${i}`}
                                                value={value}
                                                onChange={(e) => {
                                                    const next = [...form.categories];
                                                    next[i] = e.target.value;
                                                    set("categories", next);
                                                    setErrors((er) => {
                                                        const rest = { ...er };
                                                        delete rest.category_ids;
                                                        return rest;
                                                    });
                                                }}
                                                className={`${inputClass} ${borderFor(errors.category_ids)}`}
                                                {...(i === 0 ? describedBy("f-category", errors.category_ids, true) : {})}
                                            >
                                                <option value="">{i === 0 ? "Choose a category" : "Choose another category"}</option>
                                                {categoriesByParent.map(([parent, items]) => (
                                                    <optgroup key={parent} label={parent}>
                                                        {items.map((c) => (
                                                            <option
                                                                key={c.id}
                                                                value={c.id}
                                                                disabled={form.categories.some((v, j) => j !== i && v === String(c.id))}
                                                            >
                                                                {c.name}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                            {i > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => set("categories", form.categories.filter((_, j) => j !== i))}
                                                    aria-label={`Remove additional category ${i}`}
                                                    className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-line-strong text-muted hover:text-error-ink"
                                                >
                                                    <Trash2 className="size-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {form.categories.length < limits.categoriesMax && (
                                        <button
                                            type="button"
                                            onClick={() => set("categories", [...form.categories, ""])}
                                            className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-brand-600 hover:underline"
                                        >
                                            <Plus className="size-3.5" /> Also list under another category
                                        </button>
                                    )}
                                </div>
                            </Field>

                            <Field id="f-city" label="City" required>
                                <input id="f-city" value={area?.city ?? "Rajshahi City"} disabled className={`${inputClass} border-line-strong`} />
                            </Field>

                            <Field id="f-area" label="Area / Location" required error={errors.location_id}>
                                <select
                                    id="f-area"
                                    value={form.location_id}
                                    onChange={(e) => set("location_id", e.target.value)}
                                    className={`${inputClass} ${borderFor(errors.location_id)}`}
                                    {...describedBy("f-area", errors.location_id)}
                                >
                                    <option value="">Choose an area</option>
                                    {options.areas.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field id="f-address" label="Full Address" required error={errors.address} hint="Provide a complete address so customers can find you easily.">
                                <input
                                    id="f-address"
                                    value={form.address}
                                    maxLength={limits.addressMax}
                                    onChange={(e) => set("address", e.target.value)}
                                    className={`${inputClass} ${borderFor(errors.address)}`}
                                    {...describedBy("f-address", errors.address, true)}
                                />
                            </Field>

                            {/* One mobile per account: the contact number is the sign-in, so it can't be changed here. */}
                            <Field
                                id="f-phone"
                                label="Contact Mobile Number"
                                hint="The mobile you sign in with, which customers call. It can't be changed here; add another number below."
                            >
                                <input
                                    id="f-phone"
                                    type="tel"
                                    value={form.phone}
                                    readOnly
                                    className={`${inputClass} border-line bg-surface-2 text-muted`}
                                    {...describedBy("f-phone", undefined, true)}
                                />
                            </Field>

                            <Field id="f-name-bn" label="Business Name in Bangla" error={errors.name_bn} hint="Optional. Shown when a visitor reads the site in Bangla.">
                                <input
                                    id="f-name-bn"
                                    lang="bn"
                                    value={form.name_bn}
                                    maxLength={limits.nameMax}
                                    onChange={(e) => set("name_bn", e.target.value)}
                                    className={`${inputClass} ${borderFor(errors.name_bn)} font-bn`}
                                    {...describedBy("f-name-bn", errors.name_bn, true)}
                                />
                            </Field>

                            <Field
                                id="f-alt-phone"
                                label="Second Number"
                                error={errors.alt_phone}
                                hint={ALT_PHONE_HINTS[form.alt_phone_type]}
                            >
                                <div className="flex gap-2">
                                    <select
                                        aria-label="Type of second number"
                                        value={form.alt_phone_type}
                                        onChange={(e) => {
                                            const type = e.target.value as PhoneType;
                                            set("alt_phone_type", type);
                                            const stored = toStoredPhone(form.alt_phone);
                                            if (stored) set("alt_phone", (type === "landline" ? formatLocalPhone : formatPhone)(stored));
                                        }}
                                        className={`${inputClass.replace("w-full", "w-32")} shrink-0`}
                                    >
                                        <option value="landline">Landline</option>
                                        <option value="mobile">Mobile</option>
                                        <option value="whatsapp">WhatsApp</option>
                                    </select>
                                    <input
                                        id="f-alt-phone"
                                        type="tel"
                                        inputMode="tel"
                                        value={form.alt_phone}
                                        placeholder={form.alt_phone_type === "landline" ? "0721-775544" : "+8801812345678"}
                                        onChange={(e) => set("alt_phone", e.target.value)}
                                        onBlur={() => {
                                            // Shown in its type's style once typed: 0721-775544, or +8801812345678.
                                            const stored = toStoredPhone(form.alt_phone);
                                            if (stored) set("alt_phone", (form.alt_phone_type === "landline" ? formatLocalPhone : formatPhone)(stored));
                                        }}
                                        className={`${inputClass} min-w-0 flex-1 ${borderFor(errors.alt_phone)}`}
                                        {...describedBy("f-alt-phone", errors.alt_phone, true)}
                                    />
                                </div>
                            </Field>

                            <Field
                                id="f-description"
                                label="Description"
                                required
                                className="md:col-span-2"
                                error={errors.description}
                                hint="Tell customers about your business, services, and what makes you special."
                                counter={`${form.description.length} / ${limits.descriptionMax}`}
                            >
                                <textarea
                                    id="f-description"
                                    rows={4}
                                    value={form.description}
                                    maxLength={limits.descriptionMax}
                                    onChange={(e) => set("description", e.target.value)}
                                    className={`${inputClass} ${borderFor(errors.description)} h-auto py-2.5 leading-relaxed`}
                                    {...describedBy("f-description", errors.description, true)}
                                />
                            </Field>
                        </div>
                    </Section>

                    {/* ----------------------------------------------- images */}
                    <Section id="images" title="Images & Logo" description="Upload a logo and photos of your business. Good images help you get more attention.">
                        <ImagesSection
                            vendorId={vendorId}
                            logoUrl={logoUrl}
                            photos={photos}
                            photosMax={limits.photosMax}
                            onLogoChange={(url) => {
                                setLogoUrl(url);
                                refreshPublicPages();
                            }}
                            onPhotosReordered={setPhotos}
                            onPhotosFromServer={photosFromServer}
                        />
                    </Section>

                    {/* ------------------------------------------------ hours */}
                    <Section id="hours" title="Opening Hours" description="Set your regular opening hours. You can update them later anytime.">
                        <HoursSection
                            hours={form.hours}
                            errors={errors}
                            onChange={(hours) => {
                                setForm((f) => ({ ...f, hours }));
                                setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith("hours"))));
                            }}
                        />
                    </Section>

                    {/* --------------------------------------------- products */}
                    <Section id="products" title="Products / Services">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[0.875rem] text-muted">
                                {profile.listings.total === 0
                                    ? "Nothing listed yet."
                                    : `${profile.listings.total} listed, ${profile.listings.live} live on your page.`}{" "}
                                Products and services are managed on their own page.
                            </p>
                            <Link
                                href={listingsHref}
                                className="inline-flex items-center gap-2 rounded-[10px] border border-line-strong px-4 py-2.5 text-sm font-medium text-brand-600 hover:border-brand-600 hover:bg-brand-50"
                            >
                                Manage products &amp; services
                            </Link>
                        </div>
                    </Section>

                    {/* ------------------------------------------- additional */}
                    <Section id="additional" title="Additional Information" description="Contact details and facts customers look for, such as when you were established.">
                        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                            <Field id="f-email" label="Email" error={errors.email} hint="Optional.">
                                <input
                                    id="f-email"
                                    type="email"
                                    autoComplete="email"
                                    value={form.email}
                                    maxLength={limits.emailMax}
                                    onChange={(e) => set("email", e.target.value)}
                                    className={`${inputClass} ${borderFor(errors.email)}`}
                                    {...describedBy("f-email", errors.email, true)}
                                />
                            </Field>
                            <Field id="f-website" label="Website" error={errors.website} hint="Optional, e.g. www.yourshop.com.">
                                <input
                                    id="f-website"
                                    inputMode="url"
                                    value={form.website}
                                    maxLength={limits.websiteMax}
                                    onChange={(e) => set("website", e.target.value)}
                                    className={`${inputClass} ${borderFor(errors.website)}`}
                                    {...describedBy("f-website", errors.website, true)}
                                />
                            </Field>
                        </div>

                        <h3 className="mt-6 text-[0.875rem] font-semibold">Business details</h3>
                        <p className="mt-0.5 text-[0.75rem] text-muted">
                            Short facts such as “Established: 2016” or “Parking: On site”. Choose whether each
                            appears beside your description or in the Quick Facts box.
                        </p>
                        {errors.facts && <p className="mt-2 text-[0.75rem] text-error-ink">{errors.facts}</p>}
                        <ul className="mt-3 space-y-3">
                            {form.facts.map((fact, i) => {
                                const labelError = errors[`facts.${i}.label`];
                                const valueError = errors[`facts.${i}.value`];
                                const update = (patch: Partial<FactEntry>) => {
                                    set("facts", form.facts.map((f, j) => (j === i ? { ...f, ...patch } : f)));
                                    setErrors((er) => Object.fromEntries(Object.entries(er).filter(([k]) => !k.startsWith(`facts.${i}.`))));
                                };
                                return (
                                    <li key={fact.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px_44px]">
                                        <div>
                                            <input
                                                id={`f-facts-${i}-label`}
                                                aria-label={`Detail ${i + 1} label`}
                                                placeholder="Label, e.g. Established"
                                                value={fact.label}
                                                maxLength={limits.factLabelMax}
                                                onChange={(e) => update({ label: e.target.value })}
                                                className={`${inputClass} ${borderFor(labelError)}`}
                                            />
                                            {labelError && <p className="mt-1 text-[0.75rem] text-error-ink">{labelError}</p>}
                                        </div>
                                        <div>
                                            <input
                                                id={`f-facts-${i}-value`}
                                                aria-label={`Detail ${i + 1} value`}
                                                placeholder="Value, e.g. 2016"
                                                value={fact.value}
                                                maxLength={limits.factValueMax}
                                                onChange={(e) => update({ value: e.target.value })}
                                                className={`${inputClass} ${borderFor(valueError)}`}
                                            />
                                            {valueError && <p className="mt-1 text-[0.75rem] text-error-ink">{valueError}</p>}
                                        </div>
                                        <select
                                            aria-label={`Detail ${i + 1} placement`}
                                            value={fact.group}
                                            onChange={(e) => update({ group: e.target.value as FactEntry["group"] })}
                                            className={`${inputClass} border-line-strong`}
                                        >
                                            <option value="about">Beside description</option>
                                            <option value="quick">Quick Facts box</option>
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                set("facts", form.facts.filter((_, j) => j !== i));
                                                // Indexes shift, so row errors no longer line up.
                                                setErrors((er) => Object.fromEntries(Object.entries(er).filter(([k]) => !k.startsWith("facts"))));
                                            }}
                                            aria-label={`Remove detail ${i + 1}`}
                                            className="grid size-11 place-items-center rounded-[10px] border border-line-strong text-muted hover:text-error-ink"
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        {form.facts.length < limits.factsMax && (
                            <button
                                type="button"
                                onClick={() => {
                                    set("facts", [...form.facts, { key: nextKey, label: "", value: "", group: "about" }]);
                                    setNextKey((k) => k + 1);
                                }}
                                className="mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-brand-600 hover:underline"
                            >
                                <Plus className="size-3.5" /> Add a detail
                            </button>
                        )}
                        <p className="mt-5 text-[0.75rem] text-muted">
                            Accepted payment methods are set on the{" "}
                            <Link href={`/vendors/dashboard/payment-methods?vendor=${vendorId}`} className="font-medium text-brand-600 hover:underline">
                                Payment Methods
                            </Link>{" "}
                            page.
                        </p>
                    </Section>

                    {/* ----------------------------------------------- social */}
                    <Section id="social" title="Social Links (Optional)" description="Links to your pages. They appear on your profile and help Google recognise your business.">
                        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                            {SOCIAL.map(({ platform, label, Icon, placeholder }) => {
                                const error = errors[`social.${platform}`];
                                const id = `f-social.${platform}`;
                                return (
                                    <Field key={platform} id={id} label={label} error={error}>
                                        <div className="relative">
                                            <Icon size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
                                            <input
                                                id={id}
                                                inputMode="url"
                                                placeholder={placeholder}
                                                value={form.social[platform]}
                                                onChange={(e) => {
                                                    setForm((f) => ({ ...f, social: { ...f.social, [platform]: e.target.value } }));
                                                    setErrors((er) => {
                                                        const rest = { ...er };
                                                        delete rest[`social.${platform}`];
                                                        return rest;
                                                    });
                                                }}
                                                className={`${inputClass} ${borderFor(error)} pl-10`}
                                                {...describedBy(id, error)}
                                            />
                                        </div>
                                    </Field>
                                );
                            })}
                        </div>
                    </Section>
                </fieldset>

                {/* ------------------------------------------------ save bar */}
                <div className="sticky bottom-0 z-30 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-float">
                    {status && (
                        <p
                            role={status.type === "error" ? "alert" : "status"}
                            className={`mb-3 rounded-lg p-2.5 text-[0.8125rem] ${status.type === "error" ? "bg-error-bg text-error-ink" : "bg-success-bg text-success-ink"
                                }`}
                        >
                            {status.text}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="mr-auto text-[0.8125rem] text-muted" aria-live="polite">
                            {dirty ? "Unsaved changes" : "All changes saved"}
                        </span>
                        <button
                            type="button"
                            onClick={discard}
                            disabled={!dirty || saving || locked}
                            className="rounded-[10px] border border-line-strong px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
                        >
                            Discard
                        </button>
                        <button
                            type="button"
                            onClick={() => save(false)}
                            disabled={saving || locked || (!dirty && !canSubmit)}
                            className={`inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${canSubmit
                                    ? "border border-line-strong text-brand-600 hover:bg-brand-50"
                                    : "bg-brand-600 text-white hover:bg-brand-700"
                                }`}
                        >
                            {saving && <Loader2 className="size-4 animate-spin" />}
                            {canSubmit ? "Save as Draft" : "Save changes"}
                        </button>
                        {canSubmit && (
                            <button
                                type="button"
                                onClick={() => save(true)}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-[10px] bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                                {saving && <Loader2 className="size-4 animate-spin" />}
                                Save &amp; submit for approval
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ---------------------------------------- progress + preview */}
            <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
                <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-[1.0625rem] font-semibold">Progress</h2>
                        <span className="text-[0.8125rem] text-muted">
                            {doneCount} of {steps.length} completed
                        </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
                    </div>
                    <ul className="mt-4 space-y-2.5">
                        {steps.map((step) => (
                            <li key={step.id}>
                                <a href={`#${step.id}`} className="flex items-center gap-2.5 text-[0.8125rem] hover:text-brand-600">
                                    {step.done ? (
                                        <CheckCircle2 className="size-4 text-brand-600" aria-label="Done" />
                                    ) : (
                                        <Circle className="size-4 text-line-strong" aria-label="Not done" />
                                    )}
                                    <span className={step.done ? "text-ink" : "text-muted"}>{step.label}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>

                <div id="preview" className="scroll-mt-24 rounded-xl border border-line bg-surface p-5 shadow-card">
                    <h2 className="text-[1.0625rem] font-semibold">Preview</h2>
                    <div className="mt-4 overflow-hidden rounded-lg border border-line">
                        <div className="relative aspect-[16/9] bg-gradient-to-br from-brand-100 to-brand-200">
                            {cover && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={cover} alt="" className="size-full object-cover" />
                            )}
                            {logo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logo} alt="" className="absolute bottom-2 left-2 size-12 rounded-lg border-2 border-surface bg-surface object-contain" />
                            )}
                        </div>
                        <div className="p-3.5">
                            <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold leading-snug">{form.name.trim() || "Your business name"}</p>
                                <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-600">Preview</span>
                            </div>
                            <p className="mt-1 text-[0.8125rem] text-muted">
                                {[categoryNames[0], area?.name].filter(Boolean).join(" • ") || "Category • Area"}
                            </p>
                            {form.phone && (
                                <p className="mt-1.5 flex items-center gap-1.5 text-[0.8125rem]">
                                    <Phone className="size-3.5 text-muted" /> {form.phone}
                                    {form.alt_phone && <span className="text-muted">· {form.alt_phone}</span>}
                                </p>
                            )}
                            {form.address && (
                                <p className="mt-1 flex items-start gap-1.5 text-[0.8125rem] text-muted">
                                    <MapPin className="mt-0.5 size-3.5 shrink-0" /> {form.address}
                                </p>
                            )}
                            {todayText && <p className="mt-1.5 text-[0.8125rem] font-medium text-open-ink">{todayText}</p>}
                            {form.description && (
                                <p className="mt-2 line-clamp-4 text-[0.8125rem] leading-relaxed text-muted">{form.description}</p>
                            )}
                        </div>
                    </div>
                    {vendorStatus === "approved" && (
                        <a
                            href={`/business/${profile.vendor.vendor_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 flex items-center justify-center gap-2 rounded-[10px] border border-line-strong px-4 py-2.5 text-sm font-medium text-brand-600 hover:border-brand-600 hover:bg-brand-50"
                        >
                            View live page <ExternalLink className="size-3.5" />
                        </a>
                    )}
                    <p className="mt-3 text-[0.75rem] text-muted">
                        Your page address stays /business/{profile.vendor.vendor_slug} even if you rename the business, so shared links keep working.
                    </p>
                </div>
            </aside>
        </div>
    );
}

/** Element id of the control for a server error key. */
function fieldId(key: string): string {
    if (key === "category_ids") return "f-category";
    if (key === "location_id") return "f-area";
    if (key === "name_bn") return "f-name-bn";
    if (key.startsWith("hours.")) return `hours-${key.split(".")[1]}-mode`;
    if (key.startsWith("facts.")) {
        const [, i, part] = key.split(".");
        return part ? `f-facts-${i}-${part}` : "additional";
    }
    if (key.startsWith("social.")) return `f-${key}`;
    if (key === "hours") return "hours";
    return `f-${key}`;
}
