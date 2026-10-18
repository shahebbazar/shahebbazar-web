import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { AdminTrends } from "@/lib/types";

export const metadata: Metadata = {
    title: "Search trends",
};

const PERIODS = [7, 30, 90];

export default async function AdminTrendsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
    const requested = Number((await searchParams).days);
    const days = PERIODS.includes(requested) ? requested : 30;
    const data = await authenticatedApiGet<AdminTrends>(`/admin/trends?days=${days}`);

    if (!data) {
        return (
            <AdminShell current="trends">
                <p className="text-sm text-muted">Trends are unavailable.</p>
            </AdminShell>
        );
    }

    const peakUsers = Math.max(1, ...data.daily.map((d) => d.active_users));
    const peakSearches = Math.max(1, ...data.top.map((t) => t.searches));
    const totals = [
        { label: "Searches", value: data.totals.searches },
        { label: "Profile views", value: data.totals.profile_views },
        { label: "New businesses", value: data.totals.new_businesses },
        { label: "New reviews", value: data.totals.new_reviews },
    ];

    return (
        <AdminShell current="trends">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Search trends</h1>
                    <p className="mt-1.5 text-[0.9375rem] text-muted">
                        What people search for and how many use the site. Searches made fewer than 5 times a day are left out to protect privacy.
                    </p>
                </div>
                <nav className="flex gap-1 rounded-[10px] border border-line bg-surface p-1">
                    {PERIODS.map((p) => (
                        <Link
                            key={p}
                            href={`/admin/trends?days=${p}`}
                            aria-current={p === days ? "page" : undefined}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${p === days ? "bg-brand-600 text-white" : "text-muted hover:text-ink"}`}
                        >
                            {p} days
                        </Link>
                    ))}
                </nav>
            </div>

            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {totals.map((t) => (
                    <li key={t.label} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                        <p className="text-2xl font-bold">{t.value.toLocaleString("en-US")}</p>
                        <p className="text-[0.8125rem] text-muted">{t.label}</p>
                    </li>
                ))}
            </ul>

            <section className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 className="text-[1.0625rem] font-semibold">Daily active users</h2>
                <div className="mt-4 flex h-40 items-end gap-[2px]" role="img" aria-label="Daily active users chart">
                    {data.daily.map((d) => (
                        <div
                            key={d.day}
                            title={`${d.day}: ${d.active_users} active users, ${d.searches} searches`}
                            className="min-w-0 flex-1 rounded-t bg-brand-500 hover:bg-brand-700"
                            style={{ height: `${Math.max(2, (d.active_users / peakUsers) * 100)}%` }}
                        />
                    ))}
                </div>
                <div className="mt-1 flex justify-between text-xs text-soft">
                    <span>{data.daily[0]?.day}</span>
                    <span>{data.daily.at(-1)?.day}</span>
                </div>
            </section>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <h2 className="text-[1.0625rem] font-semibold">Top searches</h2>
                    {data.top.length === 0 ? (
                        <p className="mt-3 text-sm text-muted">Not enough searches yet.</p>
                    ) : (
                        <ol className="mt-3 space-y-2">
                            {data.top.map((t) => (
                                <li key={t.query} className="text-sm">
                                    <div className="flex justify-between gap-2">
                                        <span className="font-medium">{t.query}</span>
                                        <span className="text-muted">
                                            {t.searches} · avg {t.avg_results} results
                                        </span>
                                    </div>
                                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${(t.searches / peakSearches) * 100}%` }} />
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>

                <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <h2 className="text-[1.0625rem] font-semibold">Searches with no results</h2>
                    <p className="mt-1 text-[0.8125rem] text-muted">Demand the directory does not cover yet: businesses worth inviting.</p>
                    {data.noResults.length === 0 ? (
                        <p className="mt-3 text-sm text-muted">None in this period.</p>
                    ) : (
                        <ul className="mt-3 divide-y divide-line">
                            {data.noResults.map((t) => (
                                <li key={t.query} className="flex justify-between py-2 text-sm">
                                    <span className="font-medium">{t.query}</span>
                                    <span className="text-muted">{t.searches} searches</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </AdminShell>
    );
}
