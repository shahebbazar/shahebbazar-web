"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { OwnerDetails } from "@/lib/types";
import { saveOwnerDetails } from "../owner-actions";
import { formatPhone } from "@/lib/format";

const INPUT =
    "mt-1.5 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100";

export function SettingsForm({ vendorId, owner }: { vendorId: number; owner: OwnerDetails }) {
    const [name, setName] = useState(owner.user_name);
    const [email, setEmail] = useState(owner.user_email ?? "");
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    function submit(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
            const result = await saveOwnerDetails(vendorId, name, email);
            setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
        });
    }

    return (
        <form onSubmit={submit} className="max-w-lg space-y-4 rounded-xl border border-line bg-surface p-5 shadow-card">
            <label className="block text-sm font-semibold">
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} className={INPUT} />
            </label>
            <label className="block text-sm font-semibold">
                Email <span className="font-normal text-muted">(optional, for message alerts)</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} className={INPUT} />
            </label>
            <div className="text-sm">
                <p className="font-semibold">Phone</p>
                <p className="mt-1 text-muted">{formatPhone(owner.user_phone)}</p>
                <p className="mt-0.5 text-xs text-soft">Your phone number is your sign-in, so it cannot be changed here.</p>
            </div>
            {message && (
                <p role={message.ok ? "status" : "alert"} className={`text-[0.8125rem] ${message.ok ? "text-success-ink" : "text-error-ink"}`}>
                    {message.text}
                </p>
            )}
            <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-[10px] bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
                {pending && <Loader2 className="size-4 animate-spin" />}
                Save changes
            </button>
        </form>
    );
}
