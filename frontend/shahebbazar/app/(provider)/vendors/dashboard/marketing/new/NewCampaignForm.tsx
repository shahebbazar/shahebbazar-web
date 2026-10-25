"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { browserAssetUrl } from "@/lib/apiBase";
import { formatEventWhen } from "@/lib/format";
import type { PromotableListing, VendorEvent } from "@/lib/types";
import { createCampaign } from "../actions";
import { CTAS, GOALS } from "../labels";

const INPUT =
    "mt-1.5 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100";

const price = (l: PromotableListing) => {
    if (l.listing_price === null) return "No price";
    const taka = (v: string) => `৳${Number(v).toLocaleString("en-US")}`;
    const range = l.listing_price_max && Number(l.listing_price_max) > Number(l.listing_price) ? `${taka(l.listing_price)}–${taka(l.listing_price_max)}` : taka(l.listing_price);
    return l.listing_price_unit ? `${range} / ${l.listing_price_unit}` : range;
};

/** A short code from the first chosen product, for example KHIRSAPAT25. */
function suggestCode(productTitle?: string) {
    const word = (productTitle ?? "OFFER").toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(" ")[0].slice(0, 10) || "OFFER";
    return `${word}${10 + Math.floor(Math.random() * 90)}`;
}

// The one free-text box means something different for each goal.
const DETAIL: Record<string, { label: string; note: string; placeholder: string }> = {
    new_stock: { label: "Anything to add?", note: "optional", placeholder: "For example: this season's first harvest" },
    offer: { label: "Your offer", note: "in your own words", placeholder: "For example: 10% off all mangoes this week" },
    event: { label: "What's the event?", note: "in your own words", placeholder: "For example: our Eid mango fair" },
    reminder: { label: "Anything to add?", note: "optional", placeholder: "For example: open late every Friday" },
};

