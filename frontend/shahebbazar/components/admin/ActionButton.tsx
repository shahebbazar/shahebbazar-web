"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { SendResult } from "@/lib/api";
import { ConfirmDialog } from "./ConfirmDialog";

const TONES = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    danger: "bg-red-600 text-white hover:bg-red-700",
    neutral: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
};

// Button that runs a bound server action and shows its error, if any. With `confirm`, it asks first
// in an in-page dialog.
export function ActionButton({
    action,
    label,
    tone = "neutral",
    confirm,
}: {
    action: () => Promise<SendResult>;
    label: string;
    tone?: keyof typeof TONES;
    confirm?: string;
}) {
    const [error, setError] = useState<string | null>(null);
    const [asking, setAsking] = useState(false);
    const [pending, startTransition] = useTransition();

    function run() {
        setAsking(false);
        setError(null);
        startTransition(async () => {
            const result = await action();
            if (!result.ok) setError(result.error);
        });
    }

    return (
        <span className="inline-flex flex-col">
            <button
                type="button"
                onClick={() => (confirm ? setAsking(true) : run())}
                disabled={pending}
                className={`inline-flex items-center gap-2 rounded-[10px] px-3.5 py-1.5 text-sm font-medium disabled:opacity-50 ${TONES[tone]}`}
            >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {label}
            </button>
            {error && (
                <span role="alert" className="mt-1 text-[0.75rem] text-error-ink">
                    {error}
                </span>
            )}
            {confirm && (
                <ConfirmDialog
                    open={asking}
                    title={`${label}?`}
                    body={confirm}
                    confirmLabel={label}
                    tone={tone === "danger" ? "danger" : "primary"}
                    onConfirm={run}
                    onCancel={() => setAsking(false)}
                />
            )}
        </span>
    );
}
