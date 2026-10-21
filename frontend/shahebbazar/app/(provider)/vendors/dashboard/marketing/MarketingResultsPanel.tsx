import Link from "next/link";
import { BarChart3, Lightbulb } from "lucide-react";
import { Change } from "@/components/provider/DashboardCards";
import { providerHref } from "@/components/provider/ProviderShell";
import type { MarketingResults, MarketingSource, MarketingWorkspace, PostChannel } from "@/lib/types";
import { formatWhen } from "./labels";

const PERIODS = [7, 30, 90] as const;
const CHANNELS: Record<PostChannel, string> = { facebook: "Facebook", whatsapp: "WhatsApp" };
const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, word: string) => `${n(v)} ${word}${v === 1 ? "" : "s"}`;

const SOURCES: { key: MarketingSource; label: string; hint: string; colour: string }[] = [
    { key: "sponsored", label: "Sponsored results", hint: "Clicked your business in the Sponsored results", colour: "bg-amber-500" },
    { key: "email", label: "Email", hint: "Followed a link in one of your campaign emails", colour: "bg-brand-600" },
    { key: "facebook", label: "Facebook", hint: "Followed the link in a post you made with the posting tools", colour: "bg-[#1877f2]" },
    { key: "whatsapp", label: "WhatsApp", hint: "Followed the link in a message you sent with the posting tools", colour: "bg-[#25d366]" },
    { key: "share", label: "Other sites", hint: "Followed a link to your page from another site or app", colour: "bg-slate-400" },
];

/**
 * What the business's marketing did in the chosen period (KAN-287): the visits it brought to the page
 * and where they came from, search appearances, email and posts, and the latest campaigns with their
 * visits. Shown on every plan, so results stay after a pass ends. Email opens aren't tracked.
 */
export function MarketingResultsPanel({
    vendorId,
    results,
    plan,
    subscribers,
}: {
    vendorId: number;
    results: MarketingResults;
    plan: MarketingWorkspace["plan"];
    subscribers: number;
}) {
    const { days, email, posts, visits_by_source: bySource } = results;
    const largest = Math.max(1, ...SOURCES.map((s) => bySource[s.key].current));
    const nothingYet = results.marketing_visits.current === 0 && results.recent.length === 0 && email.emails_sent === 0;

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

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                    <dt className="text-[0.8125rem] font-medium text-brand-700">Visits from your marketing</dt>
                    <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[1.75rem] leading-tight font-bold tabular-nums">{n(results.marketing_visits.current)}</span>
                        <span className="text-[0.8125rem]">
                            <Change count={results.marketing_visits} />
                        </span>
                    </dd>
                    <dd className="mt-1 text-[0.75rem] text-muted">People who came to your page in the last {days} days from the places below.</dd>
                </div>
                <div className="rounded-lg border border-line p-4">
                    <dt className="text-[0.8125rem] text-muted">Seen in search</dt>
                    <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[1.75rem] leading-tight font-bold tabular-nums">{n(results.search_appearances.current)}</span>
                        <span className="text-[0.8125rem]">
                            <Change count={results.search_appearances} />
                        </span>
                    </dd>
                    <dd className="mt-1 text-[0.75rem] text-muted">Times your business was on the first page of someone&apos;s search.</dd>
                </div>
            </dl>

            <div className="mt-4">
                <h3 className="text-sm font-semibold">Where visits came from</h3>
                <ul className="mt-2 space-y-2.5">
                    {SOURCES.map(({ key, label, hint, colour }) => {
                        const count = bySource[key];
                        const needsPass = key === "sponsored" && plan !== "pass" && count.current === 0;
                        return (
                            <li key={key} aria-label={`${label}: ${count.current}`}>
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="font-medium">{label}</span>
                                    <span className="flex items-baseline gap-2">
                                        <span className="font-semibold tabular-nums">{n(count.current)}</span>
                                        {!needsPass && (
                                            <span className="text-[0.75rem]">
                                                <Change count={count} />
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                                    <div className={`h-full rounded-full ${colour}`} style={{ width: `${(count.current / largest) * 100}%` }} />
                                </div>
                                <p className="mt-0.5 text-[0.75rem] text-soft">
                                    {needsPass ? "Needs a Marketing pass: businesses with one are shown in the Sponsored results." : hint}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <dl aria-label="Email" className="rounded-lg bg-surface-2 p-4 text-sm">
                    <dt className="font-semibold">Email</dt>
                    <dd className="mt-1.5 text-muted">
                        <span className="font-semibold text-ink">{plural(email.emails_sent, "email")}</span> sent in{" "}
                        {plural(email.campaigns_sent, "campaign")}
                        {email.emails_failed ? `; ${n(email.emails_failed)} couldn't be delivered` : ""}
                    </dd>
                    <dd className="mt-0.5 text-muted">
                        <span className="font-semibold text-ink">+{n(email.subscribed)}</span> new subscriber{email.subscribed === 1 ? "" : "s"} ·{" "}
                        <span className="font-semibold text-ink">{n(email.unsubscribed)}</span> unsubscribed
                    </dd>
                    <dd className="mt-0.5 text-[0.75rem] text-soft">
                        {plural(subscribers, "customer")} get{subscribers === 1 ? "s" : ""} your emails now.
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
                    <dd className="mt-0.5 text-[0.75rem] text-soft">Posts you marked as posted. Visits from their links are counted above.</dd>
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
                                        <span className="font-semibold text-ink">{plural(r.visits, "visit")}</span>
                                        {" · "}
                                        {[
                                            r.campaign_sent_at && plural(r.emails_sent, "email"),
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

            {nothingYet && (
                <p className="mt-4 flex gap-2 rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                    <span>
                        Send a campaign by email, or post one on Facebook or WhatsApp with the posting tools, and the visits it brings show
                        here.
                    </span>
                </p>
            )}

            <p className="mt-3 text-[0.75rem] text-soft">
                A visit is counted once per person every 30 minutes. Email opens aren&apos;t tracked. Results stay here whether or not you have a
                Marketing pass.
            </p>
        </section>
    );
}
