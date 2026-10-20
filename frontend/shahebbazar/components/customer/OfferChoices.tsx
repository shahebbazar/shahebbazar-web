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

    const box = (channel: OfferChannel, label: string, disabled = false) => (
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
        </label>
    );

    return (
        <fieldset className="mt-2 rounded-lg border border-line px-3 py-2 text-[0.8125rem]">
            <legend className="px-1 text-xs font-medium text-muted">Offers from this business</legend>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {box("sms", "SMS")}
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
