"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Star, Loader2, Users } from "lucide-react";
import { BROWSER_API_BASE } from "@/lib/apiBase";
import { fill, type Locale } from "@/lib/i18n";
import { localiseDigits } from "@/lib/format";
import type { EventResponse, EventResponseState } from "@/lib/types";

// Interested / Going on an event's page (KAN-298), with how many have answered. Tapping the chosen
// answer again takes it back. Signed-out visitors get a link to log in and come back.
export function EventResponseButtons({
    eventId,
    initial,
    counts,
    loginHref,
    closed,
    locale,
    words,
}: {
    eventId: number;
    /** The viewer's answer and the counts, or null when signed out. */
    initial: EventResponseState | null;
    /** The counts from the public page, for signed-out visitors. */
    counts: { going_count: number; interested_count: number };
    loginHref: string;
    /** Cancelled or over: answers can only be taken back. */
    closed: boolean;
    locale: Locale;
    words: { interested: string; going: string; signIn: string; error: string; goingCount: string; interestedCount: string };
}) {
    const [state, setState] = useState(initial);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const shown = state ?? counts;

    const tally = (
        <p className="flex items-center gap-2 text-[0.9375rem] text-muted">
            <Users className="size-4 shrink-0" />
            {localiseDigits(fill(words.goingCount, { n: String(shown.going_count) }), locale)} ·{" "}
            {localiseDigits(fill(words.interestedCount, { n: String(shown.interested_count) }), locale)}
        </p>
    );

    if (!state) {
        if (closed) return tally;
        return (
            <div className="space-y-3">
                {tally}
                <Link
                    href={loginHref}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
                >
                    <Star className="size-4" /> {words.signIn}
                </Link>
            </div>
        );
    }

    function choose(response: EventResponse) {
        const next = state?.response === response ? null : response;
        setError(null);
        startTransition(async () => {
            try {
                const res = await fetch(`${BROWSER_API_BASE}/api/events/${eventId}/response`, {
                    method: "PUT",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ response: next }),
                });
                const body = await res.json().catch(() => null);
                if (!res.ok) return setError(body?.error ?? words.error);
                setState(body);
            } catch {
                setError(words.error);
            }
        });
    }

    const button = (response: EventResponse, label: string, Icon: typeof Star) => {
        const active = state.response === response;
        return (
            <button
                type="button"
                onClick={() => choose(response)}
                disabled={pending || (closed && !active)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-[10px] border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                    active ? "border-brand-600 bg-brand-600 text-white hover:bg-brand-700" : "border-line-strong bg-surface text-ink hover:bg-surface-2"
                }`}
            >
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                {label}
            </button>
        );
    };

    return (
        <div className="space-y-3">
            {tally}
            <div className="flex flex-wrap gap-2">
                {button("interested", words.interested, Star)}
                {button("going", words.going, Check)}
            </div>
            {error && (
                <p role="alert" className="mt-2 text-[0.8125rem] text-error-ink">
                    {error}
                </p>
            )}
        </div>
    );
}
