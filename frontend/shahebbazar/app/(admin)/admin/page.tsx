import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, MapPin, Package, Phone, RotateCcw, User, XCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { assetUrl } from "@/lib/api";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { AdminDecisionLog, AdminQueue, AdminSettings, PendingBusiness, PendingListing } from "@/lib/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { StatusBadge } from "@/components/provider/StatusBadge";
import { listingPrice } from "@/components/provider/DashboardCards";
import { DecisionButtons } from "./DecisionButtons";

export const metadata: Metadata = {
    title: "Approvals",
};

// Admin approvals: new and resubmitted businesses, and new listings.

type Tab = "businesses" | "listings";

const when = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
});

export default async function AdminApprovalsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const { tab: rawTab } = await searchParams;
    const [queue, settings] = await Promise.all([
        authenticatedApiGet<AdminQueue>("/admin/queue"),
        authenticatedApiGet<AdminSettings>("/admin/settings"),
    ]);
    // Which kinds currently go public without review (KAN-293).
    const unreviewed = (settings?.settings ?? [])
        .filter((s) => !s.value)
        .map((s) => (s.key === "require_business_approval" ? "new businesses" : "new products and services"));
    // Null when the session ended after the layout checked it.
    if (!queue) redirect("/admin/login");
    const tab: Tab = rawTab === "listings" ? "listings" : "businesses";

    const tabs: { key: Tab; label: string; count: number }[] = [
        { key: "businesses", label: "Businesses", count: queue.vendors.length },
        { key: "listings", label: "Listings", count: queue.listings.length },
    ];

    return (
        <AdminShell current="approvals">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Approvals</h1>
            <p className="mt-1.5 text-[0.9375rem] text-muted">
                {unreviewed.length === 2
                    ? "Requests that were waiting before approval was switched off. Oldest requests are listed first."
                    : "Nothing that needs approval appears on the public site until it is approved here. Oldest requests are listed first."}
            </p>
            {unreviewed.length > 0 && (
                <p className="mt-3 rounded-lg border border-sponsor-ink/30 bg-sponsor-bg p-3 text-sm text-sponsor-ink">
                    Approval is switched off for {unreviewed.join(" and ")}, so they go public without review. Anything
                    already waiting is still listed here.{" "}
                    <Link href="/admin/settings" className="font-semibold underline">
                        Change in Settings
                    </Link>
                </p>
            )}

            <nav aria-label="Queue" className="mt-6 flex gap-2 border-b border-line">
                {tabs.map((t) => (
                    <Link
                        key={t.key}
                        href={t.key === "businesses" ? "/admin" : "/admin?tab=listings"}
                        aria-current={t.key === tab ? "page" : undefined}
                        className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${
                            t.key === tab ? "border-brand-600 text-brand-600" : "border-transparent text-muted hover:text-ink"
                        }`}
                    >
                        {t.label}
                        <span
                            className={`rounded-full px-2 py-0.5 text-[0.75rem] tabular-nums ${
                                t.count > 0 ? "bg-sponsor-bg text-sponsor-ink" : "bg-surface-2 text-muted"
                            }`}
                        >
                            {t.count}
                        </span>
                    </Link>
                ))}
            </nav>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-4">
                    {tab === "businesses" ? (
                        queue.vendors.length === 0 ? (
                            <Empty text="No businesses are waiting for approval." />
                        ) : (
                            queue.vendors.map((v) => <BusinessCard key={v.vendor_id} v={v} />)
                        )
                    ) : queue.listings.length === 0 ? (
                        <Empty text="No listings are waiting for approval." />
                    ) : (
                        queue.listings.map((l) => <ListingCard key={l.listing_id} l={l} />)
                    )}
                </div>

                <RecentDecisions recent={queue.recent} />
            </div>
        </AdminShell>
    );
}

function Empty({ text }: { text: string }) {
    return (
        <div className="rounded-xl border border-line bg-surface p-10 text-center shadow-card">
            <CheckCircle2 className="mx-auto size-8 text-open-ink" />
            <p className="mt-3 font-medium">All caught up</p>
            <p className="mt-1 text-[0.875rem] text-muted">{text}</p>
        </div>
    );
}

/** Gaps worth a second look before approving. Advice only; nothing is blocked. */
function concerns(v: PendingBusiness): string[] {
    const list: string[] = [];
    if (!v.categories) list.push("No category chosen");
    if (v.photo_count === 0) list.push("No photos");
    if (v.hours_days === 0) list.push("No opening hours");
    if (!v.vendor_address || v.vendor_address.trim().length < 10) list.push("Address looks incomplete");
    if (!v.owner_phone_verified) list.push("Owner's phone not verified");
    return list;
}

function BusinessCard({ v }: { v: PendingBusiness }) {
    const cover = assetUrl(v.vendor_cover_url);
    const flags = concerns(v);

    return (
        <article aria-labelledby={`v-${v.vendor_id}`} className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-col gap-4 sm:flex-row">
                <div className="aspect-[4/3] w-full shrink-0 self-start overflow-hidden rounded-lg bg-surface-2 sm:w-40">
                    {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="size-full object-cover" />
                    ) : (
                        <div className="grid size-full place-items-center bg-gradient-to-br from-brand-100 to-brand-200 text-3xl font-bold text-brand-600/70">
                            {v.vendor_name.trim().charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 id={`v-${v.vendor_id}`} className="text-[1.125rem] font-semibold tracking-tight">
                            {v.vendor_name}
                        </h2>
                        {v.resubmitted && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-700">
                                <RotateCcw className="size-3" /> Resubmitted after rejection
                            </span>
                        )}
                    </div>
                    {v.vendor_name_bn && (
                        <p lang="bn" className="font-bn text-[0.875rem] text-muted">
                            {v.vendor_name_bn}
                        </p>
                    )}
                    <p className="mt-1 text-[0.875rem] text-muted">{v.categories ?? "No category"}</p>

                    <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[0.8125rem] sm:grid-cols-2">
                        <Row Icon={MapPin} label="Address">
                            {[v.vendor_address, v.area_name].filter(Boolean).join(", ") || "—"}
                        </Row>
                        <Row Icon={Phone} label="Phone">
                            {v.vendor_phone}
                        </Row>
                        <Row Icon={User} label="Owner">
                            {v.owner_name} · {v.owner_phone}
                            {v.owner_other_businesses > 0 && ` · ${v.owner_other_businesses} other business${v.owner_other_businesses === 1 ? "" : "es"}`}
                        </Row>
                        <Row Icon={Clock} label="Waiting since">
                            {when.format(new Date(v.vendor_updated_at))}
                        </Row>
                    </dl>

                    {v.vendor_description && (
                        <p className="mt-3 text-[0.875rem] leading-relaxed text-muted">{v.vendor_description}</p>
                    )}
                    <p className="mt-2 text-[0.75rem] text-muted">
                        {v.listing_count} listing{v.listing_count === 1 ? "" : "s"} · {v.photo_count} photo
                        {v.photo_count === 1 ? "" : "s"} · hours for {v.hours_days} of 7 days
                        {v.vendor_email && ` · ${v.vendor_email}`}
                        {v.vendor_website && ` · ${v.vendor_website}`}
                    </p>

                    {flags.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Worth checking">
                            {flags.map((f) => (
                                <li key={f} className="inline-flex items-center gap-1 rounded-full bg-sponsor-bg px-2 py-0.5 text-[0.6875rem] font-medium text-sponsor-ink">
                                    <AlertTriangle className="size-3" /> {f}
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="mt-4 border-t border-line pt-4">
                        <DecisionButtons kind="vendor" id={v.vendor_id} label={v.vendor_name} />
                        <BusinessPagesLink vendorId={v.vendor_id} />
                    </div>
                </div>
            </div>
        </article>
    );
}

function ListingCard({ l }: { l: PendingListing }) {
    const photo = assetUrl(l.photo_url);
    const moq = l.listing_min_order_qty;

    return (
        <article aria-labelledby={`l-${l.listing_id}`} className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className="flex gap-4">
                <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-50 text-brand-600">
                    {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="size-full object-cover" />
                    ) : (
                        <Package className="size-7" strokeWidth={1.5} />
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <h2 id={`l-${l.listing_id}`} className="text-[1.0625rem] font-semibold tracking-tight">
                        {l.listing_title}
                    </h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
                        <span>by {l.vendor_name}</span>
                        {l.vendor_status !== "approved" && <StatusBadge status={l.vendor_status} />}
                    </p>
                    <p className="mt-1.5 text-[0.875rem]">
                        <span className="font-medium">{listingPrice(l)}</span>
                        {moq ? <span className="text-muted"> · minimum order {moq}</span> : null}
                        <span className="text-muted"> · {l.category_name ?? "No category"}</span>
                    </p>
                    {l.listing_description && (
                        <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">{l.listing_description}</p>
                    )}
                    {l.vendor_status !== "approved" && (
                        <p className="mt-2 text-[0.75rem] text-sponsor-ink">
                            The business itself is not approved yet, so this listing stays hidden until it is.
                        </p>
                    )}
                    <p className="mt-2 text-[0.75rem] text-muted">Added {when.format(new Date(l.listing_created_at))}</p>
                    <div className="mt-4 border-t border-line pt-4">
                        <DecisionButtons kind="listing" id={l.listing_id} label={l.listing_title} />
                        <BusinessPagesLink vendorId={l.vendor_id} />
                    </div>
                </div>
            </div>
        </article>
    );
}

// Opens the business's own dashboard pages in admin view, to check or correct the details.
function BusinessPagesLink({ vendorId }: { vendorId: number }) {
    return (
        <Link href={`/vendors/dashboard?vendor=${vendorId}`} className="mt-3 inline-block text-[0.8125rem] font-medium text-brand-600 hover:underline">
            Open the business&apos;s pages
        </Link>
    );
}

function Row({ Icon, label, children }: { Icon: typeof MapPin; label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 items-start gap-2">
            <dt className="flex shrink-0 items-center gap-1.5 text-muted">
                <Icon className="size-3.5" />
                <span className="sr-only">{label}</span>
            </dt>
            <dd className="min-w-0">{children}</dd>
        </div>
    );
}

function RecentDecisions({ recent }: { recent: AdminDecisionLog[] }) {
    return (
        <section aria-labelledby="recent-heading" className="self-start rounded-xl border border-line bg-surface p-5 shadow-card xl:sticky xl:top-20">
            <h2 id="recent-heading" className="text-[1.0625rem] font-semibold">
                Recent decisions
            </h2>
            {recent.length === 0 ? (
                <p className="mt-3 text-[0.875rem] text-muted">None yet.</p>
            ) : (
                <ol className="mt-3 space-y-3">
                    {recent.map((r) => {
                        const approved = r.audit_action.endsWith("approve");
                        return (
                            <li key={r.audit_id} className="flex gap-2.5 text-[0.8125rem]">
                                {approved ? (
                                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-open-ink" aria-label="Approved" />
                                ) : (
                                    <XCircle className="mt-0.5 size-4 shrink-0 text-shut-ink" aria-label="Rejected" />
                                )}
                                <div className="min-w-0">
                                    <p>
                                        <span className="font-medium">{r.target_label ?? `#${r.audit_target_id}`}</span>{" "}
                                        <span className="text-muted">
                                            {r.audit_target_type === "vendor" ? "business" : "listing"} {approved ? "approved" : "rejected"}
                                        </span>
                                    </p>
                                    {r.reason && <p className="mt-0.5 text-muted">“{r.reason}”</p>}
                                    <p className="mt-0.5 text-[0.75rem] text-soft">
                                        {r.actor_name ?? "Unknown"} · {when.format(new Date(r.audit_created_at))}
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
