"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { BROWSER_API_BASE } from "@/lib/apiBase";

// The last section of My details: deletes the account after asking first. It is deactivated for 30 days,
// and signing in again within them brings it back.
export function DeleteAccount() {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function remove() {
        setAsking(false);
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`${BROWSER_API_BASE}/api/me`, {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ confirm: true }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setBusy(false);
                return setError(data?.error ?? `Something went wrong (${res.status}).`);
            }
            router.replace("/login?account=deleted");
            router.refresh();
        } catch {
            setBusy(false);
            setError("Could not reach the server. Try again.");
        }
    }

    return (
        <section aria-labelledby="delete-heading" className="mt-8 max-w-lg rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 id="delete-heading" className="text-sm font-semibold">
                Delete your account
            </h2>
            <p className="mt-1 text-[0.8125rem] text-muted">
                Your account is deactivated for 30 days: you&apos;re signed out and get no offers, but nothing is lost, and signing in
                again with your mobile number brings it back. After 30 days your name, mobile number, email, photo, area, saved
                businesses and offers are removed. Reviews and messages you wrote stay with the businesses, shown as from a
                &ldquo;Former customer&rdquo;.
            </p>
            <button
                type="button"
                onClick={() => setAsking(true)}
                disabled={busy}
                className="mt-3 inline-flex items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-error-ink hover:bg-error-bg disabled:opacity-50"
            >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Delete my account
            </button>
            {error && (
                <p role="alert" className="mt-2 text-[0.8125rem] text-error-ink">
                    {error}
                </p>
            )}
            <ConfirmDialog
                open={asking}
                title="Delete your account?"
                body="You'll be signed out now. Sign in again within 30 days to keep your account; after that it can't be undone."
                confirmLabel="Yes, delete my account"
                onConfirm={remove}
                onCancel={() => setAsking(false)}
            />
        </section>
    );
}
