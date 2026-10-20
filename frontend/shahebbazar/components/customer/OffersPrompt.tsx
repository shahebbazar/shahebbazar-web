"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import { getOfferContext, setOfferChannels } from "@/app/(seeker)/actions";
import { fill, t, type Locale } from "@/lib/i18n";
import type { OfferChannel } from "@/lib/types";

// Shown after a customer saves a business: an optional, unticked choice to get its offers (KAN-284).
// Saving alone never gives consent; only "Get offers" with a channel ticked does.
export function OffersPrompt({
    vendorId,
    businessName,
    locale,
    onClose,
}: {
    vendorId: number;
    businessName: string;
    locale: Locale;
    onClose: () => void;
}) {
    const copy = t(locale);
    const titleId = useId();
    const firstBox = useRef<HTMLInputElement>(null);
    const [hasEmail, setHasEmail] = useState<boolean | null>(null);
    const [channels, setChannels] = useState<OfferChannel[]>([]);
    const [status, setStatus] = useState<"idle" | "done" | "error">("idle");
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        let active = true;
        getOfferContext().then((context) => active && setHasEmail(context.hasEmail));
        firstBox.current?.focus();
        const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => {
            active = false;
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    useEffect(() => {
        if (status !== "done") return;
        const timer = setTimeout(onClose, 2500);
        return () => clearTimeout(timer);
    }, [status, onClose]);

    function toggle(channel: OfferChannel, on: boolean) {
        setChannels((current) => (on ? [...current, channel] : current.filter((c) => c !== channel)));
    }

    function submit() {
        startTransition(async () => {
            const result = await setOfferChannels(vendorId, channels, "save_prompt");
            setStatus(result.ok ? "done" : "error");
        });
    }

    return createPortal(
        <div
            role="dialog"
            aria-labelledby={titleId}
            className="fixed inset-x-4 bottom-4 z-50 rounded-xl border border-line bg-surface p-4 text-ink shadow-float sm:left-auto sm:w-96"
        >
            <button
                type="button"
                onClick={onClose}
                aria-label={copy.cancel}
                className="absolute top-3 right-3 text-soft hover:text-ink"
            >
                <X className="size-4" />
            </button>

            {status === "done" ? (
                <p role="status" className="pr-6 text-sm">
                    {copy.offersDone}
                </p>
            ) : (
                <>
                    <h2 id={titleId} className="pr-6 text-[0.9375rem] font-semibold">
                        {fill(copy.offersTitle, { name: businessName })}
                    </h2>
                    <p className="mt-1 text-[0.8125rem] text-muted">{copy.offersBody}</p>

                    <fieldset className="mt-3 space-y-2 text-sm">
                        <label className="flex items-center gap-2">
                            <input
                                ref={firstBox}
                                type="checkbox"
                                checked={channels.includes("sms")}
                                onChange={(event) => toggle("sms", event.target.checked)}
                                className="size-4 accent-brand-600"
                            />
                            {copy.offersSms}
                        </label>
                        <label className={`flex items-center gap-2 ${hasEmail === false ? "text-soft" : ""}`}>
                            <input
                                type="checkbox"
                                disabled={hasEmail !== true}
                                checked={channels.includes("email")}
                                onChange={(event) => toggle("email", event.target.checked)}
                                className="size-4 accent-brand-600"
                            />
                            {copy.offersEmail}
                        </label>
                        {hasEmail === false && (
                            <p className="text-xs text-soft">
                                {copy.offersNoEmail}{" "}
                                <Link href="/account/details#email" className="font-medium text-brand-600 hover:underline">
                                    {copy.offersAddEmail}
                                </Link>
                            </p>
                        )}
                    </fieldset>

                    {status === "error" && (
                        <p role="alert" className="mt-2 text-xs text-error-ink">
                            {copy.offersError}
                        </p>
                    )}

                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-[10px] px-3 py-2 text-sm font-medium text-muted hover:text-ink"
                        >
                            {copy.offersSkip}
                        </button>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={pending || channels.length === 0}
                            className="rounded-[10px] bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                            {copy.offersSave}
                        </button>
                    </div>
                </>
            )}
        </div>,
        document.body
    );
}
