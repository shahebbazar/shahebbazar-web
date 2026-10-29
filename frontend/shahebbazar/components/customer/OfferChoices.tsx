"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setOfferChannels } from "@/app/(seeker)/actions";
import type { OfferChannel } from "@/lib/types";

// Offer choices for one saved business on the account page (KAN-284). Each change is saved at once.
export function OfferChoices({
    vendorId,
    businessName,
    initial,
    hasEmail,
}: {
    vendorId: number;
    businessName: string;
    initial: OfferChannel[];
    hasEmail: boolean;
}) {
    const [channels, setChannels] = useState<OfferChannel[]>(initial);
    const [error, setError] = useState(false);
    const [pending, startTransition] = useTransition();

    function change(channel: OfferChannel, on: boolean) {
        const previous = channels;
        const next = on ? [...channels, channel] : channels.filter((c) => c !== channel);
        setChannels(next);
        setError(false);
        startTransition(async () => {
            const result = await setOfferChannels(vendorId, next, "account");
            if (result.ok) setChannels(result.data.channels);
            else {
                setChannels(previous);
                setError(true);
            }
        });
    }

    const box = (channel: OfferChannel, label: string, disabled = false, note?: string) => (
        <label className={`inline-flex items-center gap-1.5 ${disabled ? "text-soft" : ""}`}>
            <input
                type="checkbox"
                checked={channels.includes(channel)}
                disabled={pending || disabled}
                onChange={(event) => change(channel, event.target.checked)}
                aria-label={`${label} offers from ${businessName}`}
                className="size-4 accent-brand-600"
            />
            {label}
            {note && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-medium text-muted">{note}</span>}
        </label>
    );

    return (
        <fieldset className="mt-2 rounded-lg border border-line px-3 py-2 text-[0.8125rem]">
            <legend className="px-1 text-xs font-medium text-muted">Offers from this business</legend>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {/* Businesses can't send offers by SMS yet: the choice is kept for when they can. */}
                {box("sms", "SMS", false, "Coming soon")}
                {box("email", "Email", !hasEmail && !channels.includes("email"))}
                {!hasEmail && (
                    <Link href="/account/details#email" className="text-xs font-medium text-brand-600 hover:underline">
                        Add an email address
                    </Link>
                )}
            </div>
            {error && (
                <p role="alert" className="mt-1 text-xs text-error-ink">
                    Could not save your choice. Please try again.
                </p>
            )}
        </fieldset>
    );
}
