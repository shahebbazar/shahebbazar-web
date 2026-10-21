import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Change } from "@/components/provider/DashboardCards";
import { providerHref } from "@/components/provider/ProviderShell";
import type { MarketingResults, PostChannel } from "@/lib/types";
import { formatWhen } from "./labels";

const PERIODS = [7, 30, 90] as const;
const CHANNELS: Record<PostChannel, string> = { facebook: "Facebook", whatsapp: "WhatsApp" };
const n = (v: number) => v.toLocaleString("en-US");

/**
 * What the business's marketing did in the chosen period (KAN-287): sponsored views and search
 * appearances against the period before, emails sent and unsubscribes, posts, and the latest
 * campaigns. Shown on every plan, so results stay after a pass ends. Opens aren't tracked.
 */
export function MarketingResultsPanel({ vendorId, results }: { vendorId: number; results: MarketingResults }) {
    const { days, email, posts } = results;
    const figures = [
        { label: "Sponsored views", count: results.sponsored_views, hint: "Visits from the Sponsored results" },
        { label: "Search appearances", count: results.search_appearances, hint: "Times you were on the first page of a search" },
        { label: "Visits from shared links", count: results.shared_link_views, hint: "From Facebook, WhatsApp and other sites" },
    ];

    return (
        <section aria-labelledby="results-heading" id="results" className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="results-heading" className="flex items-center gap-2 font-semibold">
                    <BarChart3 className="size-4 text-brand-600" aria-hidden /> Results
                </h2>
                <nav aria-label="Results period" className="flex rounded-[10px] border border-line-strong p-0.5">
                    {PERIODS.map((p) => (
                        <Link
                            key={p}
                            href={`${providerHref("/vendors/dashboard/marketing", vendorId)}&days=${p}#results`}
                            aria-current={p === days ? "true" : undefined}
                            scroll={false}
                            className={`rounded-lg px-2.5 py-1 text-[0.75rem] font-medium whitespace-nowrap ${p === days ? "bg-brand-50 text-brand-600" : "text-muted hover:text-ink"}`}
                        >
                            {p} days
                        </Link>
                    ))}
                </nav>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                {figures.map(({ label, count, hint }) => (
                    <div key={label} className="rounded-lg border border-line p-4">
                        <dt className="text-[0.8125rem] text-muted">{label}</dt>
                        <dd className="mt-1 flex items-baseline gap-2">
                            <span className="text-[1.375rem] font-bold tabular-nums">{n(count.current)}</span>
                            <span className="text-[0.8125rem]">
                                <Change count={count} />
                            </span>
                        </dd>
                        <dd className="mt-1 text-[0.75rem] text-soft">{hint}</dd>
                    </div>
                ))}
            </dl>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <dl aria-label="Email" className="rounded-lg bg-surface-2 p-4 text-sm">
                    <dt className="font-semibold">Email</dt>
                    <dd className="mt-1.5 text-muted">
                        <span className="font-semibold text-ink">{n(email.emails_sent)}</span> email{email.emails_sent === 1 ? "" : "s"} sent in{" "}
                        {n(email.campaigns_sent)} campaign{email.campaigns_sent === 1 ? "" : "s"}
                        {email.emails_failed ? `; ${n(email.emails_failed)} couldn't be delivered` : ""}
                    </dd>
                    <dd className="mt-0.5 text-muted">
                        <span className="font-semibold text-ink">{n(email.subscribed)}</span> new subscriber{email.subscribed === 1 ? "" : "s"} ·{" "}
                        <span className="font-semibold text-ink">{n(email.unsubscribed)}</span> unsubscribed
                    </dd>
                </dl>
                <dl aria-label="Posts" className="rounded-lg bg-surface-2 p-4 text-sm">
                    <dt className="font-semibold">Facebook and WhatsApp</dt>
                    <dd className="mt-1.5 text-muted">
                        {(Object.keys(CHANNELS) as PostChannel[]).map((c, i) => (
                            <span key={c}>
                                {i > 0 && " · "}
                                <span className="font-semibold text-ink">{n(posts[c])}</span> posted on {CHANNELS[c]}
                            </span>
                        ))}
                    </dd>
                    <dd className="mt-0.5 text-[0.75rem] text-soft">Counted when you mark a campaign as posted.</dd>
                </dl>
            </div>

            {results.recent.length > 0 && (
                <div className="mt-4">
                    <h3 className="text-sm font-semibold">Latest campaigns</h3>
                    <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
                        {results.recent.map((r) => (
                            <li key={r.campaign_id}>
                                <Link
                                    href={providerHref(`/vendors/dashboard/marketing/${r.campaign_id}`, vendorId)}
                                    className="flex flex-col gap-0.5 px-3 py-2 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-3"
                                >
                                    <span className="min-w-0 font-medium sm:flex-1 sm:truncate">{r.campaign_title}</span>
                                    <span className="text-xs text-muted">
                                        {[
                                            r.campaign_sent_at && `${n(r.emails_sent)} email${r.emails_sent === 1 ? "" : "s"}`,
                                            ...r.posted_on.map((c) => `posted on ${CHANNELS[c]}`),
                                            formatWhen(r.last_activity),
                                        ].filter(Boolean).join(" · ")}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <p className="mt-3 text-[0.75rem] text-soft">
                Email opens and clicks aren&apos;t tracked. Results stay here whether or not you have a Marketing pass.
            </p>
        </section>
    );
}
