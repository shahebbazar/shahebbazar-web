import type { EventStatus } from "@/lib/types";

// An event's state, in words an owner understands (KAN-298).
const STYLES: Record<EventStatus, { label: string; className: string }> = {
    published: { label: "Live", className: "bg-open-bg text-open-ink" },
    pending: { label: "Awaiting approval", className: "bg-sponsor-bg text-sponsor-ink" },
    rejected: { label: "Rejected", className: "bg-shut-bg text-shut-ink" },
    cancelled: { label: "Cancelled", className: "bg-surface-2 text-muted" },
    draft: { label: "Draft", className: "bg-surface-2 text-muted" },
};
const ENDED = { label: "Ended", className: "bg-surface-2 text-muted" };

export function EventStatusBadge({ status, ended = false }: { status: EventStatus; ended?: boolean }) {
    const style = status === "published" && ended ? ENDED : (STYLES[status] ?? STYLES.draft);
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${style.className}`}>
            {style.label}
        </span>
    );
}
