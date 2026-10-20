"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

const CONFIRM = {
    danger: "bg-red-600 text-white hover:bg-red-700",
    primary: "bg-brand-600 text-white hover:bg-brand-700",
};

// In-page confirmation for admin actions, in place of the browser's confirm() and prompt() boxes.
// Uses <dialog>, so focus stays inside it and Escape cancels. With `reasonLabel`, it also asks for
// an optional reason.
export function ConfirmDialog({
    open,
    title,
    body,
    confirmLabel,
    tone = "danger",
    reasonLabel,
    onConfirm,
    onCancel,
}: {
    open: boolean;
    title: string;
    body?: string;
    confirmLabel: string;
    tone?: keyof typeof CONFIRM;
    reasonLabel?: string;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const bodyId = useId();
    const [reason, setReason] = useState("");

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) {
            setReason("");
            dialog.showModal();
        } else if (!open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    return (
        <dialog
            ref={ref}
            aria-labelledby={titleId}
            aria-describedby={body ? bodyId : undefined}
            onCancel={(event) => {
                event.preventDefault();
                onCancel();
            }}
            onClick={(event) => {
                // A click on the backdrop (the dialog element itself, outside its panel) cancels.
                if (event.target === ref.current) onCancel();
            }}
            className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
        >
            <form
                method="dialog"
                className="p-5"
                onSubmit={(event) => {
                    event.preventDefault();
                    onConfirm(reason.trim());
                }}
            >
                <div className="flex gap-3">
                    {tone === "danger" && (
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-error-bg text-error-ink">
                            <AlertTriangle className="size-4" />
                        </span>
                    )}
                    <div className="min-w-0">
                        <h2 id={titleId} className="text-[1.0625rem] font-semibold">
                            {title}
                        </h2>
                        {body && (
                            <p id={bodyId} className="mt-1 text-sm text-muted">
                                {body}
                            </p>
                        )}
                    </div>
                </div>

                {reasonLabel && (
                    <label className="mt-4 block text-[0.8125rem] font-semibold">
                        {reasonLabel} <span className="font-normal text-muted">(optional)</span>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            maxLength={500}
                            className="mt-1.5 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100"
                        />
                    </label>
                )}

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        autoFocus
                        className="rounded-[10px] border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2"
                    >
                        Cancel
                    </button>
                    <button type="submit" className={`rounded-[10px] px-3.5 py-2 text-sm font-semibold ${CONFIRM[tone]}`}>
                        {confirmLabel}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
