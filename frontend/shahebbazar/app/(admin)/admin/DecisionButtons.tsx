"use client";

import { useId, useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { decide } from "./actions";

const REASON_MIN = 10;
const REASON_MAX = 500;

// Approve, or reject with a reason the owner will see.
export function DecisionButtons({
    kind,
    id,
    label,
}: {
    kind: "vendor" | "listing" | "event";
    id: number;
    label: string;
}) {
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const reasonId = useId();
    const tooShort = reason.trim().length < REASON_MIN;

    function run(decision: "approve" | "reject") {
        setError(null);
        startTransition(async () => {
            const result = await decide(kind, id, decision, reason);
            if (!result.ok) setError(result.error);
        });
    }

    if (rejecting) {
        return (
            <div className="rounded-lg border border-line bg-surface-2 p-3">
                <label htmlFor={reasonId} className="block text-[0.8125rem] font-medium">
                    Why is “{label}” being rejected?
                </label>
                <p className="text-[0.75rem] text-muted">The owner sees this, so say what they need to fix.</p>
                <textarea
                    id={reasonId}
                    rows={3}
                    maxLength={REASON_MAX}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-2 w-full rounded-[10px] border border-line-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100"
                    autoFocus
                />
                <div className="mt-1 flex justify-between text-[0.75rem] text-muted">
                    <span>{tooShort ? `At least ${REASON_MIN} characters` : " "}</span>
                    <span className="tabular-nums">
                        {reason.length} / {REASON_MAX}
                    </span>
                </div>
                {error && (
                    <p role="alert" className="mt-2 text-[0.8125rem] text-error-ink">
                        {error}
                    </p>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                            setRejecting(false);
                            setError(null);
                        }}
                        className="rounded-[10px] border border-line-strong bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={pending || tooShort}
                        onClick={() => run("reject")}
                        className="inline-flex items-center gap-2 rounded-[10px] bg-error-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                        Reject
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={pending}
                    onClick={() => run("approve")}
                    className="inline-flex items-center gap-2 rounded-[10px] bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    {kind === "vendor" ? "Approve & verify" : "Approve"}
                </button>
                <button
                    type="button"
                    disabled={pending}
                    onClick={() => setRejecting(true)}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-error-ink hover:bg-error-bg disabled:opacity-50"
                >
                    <X className="size-4" /> Reject…
                </button>
            </div>
            {error && (
                <p role="alert" className="mt-2 text-[0.8125rem] text-error-ink">
                    {error}
                </p>
            )}
        </div>
    );
}
