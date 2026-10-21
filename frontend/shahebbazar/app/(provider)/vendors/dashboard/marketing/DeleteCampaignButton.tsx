"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { deleteCampaign } from "./actions";

// Deletes a draft or approved campaign from the campaign list, after asking first.
export function DeleteCampaignButton({ vendorId, campaignId, title }: { vendorId: number; campaignId: number; title: string }) {
    const [asking, setAsking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function remove() {
        setAsking(false);
        setError(null);
        startTransition(async () => {
            const result = await deleteCampaign(vendorId, campaignId);
            if (!result.ok) setError(result.error);
        });
    }

    return (
        <>
            {error && (
                <span role="alert" className="text-xs text-error-ink">
                    {error}
                </span>
            )}
            <button
                type="button"
                onClick={() => setAsking(true)}
                disabled={pending}
                aria-label={`Delete ${title}`}
                title="Delete"
                className="grid size-8 shrink-0 place-items-center rounded-[10px] text-muted hover:bg-error-bg hover:text-error-ink disabled:opacity-50"
            >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
            <ConfirmDialog
                open={asking}
                title={`Delete "${title}"?`}
                body="Its drafts and every version are deleted. This can't be undone."
                confirmLabel="Delete"
                onConfirm={remove}
                onCancel={() => setAsking(false)}
            />
        </>
    );
}
