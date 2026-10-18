import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { ActionButton } from "@/components/admin/ActionButton";
import { authenticatedApiGet } from "@/lib/auth-server";
import { formatDateTime } from "@/lib/format";
import type { AdminReport } from "@/lib/types";
import { resolveReport } from "../moderation-actions";

export const metadata: Metadata = {
    title: "Reports",
};

const REASONS: Record<string, string> = {
    wrong_info: "Wrong information",
    fake: "Fake business or profile",
    fake_review: "Fake review",
    scam: "Scam or fraud",
    spam: "Spam",
    inappropriate: "Inappropriate",
    other: "Other",
};

const TAKE_DOWN: Record<AdminReport["target_type"], string> = {
    vendor: "Suspend business",
    listing: "Remove product",
    review: "Hide review",
    message: "Close conversation",
};

export default async function AdminReportsPage() {
    const reports = (await authenticatedApiGet<AdminReport[]>("/admin/reports")) ?? [];
    const open = reports.filter((r) => r.status === "open");
    const resolved = reports.filter((r) => r.status !== "open");

    return (
        <AdminShell current="reports">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Reports</h1>
            <p className="mt-1.5 text-[0.9375rem] text-muted">
                Businesses, products, reviews and messages that users flagged. Every decision is recorded in the audit log.
            </p>

            <h2 className="mt-6 text-[1.0625rem] font-semibold">Open ({open.length})</h2>
            {open.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing to review.</p>
            ) : (
                <ul className="mt-3 space-y-3">
                    {open.map((report) => (
                        <li key={report.report_id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full bg-shut-bg px-2 py-0.5 font-semibold text-shut-ink uppercase">
                                    {report.target_type}
                                </span>
                                <span className="font-semibold">{REASONS[report.reason] ?? report.reason}</span>
                                <span className="text-soft">
                                    by {report.reporter_name ?? "a deleted user"} · {formatDateTime(report.created_at)}
                                </span>
                            </div>
                            <p className="mt-2 text-sm font-medium">{report.target_label ?? "(item no longer exists)"}</p>
                            {report.details && <p className="mt-1 text-sm text-muted">“{report.details}”</p>}
                            {report.business_slug && (
                                <Link
                                    href={`/business/${report.business_slug}`}
                                    target="_blank"
                                    className="mt-1 inline-block text-[0.8125rem] font-medium text-brand-600 hover:underline"
                                >
                                    Open business page
                                </Link>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <ActionButton
                                    action={resolveReport.bind(null, report.report_id, "take_down")}
                                    label={TAKE_DOWN[report.target_type]}
                                    tone="danger"
                                    confirm={`${TAKE_DOWN[report.target_type]}? This takes it off the public site.`}
                                />
                                <ActionButton action={resolveReport.bind(null, report.report_id, "dismiss")} label="Dismiss" />
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <h2 className="mt-8 text-[1.0625rem] font-semibold">Resolved in the last 30 days</h2>
            {resolved.length === 0 ? (
                <p className="mt-2 text-sm text-muted">None.</p>
            ) : (
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface shadow-card">
                    {resolved.map((report) => (
                        <li key={report.report_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                            <span>
                                <span className="font-medium">{report.target_label ?? report.target_type}</span>{" "}
                                <span className="text-muted">({REASONS[report.reason] ?? report.reason})</span>
                            </span>
                            <span className="text-xs text-soft">
                                {report.status === "actioned" ? "Taken down" : "Dismissed"} by {report.resolver_name ?? "admin"}
                                {report.resolved_at ? ` · ${formatDateTime(report.resolved_at)}` : ""}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </AdminShell>
    );
}
