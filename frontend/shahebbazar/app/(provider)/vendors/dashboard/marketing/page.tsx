import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, Megaphone, Plus, Sparkles } from "lucide-react";
import { authenticatedApiGet, getViewer } from "@/lib/auth-server";
import { ProviderShell, parseVendorParam, providerHref, dashboardFor } from "@/components/provider/ProviderShell";
import { providerText } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
import type { MarketingResults, MarketingWorkspace, VendorSummary } from "@/lib/types";
import { DeleteCampaignButton } from "./DeleteCampaignButton";
import { MarketingResultsPanel } from "./MarketingResultsPanel";
import { STATUS, couponState, formatDay, formatWhen, goalLabel } from "./labels";

export const metadata: Metadata = {
    title: "Marketing",
};

const FIX_PATHS = {
    dashboard: "/vendors/dashboard",
    listings: "/vendors/dashboard/listings",
    business: "/vendors/dashboard/business",
} as const;

/** What a business without a running pass gets, and what a pass would add. */
function FreePlan({ workspace }: { workspace: MarketingWorkspace }) {
    const ended = workspace.plan === "ended" && workspace.pass;
    const free = workspace.free_emails;
    const emails = ended
        ? `${workspace.ended_emails_per_week} email campaign a week`
        : `${free.limit} email campaign${free.limit === 1 ? "" : "s"} a month`;
    return (
        <>
            <p className="mt-2 text-sm">
                <span className="font-medium">{ended ? "Your pass has ended" : "Free plan"}</span>
                {ended && workspace.pass && <span className="text-muted"> · ended {formatDay(workspace.pass.ends_at)}</span>}
            </p>
            <p className="mt-1 text-sm text-muted">
                {!ended && free.limit === 0
                    ? "You can write campaigns. Sending them by email needs a Marketing pass."
                    : `You can write campaigns and send ${emails} to customers who chose to get your offers.`}{" "}
                Your past campaigns stay here.
            </p>
            {!ended && free.limit > 0 && (
                <dl className="mt-3 text-sm">
                    <div className="rounded-lg bg-surface-2 p-3">
                        <dt className="text-xs text-muted">Free email campaigns left this month</dt>
                        <dd className="mt-0.5 text-lg font-bold">
                            {free.left}
                            <span className="text-sm font-normal text-muted"> of {free.limit}</span>
                        </dd>
                    </div>
                </dl>
            )}
            <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-brand-700">
                    <Sparkles className="size-4" aria-hidden /> A Marketing pass adds
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-ink">
                    <li>A place in the Sponsored results on the home and search pages</li>
                    <li>Up to 12 email campaigns, depending on the pass</li>
                    <li>AI help rewriting and translating your drafts (coming soon)</li>
                </ul>
                <p className="mt-2 text-[0.8125rem] text-muted">
                    7, 30 or 90 days, from BDT 299.{" "}
                    <Link href="/about#contact" className="font-medium text-brand-600 hover:underline">
                        Contact Shahebbazar
                    </Link>{" "}
                    to get one.
                </p>
            </div>
        </>
    );
}

