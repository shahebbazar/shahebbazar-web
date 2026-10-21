"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// The search filter form: changing any filter updates the results straight away, without a Search
// button. Without JavaScript it is still an ordinary GET form, submitted by the fallback button.
export function AutoApplyFilters({
    className,
    loadingLabel,
    children,
}: {
    className?: string;
    loadingLabel: string;
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    function apply(form: HTMLFormElement) {
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(form)) {
            if (typeof value === "string" && value) params.set(key, value);
        }
        // Any page number is dropped, so new filters start from the first page.
        const qs = params.toString();
        startTransition(() => router.push(qs ? `/search?${qs}` : "/search", { scroll: false }));
    }

    return (
        <form
            action="/search"
            method="get"
            className={className}
            aria-busy={pending}
            onChange={(event) => apply(event.currentTarget)}
            onSubmit={(event) => {
                event.preventDefault();
                apply(event.currentTarget);
            }}
        >
            {children}
            {pending && (
                <span role="status" className="inline-flex items-center gap-1.5 text-sm text-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {loadingLabel}
                </span>
            )}
        </form>
    );
}
