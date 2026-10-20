"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { getSavedIds, setSaved } from "@/app/(seeker)/actions";
import { OffersPrompt } from "@/components/customer/OffersPrompt";
import type { Locale } from "@/lib/i18n";

let savedIds: Promise<Set<number>> | null = null;

// Loads the saved ids once and shares them between every button on the page.
function loadSavedIds(): Promise<Set<number>> {
    savedIds ??= getSavedIds().then((ids) => new Set(ids));
    return savedIds;
}

export function SaveButton({
    vendorId,
    label,
    savedLabel,
    variant = "button",
    businessName,
    locale = "en",
}: {
    vendorId: number;
    label: string;
    savedLabel: string;
    variant?: "button" | "icon";
    // When given, saving offers the optional "Get offers" choice (KAN-284).
    businessName?: string;
    locale?: Locale;
}) {
    const [saved, setSavedState] = useState(false);
    const [askOffers, setAskOffers] = useState(false);
    const [pending, startTransition] = useTransition();
    const closeOffers = useCallback(() => setAskOffers(false), []);

    useEffect(() => {
        let active = true;
        loadSavedIds().then((ids) => active && setSavedState(ids.has(vendorId)));
        return () => {
            active = false;
        };
    }, [vendorId]);

    function toggle() {
        const next = !saved;
        setSavedState(next);
        startTransition(async () => {
            const result = await setSaved(vendorId, next);
            const ids = await loadSavedIds();
            if (!result.ok) setSavedState(!next);
            else if (next) {
                ids.add(vendorId);
                if (businessName) setAskOffers(true);
            } else {
                ids.delete(vendorId);
                setAskOffers(false);
            }
        });
    }

    const offers = askOffers && businessName && (
        <OffersPrompt vendorId={vendorId} businessName={businessName} locale={locale} onClose={closeOffers} />
    );

    const icon = <Bookmark className={`size-4 ${saved ? "fill-brand-600 text-brand-600" : ""}`} />;

    if (variant === "icon") {
        return (
            <>
            <button
                type="button"
                onClick={toggle}
                disabled={pending}
                aria-pressed={saved}
                aria-label={saved ? savedLabel : label}
                title={saved ? savedLabel : label}
                className="absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-lg bg-white/90 text-muted backdrop-blur transition-colors hover:text-brand-600"
            >
                {icon}
            </button>
            {offers}
            </>
        );
    }

    return (
        <>
        <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={saved}
            className={`inline-flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-sm font-medium transition-colors ${
                saved
                    ? "border-brand-600 bg-brand-50 text-brand-600"
                    : "border-line-strong bg-surface text-ink hover:border-brand-600 hover:text-brand-600"
            }`}
        >
            {icon}
            {saved ? savedLabel : label}
        </button>
        {offers}
        </>
    );
}
