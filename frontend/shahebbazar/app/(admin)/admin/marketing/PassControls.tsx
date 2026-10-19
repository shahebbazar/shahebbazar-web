"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { AdminMarketing, MarketingPassRow } from "@/lib/types";
import { activatePass, changePass, type PassAction } from "./actions";

const INPUT =
    "mt-1 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100";
const BUTTON = "inline-flex items-center gap-2 rounded-[10px] px-3.5 py-1.5 text-sm font-medium disabled:opacity-50";
const NEUTRAL = `${BUTTON} border border-line-strong bg-surface text-ink hover:bg-surface-2`;
const DANGER = `${BUTTON} border border-line-strong bg-surface text-error-ink hover:bg-error-bg`;

const price = (value: string) => `BDT ${Number(value).toLocaleString("en-US")}`;

// Form to give an approved business a pass that starts now.
export function ActivatePass({ packages, businesses }: Pick<AdminMarketing, "packages" | "businesses">) {
    const available = businesses.filter((b) => !b.has_active_pass);
    const [vendorId, setVendorId] = useState("");
    const [packageId, setPackageId] = useState(String(packages.find((p) => p.package_duration_days === 30)?.package_id ?? ""));
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    function submit(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
            const result = await activatePass(Number(vendorId), Number(packageId));
            if (!result.ok) return setMessage({ ok: false, text: result.error });
            const name = available.find((b) => String(b.vendor_id) === vendorId)?.vendor_name ?? "The business";
            setMessage({ ok: true, text: `${name} now has a pass and appears as Sponsored.` });
            setVendorId("");
        });
    }

    return (
        <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="text-[1.0625rem] font-semibold">Give a business a pass</h2>
            <p className="mt-1 text-[0.8125rem] text-muted">
                Starts now. Until online payment is added, record the payment reference in your own records.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                <label className="text-[0.8125rem] font-semibold">
                    Business
                    <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required className={INPUT}>
                        <option value="">Choose an approved business</option>
                        {available.map((b) => (
                            <option key={b.vendor_id} value={b.vendor_id}>
                                {b.vendor_name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-[0.8125rem] font-semibold">
                    Pass
                    <select value={packageId} onChange={(e) => setPackageId(e.target.value)} required className={INPUT}>
                        {packages.filter((p) => p.package_is_active).map((p) => (
                            <option key={p.package_id} value={p.package_id}>
                                {p.package_duration_days} days · {price(p.package_price_bdt)}
                            </option>
                        ))}
                    </select>
                </label>
                <button type="submit" disabled={pending || !vendorId} className={`${BUTTON} justify-center bg-brand-600 py-2 text-white hover:bg-brand-700`}>
                    {pending && <Loader2 className="size-4 animate-spin" />}
                    Activate pass
                </button>
            </div>
            {message && (
                <p role={message.ok ? "status" : "alert"} className={`mt-3 text-sm ${message.ok ? "text-success-ink" : "text-error-ink"}`}>
                    {message.text}
                </p>
            )}
        </form>
    );
}

// The actions available for one pass, depending on its status.
export function PassActions({ pass }: { pass: MarketingPassRow }) {
    const [endDate, setEndDate] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const status = pass.effective_status;

    function run(action: PassAction, body: Parameters<typeof changePass>[2] = {}, confirmText?: string) {
        if (confirmText && !window.confirm(confirmText)) return;
        setError(null);
        startTransition(async () => {
            const result = await changePass(pass.subscription_id, action, body);
            if (!result.ok) setError(result.error);
        });
    }

    function withReason(action: "suspend" | "cancel", question: string) {
        const reason = window.prompt(question);
        if (reason === null) return;
        run(action, { reason });
    }

    if (status === "expired" || status === "cancelled") return null;

    return (
        <div className="mt-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-end gap-2">
                {status === "active" && (
                    <>
                        <button type="button" disabled={pending} onClick={() => run("extend", { days: 7 })} className={NEUTRAL}>
                            Extend 7 days
                        </button>
                        <button type="button" disabled={pending} onClick={() => run("extend", { days: 30 })} className={NEUTRAL}>
                            Extend 30 days
                        </button>
                        <span className="inline-flex items-end gap-1.5">
                            <label className="text-[0.75rem] font-semibold">
                                New end date
                                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${INPUT} py-1.5`} />
                            </label>
                            <button
                                type="button"
                                disabled={pending || !endDate}
                                // End of the chosen day in Dhaka.
                                onClick={() => run("end-date", { ends_at: `${endDate}T23:59:59+06:00` })}
                                className={NEUTRAL}
                            >
                                Set
                            </button>
                        </span>
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => run("end-now", {}, `End ${pass.vendor_name}'s pass now? Sponsored placement stops immediately.`)}
                            className={NEUTRAL}
                        >
                            End now
                        </button>
                        <button type="button" disabled={pending} onClick={() => withReason("suspend", "Why is this pass being suspended? (optional)")} className={NEUTRAL}>
                            Suspend
                        </button>
                    </>
                )}
                {status === "suspended" && (
                    <button type="button" disabled={pending} onClick={() => run("resume")} className={NEUTRAL}>
                        Resume
                    </button>
                )}
                <button type="button" disabled={pending} onClick={() => withReason("cancel", "Why is this pass being cancelled? (optional)")} className={DANGER}>
                    Cancel pass
                </button>
                {pending && <Loader2 className="size-4 animate-spin text-muted" />}
            </div>
            {error && (
                <p role="alert" className="mt-2 text-[0.8125rem] text-error-ink">
                    {error}
                </p>
            )}
        </div>
    );
}
