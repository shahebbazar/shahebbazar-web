import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";
import { AccountShell } from "@/components/customer/AccountShell";
import { DetailsForm } from "@/components/customer/DetailsForm";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { Customer } from "@/lib/types";

export const metadata: Metadata = {
    title: "My details",
};

export default async function DetailsPage() {
    const me = await authenticatedApiGet<Customer>("/me");

    if (!me) {
        return (
            <AccountShell current="details" title="My details">
                <p className="text-sm text-muted">No customer account exists yet.</p>
            </AccountShell>
        );
    }

    // What the account has, and what is still missing.
    const checklist = [
        { done: Boolean(me.user_name), label: "Full name", note: "Shown to a business when you message it" },
        { done: true, label: "Mobile number, verified", note: "Used to sign in" },
        {
            done: Boolean(me.user_email),
            label: "Email address (optional)",
            note: me.user_email ? "Businesses you allow can send you offers by email" : "Add one to get offers from businesses by email",
        },
    ];

    return (
        <AccountShell current="details" title="My details">
            <ul className="mb-5 max-w-lg space-y-2 rounded-xl border border-line bg-surface p-4 text-sm shadow-card">
                {checklist.map(({ done, label, note }) => (
                    <li key={label} className="flex items-start gap-2.5">
                        {done ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden />
                        ) : (
                            <Circle className="mt-0.5 size-4 shrink-0 text-soft" aria-hidden />
                        )}
                        <span>
                            <span className="font-medium">{label}</span>
                            <span className="sr-only">{done ? ": done" : ": not added yet"}</span>
                            <span className="block text-xs text-muted">{note}</span>
                        </span>
                    </li>
                ))}
            </ul>

            <DetailsForm me={me} />
        </AccountShell>
    );
}
