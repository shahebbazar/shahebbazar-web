"use client";

import { useState, useTransition } from "react";
import { Loader2, UserMinus } from "lucide-react";
import type { BusinessMember } from "@/lib/types";
import { addManager, removeManager } from "../owner-actions";
import { formatPhone } from "@/lib/format";

const INPUT =
    "w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100";

// People who help run this business (KAN-252). Only the owner can change the list.
export function TeamSection({
    vendorId,
    members: initial,
    isOwner,
}: {
    vendorId: number;
    members: BusinessMember[];
    isOwner: boolean;
}) {
    const [members, setMembers] = useState(initial);
    const [phone, setPhone] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function run(action: () => Promise<{ ok: true; data: BusinessMember[] } | { ok: false; error: string }>) {
        setError(null);
        startTransition(async () => {
            const result = await action();
            if (result.ok) {
                setMembers(result.data);
                setPhone("");
            } else {
                setError(result.error);
            }
        });
    }

    return (
        <section className="mt-6 max-w-lg rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="text-base font-semibold">Team</h2>
            <p className="mt-1 text-sm text-muted">
                People who can manage this business. Managers can do everything except change this list.
            </p>

            <ul className="mt-4 divide-y divide-line">
                {members.map((m) => (
                    <li key={m.user_id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{m.user_name}</p>
                            <p className="text-xs text-muted">{formatPhone(m.user_phone)}</p>
                        </div>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.75rem] capitalize text-muted">
                            {m.member_role}
                        </span>
                        {isOwner && m.member_role === "manager" && (
                            <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => removeManager(vendorId, m.user_id))}
                                aria-label={`Remove ${m.user_name}`}
                                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-error-ink disabled:opacity-50"
                            >
                                <UserMinus className="size-4" />
                            </button>
                        )}
                    </li>
                ))}
            </ul>

            {isOwner && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        run(() => addManager(vendorId, phone));
                    }}
                    className="mt-4 flex flex-col gap-2 sm:flex-row"
                >
                    <label className="sr-only" htmlFor="manager-phone">Manager&apos;s phone number</label>
                    <input
                        id="manager-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Phone number of their Shahebbazar account"
                        required
                        className={INPUT}
                    />
                    <button
                        type="submit"
                        disabled={pending}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                        {pending && <Loader2 className="size-4 animate-spin" />}
                        Add manager
                    </button>
                </form>
            )}

            {error && (
                <p role="alert" className="mt-2 text-[0.8125rem] text-error-ink">
                    {error}
                </p>
            )}
        </section>
    );
}
