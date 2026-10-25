"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { saveMyDetails } from "@/app/(seeker)/actions";
import type { Customer } from "@/lib/types";
import { formatPhone } from "@/lib/format";

const INPUT =
    "mt-1.5 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100 aria-invalid:border-error-ink";

type Area = { id: number; name: string; city: string };

// The customer's own details on /account/details. The phone number is the sign-in, so it is shown, not edited.
export function DetailsForm({ me, areas }: { me: Customer; areas: Area[] }) {
    const [name, setName] = useState(me.user_name);
    const [email, setEmail] = useState(me.user_email ?? "");
    const [area, setArea] = useState(me.location_id ? String(me.location_id) : "");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setMessage(null);
        setErrors({});
        const removingEmail = Boolean(me.user_email) && !email.trim();
        startTransition(async () => {
            const result = await saveMyDetails(name, email, area ? Number(area) : null);
            if (result.ok) {
                setMessage({
                    ok: true,
                    text: removingEmail ? "Saved. Your email address is removed, so offers by email have stopped." : "Saved.",
                });
            } else {
                setErrors(result.errors ?? {});
                setMessage({ ok: false, text: result.error });
            }
        });
    }

    return (
        <form onSubmit={submit} noValidate className="max-w-lg space-y-4 rounded-xl border border-line bg-surface p-5 shadow-card">
            <label className="block text-sm font-semibold">
                Full name
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={120}
                    autoComplete="name"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? "name-error" : undefined}
                    className={INPUT}
                />
                {errors.name && (
                    <span id="name-error" className="mt-1 block text-xs font-normal text-error-ink">
                        {errors.name}
                    </span>
                )}
            </label>

            <label id="email" className="block scroll-mt-24 text-sm font-semibold">
                Email address <span className="font-normal text-muted">(optional)</span>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={255}
                    autoComplete="email"
                    placeholder="name@example.com"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby="email-help"
                    className={INPUT}
                />
                <span id="email-help" className={`mt-1 block text-xs font-normal ${errors.email ? "text-error-ink" : "text-soft"}`}>
                    {errors.email ?? "Needed only if you want offers from businesses by email. Leave it empty to remove it."}
                </span>
            </label>

            <label className="block text-sm font-semibold">
                Your area <span className="font-normal text-muted">(optional)</span>
                <select
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    aria-invalid={Boolean(errors.area)}
                    aria-describedby="area-help"
                    className={INPUT}
                >
                    <option value="">Not shown</option>
                    {areas.map((a) => (
                        <option key={a.id} value={a.id}>
                            {a.name}, {a.city}
                        </option>
                    ))}
                </select>
                <span id="area-help" className={`mt-1 block text-xs font-normal ${errors.area ? "text-error-ink" : "text-soft"}`}>
                    {errors.area ?? "Shown with your name on your reviews, so readers can see you're local."}
                </span>
            </label>

            <div className="text-sm">
                <p className="font-semibold">Mobile number</p>
                <p className="mt-1 text-muted">{formatPhone(me.user_phone)}</p>
                <p className="mt-0.5 text-xs text-soft">This is how you sign in, so it cannot be changed here.</p>
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