// The campaign brief on one page. Business details come from the profile, so nothing is typed twice.
export function NewCampaignForm({
    vendorId,
    listings,
    maxListings,
    events,
}: {
    vendorId: number;
    listings: PromotableListing[];
    maxListings: number;
    /** The business's live, upcoming events (KAN-298). */
    events: VendorEvent[];
}) {
    const router = useRouter();
    const [goal, setGoal] = useState("new_stock");
    // The event this campaign is about; null for one described in the owner's own words.
    const [eventId, setEventId] = useState<number | null>(events[0]?.event_id ?? null);
    const linkedEvent = goal === "event" ? events.find((e) => e.event_id === eventId) ?? null : null;
    const [chosen, setChosen] = useState<number[]>(listings.length === 1 ? [listings[0].listing_id] : []);
    const [coupon, setCoupon] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function toggle(id: number, on: boolean) {
        setChosen((current) => (on ? [...current, id] : current.filter((x) => x !== id)));
    }

    function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const text = (name: string) => String(form.get(name) ?? "");
        setErrors({});
        setError(null);
        startTransition(async () => {
            const result = await createCampaign(vendorId, {
                title: text("title"),
                goal,
                language: text("language"),
                call_to_action: text("call_to_action"),
                offer: text("offer"),
                starts_on: linkedEvent ? "" : text("starts_on"),
                ends_on: linkedEvent ? "" : text("ends_on"),
                listing_ids: chosen,
                coupon_code: goal === "offer" ? coupon : "",
                event_id: linkedEvent?.event_id ?? null,
            });
            if (result.ok) {
                router.push(`/vendors/dashboard/marketing/${result.data.campaign_id}?vendor=${vendorId}`);
            } else {
                setErrors(result.errors ?? {});
                setError(result.error);
            }
        });
    }

    const fieldError = (key: string) =>
        errors[key] && (
            <span role="alert" className="mt-1 block text-xs font-normal text-error-ink">
                {errors[key]}
            </span>
        );

    return (
        <form onSubmit={submit} noValidate className="mt-6 max-w-3xl space-y-6">
            <fieldset className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <legend className="px-1 font-semibold">1. What is it for?</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {GOALS.map((g) => (
                        <label
                            key={g.value}
                            className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${goal === g.value ? "border-brand-600 bg-brand-50" : "border-line hover:border-brand-200"}`}
                        >
                            <input
                                type="radio"
                                name="goal"
                                value={g.value}
                                checked={goal === g.value}
                                onChange={() => setGoal(g.value)}
                                className="mt-0.5 accent-brand-600"
                            />
                            <span>
                                <span className="block font-medium">{g.label}</span>
                                <span className="block text-xs text-muted">{g.hint}</span>
                            </span>
                        </label>
                    ))}
                </div>
                {fieldError("goal")}
                {goal === "event" && (
                    <div className="mt-4 border-t border-line pt-4">
                        <p className="text-sm font-semibold">Which event?</p>
                        {events.length === 0 ? (
                            <p className="mt-1 text-xs text-muted">
                                You have no upcoming events. Add one under{" "}
                                <a href={`/vendors/dashboard/events/new?vendor=${vendorId}`} className="font-medium text-brand-600 hover:underline">
                                    Events
                                </a>{" "}
                                and its photo, time and place are filled in for you, or describe it below.
                            </p>
                        ) : (
                            <p className="mt-1 text-xs text-muted">
                                Its name, time, place and photo are filled in, and every link goes to the event&apos;s page.
                            </p>
                        )}
                        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                            {events.map((e) => {
                                const photo = browserAssetUrl(e.event_image_url);
                                const on = eventId === e.event_id;
                                return (
                                    <li key={e.event_id}>
                                        <label
                                            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm ${on ? "border-brand-600 bg-brand-50" : "border-line hover:border-brand-200"}`}
                                        >
                                            <input
                                                type="radio"
                                                name="event_id"
                                                checked={on}
                                                onChange={() => setEventId(e.event_id)}
                                                className="accent-brand-600"
                                            />
                                            {photo ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={photo} alt="" className="size-10 shrink-0 rounded-md object-cover" />
                                            ) : (
                                                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-50 text-xs text-brand-600">—</span>
                                            )}
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium">{e.event_title}</span>
                                                <span className="block text-xs text-muted">{formatEventWhen(e.event_starts_at, e.event_ends_at)}</span>
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                            {events.length > 0 && (
                                <li>
                                    <label
                                        className={`flex h-full cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm ${eventId === null ? "border-brand-600 bg-brand-50" : "border-line hover:border-brand-200"}`}
                                    >
                                        <input type="radio" name="event_id" checked={eventId === null} onChange={() => setEventId(null)} className="accent-brand-600" />
                                        <span className="font-medium">Not listed on the Events page: describe it below</span>
                                    </label>
                                </li>
                            )}
                        </ul>
                        {events.length > 0 && eventId === null && (
                            <p className="mt-2 text-xs text-muted">
                                This only writes the campaign; it doesn&apos;t add an event. To list it on the Events page, so customers can
                                say they&apos;re going and add it to their calendar, add it under{" "}
                                <a href={`/vendors/dashboard/events/new?vendor=${vendorId}`} className="font-medium text-brand-600 hover:underline">
                                    Events
                                </a>{" "}
                                first, then choose it here.
                            </p>
                        )}
                        {fieldError("event_id")}
                    </div>
                )}
            </fieldset>

            <fieldset className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <legend className="px-1 font-semibold">2. Which products or services?</legend>
                <p className="text-xs text-muted">
                    {linkedEvent
                        ? `Optional for an event: choose up to ${maxListings} to feature. Their names, prices and photos are copied in as they are now.`
                        : `Choose up to ${maxListings}. Their names, prices and photos are copied in as they are now.`}
                </p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {listings.map((l) => {
                        const photo = browserAssetUrl(l.photo_url);
                        const on = chosen.includes(l.listing_id);
                        return (
                            <li key={l.listing_id}>
                                <label
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm ${on ? "border-brand-600 bg-brand-50" : "border-line hover:border-brand-200"}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={on}
                                        disabled={!on && chosen.length >= maxListings}
                                        onChange={(e) => toggle(l.listing_id, e.target.checked)}
                                        className="size-4 accent-brand-600"
                                    />
                                    {photo ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={photo} alt="" className="size-10 shrink-0 rounded-md object-cover" />
                                    ) : (
                                        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-50 text-xs text-brand-600">—</span>
                                    )}
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium">{l.listing_title}</span>
                                        <span className="block text-xs text-muted">{price(l)}</span>
                                    </span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
                {fieldError("listing_ids")}
            </fieldset>

            <fieldset className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <legend className="px-1 font-semibold">3. Details</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold sm:col-span-2">
                        {linkedEvent ? "Anything to add?" : DETAIL[goal].label}{" "}
                        <span className="font-normal text-muted">({linkedEvent ? "optional" : DETAIL[goal].note})</span>
                        <input
                            name="offer"
                            maxLength={200}
                            placeholder={linkedEvent ? "For example: free tasting for the first 50 visitors" : DETAIL[goal].placeholder}
                            className={INPUT}
                        />
                        {fieldError("offer")}
                    </label>
                    {goal === "offer" && (
                        <div className="sm:col-span-2">
                            <label htmlFor="coupon_code" className="block text-sm font-semibold">
                                Coupon code <span className="font-normal text-muted">(optional: customers show it when they visit or order; it works until the offer&apos;s last day)</span>
                            </label>
                            <div className="mt-1.5 flex gap-2">
                                <input
                                    id="coupon_code"
                                    name="coupon_code"
                                    value={coupon}
                                    onChange={(e) => setCoupon(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                                    maxLength={20}
                                    placeholder="For example: MANGO10"
                                    className={`${INPUT} mt-0 uppercase`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setCoupon(suggestCode(listings.find((l) => l.listing_id === chosen[0])?.listing_title))}
                                    className="shrink-0 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2"
                                >
                                    Make one for me
                                </button>
                            </div>
                            {fieldError("coupon_code")}
                        </div>
                    )}
                    {linkedEvent ? (
                        <p className="text-sm text-muted sm:col-span-2">
                            <span className="font-semibold text-ink">When:</span> {formatEventWhen(linkedEvent.event_starts_at, linkedEvent.event_ends_at)}, from
                            the event.
                        </p>
                    ) : (
                        <>
                            <label className="block text-sm font-semibold">
                                {goal === "event" ? "Date" : "Starts"}{" "}
                                <span className="font-normal text-muted">({goal === "event" ? "needed for an event" : "optional"})</span>
                                <input type="date" name="starts_on" className={INPUT} />
                                {fieldError("starts_on")}
                            </label>
                            <label className="block text-sm font-semibold">
                                {goal === "event" ? "Last day" : "Ends"}{" "}
                                <span className="font-normal text-muted">({goal === "offer" && coupon ? "needed: the coupon ends after this day" : "optional"})</span>
                                <input type="date" name="ends_on" required={goal === "offer" && coupon !== ""} className={INPUT} />
                                {fieldError("ends_on")}
                            </label>
                        </>
                    )}
                    <label className="block text-sm font-semibold">
                        What should customers do?
                        <select name="call_to_action" defaultValue="visit" className={INPUT}>
                            {CTAS.map((c) => (
                                <option key={c.value} value={c.value}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                        {fieldError("call_to_action")}
                    </label>
                    <fieldset className="text-sm">
                        <legend className="font-semibold">Language</legend>
                        <div className="mt-2.5 flex gap-4">
                            <label className="inline-flex items-center gap-1.5">
                                <input type="radio" name="language" value="en" defaultChecked className="accent-brand-600" /> English
                            </label>
                            <label className="inline-flex items-center gap-1.5">
                                <input type="radio" name="language" value="bn" className="accent-brand-600" /> বাংলা
                            </label>
                        </div>
                    </fieldset>
                    <label className="block text-sm font-semibold sm:col-span-2">
                        Campaign name <span className="font-normal text-muted">(optional, only you see it)</span>
                        <input name="title" maxLength={120} className={INPUT} />
                        {fieldError("title")}
                    </label>
                </div>
            </fieldset>

            {error && (
                <p role="alert" className="text-sm text-error-ink">
                    {error}
                </p>
            )}
            <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-[10px] bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
                {pending && <Loader2 className="size-4 animate-spin" />}
                Write the drafts
            </button>
        </form>
    );
}
