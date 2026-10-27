import { formatDayTime } from "@/lib/format";
import type { CampaignCoupon, CampaignCta, CampaignGoal, CampaignStatus } from "@/lib/types";

// Words shown for the campaign brief and status in the Marketing pages.

export const GOALS: { value: CampaignGoal; label: string; hint: string }[] = [
    { value: "new_stock", label: "New stock", hint: "Tell customers about something new" },
    { value: "offer", label: "Offer", hint: "A discount or deal, in your own words" },
    { value: "event", label: "Event", hint: "Invite customers to something on set dates" },
    { value: "reminder", label: "Reminder", hint: "Remind customers you're here" },
];

export const CTAS: { value: CampaignCta; label: string }[] = [
    { value: "visit", label: "Visit the shop" },
    { value: "call", label: "Call us" },
    { value: "message", label: "Message us on Shahebbazar" },
    { value: "order", label: "Order by phone or message" },
];

export const goalLabel = (goal: CampaignGoal) => GOALS.find((g) => g.value === goal)?.label ?? goal;
export const ctaLabel = (cta: CampaignCta) => CTAS.find((c) => c.value === cta)?.label ?? cta;

export const STATUS: Record<CampaignStatus, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-surface-2 text-muted" },
    approved: { label: "Approved", className: "bg-success-bg text-success-ink" },
    sending: { label: "Sending", className: "bg-sponsor-bg text-sponsor-ink" },
    sent: { label: "Sent", className: "bg-brand-50 text-brand-600" },
    failed: { label: "Failed", className: "bg-error-bg text-error-ink" },
};

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
export const formatDay = (iso: string | null) => (iso ? day.format(new Date(iso)) : "—");
export const formatWhen = (iso: string) => formatDayTime(iso);

/** "Valid until 7 Nov 2026", "Starts 1 Nov 2026" or "Expired 7 Nov 2026", with a matching colour. */
export function couponState(coupon: CampaignCoupon) {
    if (coupon.status === "expired") return { label: `Expired ${formatDay(coupon.ends_on)}`, className: "bg-surface-2 text-muted" };
    if (coupon.status === "upcoming") return { label: `Starts ${formatDay(coupon.starts_on)}`, className: "bg-sponsor-bg text-sponsor-ink" };
    return { label: `Valid until ${formatDay(coupon.ends_on)}`, className: "bg-success-bg text-success-ink" };
}
