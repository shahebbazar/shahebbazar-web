"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Trash2 } from "lucide-react";
import { cancelEvent, deleteEvent } from "./actions";

// Cancel (the page stays up with a notice and people going get a message) or delete (gone, with its
// photos and answers).
export function EventActions({ eventId, vendorId, canCancel, going }: { eventId: number; vendorId: number; canCancel: boolean; going: number }) {
    const router = useRouter();
    const [cancelling, setCancelling] = useState(false);
    const [note, setNote] = useState("");
    const [result, setResult] = useState<{ type: "error" | "success"; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    function cancel() {
        setResult(null);
        startTransition(async () => {
            const res = await cancelEvent(eventId, note);
            if (!res.ok) return setResult({ type: "error", text: res.error });
            const told = res.data.notified;
            setCancelling(false);
            setResult({ type: "success", text: `Event cancelled.${told > 0 ? ` ${told} ${told === 1 ? "person" : "people"} going ${told === 1 ? "was" : "were"} told.` : ""}` });
            router.refresh();
        });
    }

    function remove() {
        if (!window.confirm("Delete this event? Its page, photos and everyone's answers are removed. This can't be undone.")) return;
        setResult(null);
        startTransition(async () => {
            const res = await deleteEvent(eventId);
            if (!res.ok) return setResult({ type: "error", text: res.error });
            router.push(`/vendors/dashboard/events?vendor=${vendorId}&deleted=1`);
        });
    }

    return (
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="text-[1.0625rem] font-semibold">Cancel or delete</h2>
            <p className="mt-1 text-[0.8125rem] text-muted">
                Cancel if the event isn&apos;t happening: its page stays up marked as cancelled, and everyone going gets a message.
                Delete removes it completely.
            </p>

            {cancelling ? (
                <div className="mt-3 space-y-2 rounded-lg border border-line bg-surface-2 p-3">
                    <label className="block text-[0.8125rem] font-medium">
                        Note to the {going} {going === 1 ? "person" : "people"} going <span className="font-normal text-muted">(optional)</span>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            maxLength={1000}
                            placeholder="For example: we'll run it again next month."
                            className="mt-1 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100"
                        />
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={pending}
                            onClick={cancel}
                            className="inline-flex items-center gap-1.5 rounded-[10px] bg-error-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            {pending && <Loader2 className="size-4 animate-spin" />} Cancel the event
                        </button>
                        <button type="button" disabled={pending} onClick={() => setCancelling(false)} className="rounded-[10px] px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface">
                            Keep it
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                    {canCancel && (
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => setCancelling(true)}
                            className="inline-flex items-center gap-1.5 rounded-[10px] border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
                        >
                            <Ban className="size-4" /> Cancel event
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={pending}
                        onClick={remove}
                        className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium text-error-ink hover:bg-error-bg disabled:opacity-50"
                    >
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Delete event
                    </button>
                </div>
            )}

            {result && (
                <p
                    role={result.type === "error" ? "alert" : "status"}
                    className={`mt-3 rounded-lg p-3 text-[0.8125rem] ${result.type === "error" ? "bg-error-bg text-error-ink" : "bg-success-bg text-success-ink"}`}
                >
                    {result.text}
                </p>
            )}
        </section>
    );
}
