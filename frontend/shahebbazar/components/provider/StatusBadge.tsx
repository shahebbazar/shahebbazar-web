import type { Locale } from "@/lib/i18n";
import { providerText, type ProviderDictionary } from "@/lib/i18n-provider";
import type { ListingStatus, VendorStatus } from "@/lib/types";

// Moderation state of a business or listing, in words an owner understands.

type Status = VendorStatus | ListingStatus;

const STYLES: Record<Status, { label: keyof ProviderDictionary; className: string }> = {
    approved: { label: "stateApproved", className: "bg-open-bg text-open-ink" },
    pending: { label: "statePending", className: "bg-sponsor-bg text-sponsor-ink" },
    rejected: { label: "stateRejected", className: "bg-shut-bg text-shut-ink" },
    suspended: { label: "stateSuspended", className: "bg-shut-bg text-shut-ink" },
    draft: { label: "stateDraft", className: "bg-surface-2 text-muted" },
    archived: { label: "stateArchived", className: "bg-surface-2 text-muted" },
};

export function StatusBadge({ status, locale = "en" }: { status: Status; locale?: Locale }) {
    const style = STYLES[status] ?? STYLES.draft;

    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${style.className}`}
        >
            {providerText(locale)[style.label]}
        </span>
    );
}
