import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { AdminMarketing, MarketingPassStatus } from "@/lib/types";
import { ActivatePass, PassActions } from "./PassControls";

export const metadata: Metadata = {
    title: "Marketing passes",
};

const BADGE: Record<MarketingPassStatus, string> = {
    active: "bg-success-bg text-success-ink",
    pending: "bg-surface-2 text-muted",
    suspended: "bg-sponsor-bg text-sponsor-ink",
    expired: "bg-surface-2 text-muted",
    cancelled: "bg-error-bg text-error-ink",
};

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
const date = (iso: string | null) => (iso ? day.format(new Date(iso)) : "—");

// Marketing passes (KAN-283): which businesses are sponsored, until when, and the controls to change that.
export default async function AdminMarketingPage() {
    const data = await authenticatedApiGet<AdminMarketing>("/admin/marketing");
    // Null when the session ended after the layout checked it.
    if (!data) redirect("/admin/login");

    const running = data.passes.filter((p) => ["active", "suspended", "pending"].includes(p.effective_status));
    const past = data.passes.filter((p) => !running.includes(p));

    return (
        <AdminShell current="marketing">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Marketing passes</h1>
            <p className="mt-1.5 text-[0.9375rem] text-muted">
                A running pass puts the business in the Sponsored slot on the home and search pages. Placement stops by itself
                when the pass ends. Every change is recorded in the audit log.
            </p>

            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                {data.packages.map((p) => (
                    <li key={p.package_id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                        <p className="text-sm font-semibold">{p.package_duration_days}-day pass</p>
                        <p className="mt-1 text-[1.375rem] font-bold tracking-tight">BDT {Number(p.package_price_bdt).toLocaleString("en-US")}</p>
                        <p className="mt-1 text-[0.8125rem] text-muted">
                            Sponsored placement · {p.package_email_campaign_limit} email campaign{p.package_email_campaign_limit === 1 ? "" : "s"} ·{" "}
                            {p.package_ai_action_limit} AI drafts
                        </p>
                    </li>
                ))}
            </ul>

            <div className="mt-5">
                <ActivatePass packages={data.packages} businesses={data.businesses} />
            </div>

            <h2 className="mt-7 text-[1.0625rem] font-semibold">Running ({running.length})</h2>
            {running.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No business has a pass right now.</p>
            ) : (
                <ul className="mt-3 space-y-3">
                    {running.map((pass) => (
                        <li key={pass.subscription_id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                            <PassSummary pass={pass} />
                            <PassActions pass={pass} />
                        </li>
                    ))}
                </ul>
            )}

            {past.length > 0 && (
                <>
                    <h2 className="mt-7 text-[1.0625rem] font-semibold">Ended ({past.length})</h2>
                    <ul className="mt-3 space-y-2">
                        {past.map((pass) => (
                            <li key={pass.subscription_id} className="rounded-xl border border-line bg-surface px-4 py-3">
                                <PassSummary pass={pass} />
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </AdminShell>
    );
}

function PassSummary({ pass }: { pass: AdminMarketing["passes"][number] }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                    <Link href={`/business/${pass.vendor_slug}`} className="font-semibold hover:underline">
                        {pass.vendor_name}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold capitalize ${BADGE[pass.effective_status]}`}>
                        {pass.effective_status}
                    </span>
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-muted">
                    {pass.package_name} · BDT {Number(pass.subscription_price_bdt).toLocaleString("en-US")} ·{" "}
                    {date(pass.subscription_starts_at)} to {date(pass.subscription_ends_at)}
                    {pass.activated_by_name && ` · activated by ${pass.activated_by_name}`}
                </p>
                {pass.subscription_status_reason && (
                    <p className="mt-0.5 text-[0.8125rem] text-muted">Reason: {pass.subscription_status_reason}</p>
                )}
            </div>
            <Link href={`/vendors/dashboard?vendor=${pass.vendor_id}`} className="text-[0.8125rem] font-medium text-brand-600 hover:underline">
                Open the business&apos;s pages
            </Link>
        </div>
    );
}