// The business's Marketing workspace (KAN-285): pass, readiness and campaigns.
/** Asks a business whose pass has ended, or is about to, to renew. Results and campaigns stay either way. */
function RenewBanner({ workspace }: { workspace: MarketingWorkspace }) {
    const { pass } = workspace;
    if (!pass) return null;
    const ended = workspace.plan === "ended";
    const ending = workspace.plan === "pass" && pass.status === "active" && pass.days_left <= 7;
    if (!ended && !ending) return null;
    return (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sponsor-ink/30 bg-sponsor-bg p-4 text-sm text-sponsor-ink">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
                {ended ? (
                    <>
                        <span className="font-semibold">Your Marketing pass ended {formatDay(pass.ends_at)}.</span> You&apos;re no longer in the
                        Sponsored results, and you can send {workspace.ended_emails_per_week} email campaign a week. Your campaigns and results stay here.
                    </>
                ) : (
                    <>
                        <span className="font-semibold">
                            Your Marketing pass ends in {pass.days_left} day{pass.days_left === 1 ? "" : "s"}, on {formatDay(pass.ends_at)}.
                        </span>{" "}
                        Renew to stay in the Sponsored results and keep your email campaigns.
                    </>
                )}
            </span>
            <Link href="/about#contact" className="font-semibold underline hover:no-underline">
                Renew: contact Shahebbazar
            </Link>
        </div>
    );
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ vendor?: string; days?: string }> }) {
    const query = await searchParams;
    const vendorId = parseVendorParam(query.vendor);
    if (vendorId === null) redirect(dashboardFor("/vendors/dashboard/marketing"));
    const days = [7, 30, 90].find((p) => p === Number(query.days)) ?? 30;
    const [vendor, workspace, viewer, results] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<MarketingWorkspace>(`/vendors/${vendorId}/marketing/workspace`),
        getViewer(),
        authenticatedApiGet<MarketingResults>(`/vendors/${vendorId}/marketing/results?days=${days}`),
    ]);
    if (!vendor) notFound();
    const adminView = viewer?.user_role === "admin";
    const copy = providerText(await getAccountLocale());

    if (!workspace) {
        return (
            <ProviderShell vendor={vendor} current="marketing">
                <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{copy.navMarketing}</h1>
                <p className="mt-3 max-w-xl text-sm text-muted">
                    {copy.marketingOff}
                </p>
            </ProviderShell>
        );
    }

    const { pass, readiness, campaigns } = workspace;
    const newHref = providerHref("/vendors/dashboard/marketing/new", vendorId);

    return (
        <ProviderShell vendor={vendor} current="marketing">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{copy.navMarketing}</h1>
                    <p className="mt-1.5 text-[0.9375rem] text-muted">
                        {copy.marketingIntro}
                    </p>
                </div>
                {!adminView &&
                    (workspace.can_create ? (
                        <Link
                            href={newHref}
                            className="inline-flex items-center gap-2 rounded-[10px] bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                        >
                            <Plus className="size-4" />
                            New campaign
                        </Link>
                    ) : (
                        <span className="max-w-xs text-right text-[0.8125rem] text-muted">{workspace.cannot_create_reason}</span>
                    ))}
            </div>

            <RenewBanner workspace={workspace} />

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <section aria-labelledby="pass-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <h2 id="pass-heading" className="flex items-center gap-2 font-semibold">
                        <Megaphone className="size-4 text-brand-600" />
                        Marketing pass
                    </h2>
                    {workspace.plan === "free" || workspace.plan === "ended" || !pass ? (
                        <FreePlan workspace={workspace} />
                    ) : (
                        <>
                            <p className="mt-2 text-sm">
                                <span className="font-medium">{pass.package.name}</span>
                                <span className="text-muted">
                                    {" · "}
                                    {pass.status === "active"
                                        ? `${pass.days_left} day${pass.days_left === 1 ? "" : "s"} left, until ${formatDay(pass.ends_at)}`
                                        : pass.status === "expired"
                                            ? `ended ${formatDay(pass.ends_at)}`
                                            : pass.status}
                                </span>
                            </p>
                            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-lg bg-surface-2 p-3">
                                    <dt className="text-xs text-muted">Email campaigns left</dt>
                                    <dd className="mt-0.5 text-lg font-bold">
                                        {pass.allowances.email_campaign.left}
                                        <span className="text-sm font-normal text-muted"> of {pass.allowances.email_campaign.limit}</span>
                                    </dd>
                                </div>
                                <div className="rounded-lg bg-surface-2 p-3">
                                    <dt className="text-xs text-muted">AI drafts left</dt>
                                    <dd className="mt-0.5 text-lg font-bold">
                                        {pass.allowances.ai_action.left}
                                        <span className="text-sm font-normal text-muted"> of {pass.allowances.ai_action.limit}</span>
                                    </dd>
                                    {/* Included in the pass; the AI rewrite, shorten and translate tools come later (D14). */}
                                    <dd className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[0.6875rem] font-medium text-brand-600">
                                        Coming soon
                                    </dd>
                                </div>
                            </dl>
                            <p className="mt-2 text-xs text-soft">Writing and editing drafts is free; an allowance is used only when a campaign is sent.</p>
                        </>
                    )}
                    <p className="mt-3 border-t border-line pt-3 text-sm">
                        <span className="font-semibold">{workspace.email_subscribers}</span>{" "}
                        {workspace.email_subscribers === 1 ? "customer gets" : "customers get"} your offers by email.
                        {workspace.email_subscribers === 0 && (
                            <span className="text-muted"> Customers choose this when they save your business.</span>
                        )}
                    </p>
                </section>

                <section aria-labelledby="ready-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <h2 id="ready-heading" className="font-semibold">Ready to promote</h2>
                    <ul className="mt-3 space-y-2 text-sm">
                        {readiness.checks.map((check) => (
                            <li key={check.key} className="flex items-center gap-2.5">
                                {check.done ? (
                                    <CheckCircle2 className="size-4 shrink-0 text-success-ink" aria-hidden />
                                ) : (
                                    <Circle className="size-4 shrink-0 text-soft" aria-hidden />
                                )}
                                <span className={check.done ? "" : "text-muted"}>
                                    {check.label}
                                    <span className="sr-only">{check.done ? ": done" : ": not yet"}</span>
                                </span>
                                {!check.done && !adminView && (
                                    <Link
                                        href={providerHref(FIX_PATHS[check.fix], vendorId)}
                                        className="ml-auto text-[0.8125rem] font-medium text-brand-600 hover:underline"
                                    >
                                        Fix
                                    </Link>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            </div>

            {results && (
                <MarketingResultsPanel vendorId={vendorId} results={results} plan={workspace.plan} subscribers={workspace.email_subscribers} />
            )}

            <section aria-labelledby="campaigns-heading" className="mt-6">
                <h2 id="campaigns-heading" className="text-[1.0625rem] font-semibold">Campaigns</h2>
                {campaigns.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">
                        No campaigns yet.{" "}
                        {workspace.can_create && !adminView && (
                            <Link href={newHref} className="font-medium text-brand-600 hover:underline">
                                Write your first one
                            </Link>
                        )}
                    </p>
                ) : (
                    <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface shadow-card">
                        {campaigns.map((c) => (
                            <li key={c.campaign_id} className="flex items-center gap-1 pr-2 hover:bg-surface-2">
                                <Link
                                    href={providerHref(`/vendors/dashboard/marketing/${c.campaign_id}`, vendorId)}
                                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{c.campaign_title}</span>
                                        <span className="block text-xs text-muted">
                                            {goalLabel(c.campaign_goal)} · {c.campaign_language === "bn" ? "Bangla" : "English"} · version{" "}
                                            {c.versions} · updated {formatWhen(c.campaign_updated_at)}
                                            {c.coupon ? ` · coupon ${c.coupon.code}, ${couponState(c.coupon).label.toLowerCase()}` : ""}
                                            {c.posted_on.length > 0
                                                ? ` · posted on ${c.posted_on.map((p) => (p === "facebook" ? "Facebook" : "WhatsApp")).join(" and ")}`
                                                : ""}
                                        </span>
                                    </span>
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[c.campaign_status].className}`}>
                                        {STATUS[c.campaign_status].label}
                                    </span>
                                    <ChevronRight className="size-4 shrink-0 text-soft" aria-hidden />
                                </Link>
                                {!adminView && ["draft", "approved"].includes(c.campaign_status) && c.posted_on.length === 0 && (
                                    <DeleteCampaignButton vendorId={vendorId} campaignId={c.campaign_id} title={c.campaign_title} />
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </ProviderShell>
    );
}
