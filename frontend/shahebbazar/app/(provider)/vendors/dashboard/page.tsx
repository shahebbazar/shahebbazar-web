import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { AuthUser } from "@/lib/auth-client";
import { ACTIVE_BUSINESS_COOKIE, switchHref } from "@/lib/activeBusiness";
import type {
    AlertList,
    DashboardPeriod,
    VendorDashboard,
    VendorPickerRow,
} from "@/lib/types";
import { AlertsPanel } from "@/components/provider/AlertsPanel";
import {
    PickerShell,
    ProviderShell,
    businessCode,
    parseVendorParam,
    providerHref,
} from "@/components/provider/ProviderShell";
import {
    BusinessPreview,
    Change,
    ListingsPreview,
    Panel,
    QuickActions,
    StatCards,
} from "@/components/provider/DashboardCards";
import { StatusBadge } from "@/components/provider/StatusBadge";
import { TrendChart } from "@/components/provider/TrendChart";

// Provider dashboard, built to UIs/…18.25.27 (2).jpeg.

export const metadata: Metadata = {
    title: "Provider dashboard",
};

const PERIODS: DashboardPeriod[] = [7, 30, 90];

type Query = { vendor?: string; days?: string };

export default async function ProviderDashboardPage({
    searchParams,
}: {
    searchParams: Promise<Query>;
}) {
    const query = await searchParams;
    // The picker is restricted to businesses owned by the signed-in vendor.
    const vendorId = parseVendorParam(query.vendor);
    if (vendorId === null) {
        const vendors =
            (await authenticatedApiGet<VendorPickerRow[]>(
                "/vendor-account/businesses"
            )) ?? [];

        const [onlyVendor] = vendors;

        if (vendors.length === 1 && onlyVendor) {
            redirect(providerHref("/vendors/dashboard", onlyVendor.vendor_id));
        }

        // Reopen the business they last worked on, if they still run it.
        const remembered = Number((await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value);
        if (vendors.some((v) => v.vendor_id === remembered)) {
            redirect(providerHref("/vendors/dashboard", remembered));
        }

        const session = await authenticatedApiGet<{ user: AuthUser }>("/auth/me");
        return (
            <PickerShell userName={session?.user.user_name ?? ""} avatarUrl={session?.user.user_avatar_url}>
                <BusinessPicker vendors={vendors} />
            </PickerShell>
        );
    }
    const requested = Number(query.days);
    const days = PERIODS.find((p) => p === requested) ?? 30;

    const [data, alerts] = await Promise.all([
        authenticatedApiGet<VendorDashboard>(
            `/vendors/${vendorId}/dashboard?days=${days}`
        ),
        authenticatedApiGet<AlertList>(`/vendors/${vendorId}/alerts`).catch(
            () => null
        ),
    ]);
    if (!data) notFound();

    const { vendor } = data;

    return (
        <ProviderShell vendor={vendor} current="dashboard">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">
                        Provider Dashboard
                    </h1>
                    <p className="mt-1.5 text-[0.9375rem] text-muted">
                        Manage your business profile, services and track your performance.
                    </p>
                </div>
                <p className="rounded-[10px] border border-brand-200 bg-surface px-4 py-2 text-[0.875rem] font-medium text-brand-600">
                    Business ID: {businessCode(vendor.vendor_id)}
                </p>
            </div>

            <StatusNotice vendor={vendor} />

            <div className="mt-6">
                <StatCards data={data} />
            </div>

            {alerts && (
                <div className="mt-6">
                    <AlertsPanel vendorId={vendor.vendor_id} alerts={alerts} />
                </div>
            )}

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <BusinessPreview data={data} />
                <AnalyticsOverview data={data} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <ListingsPreview data={data} />
                <QuickActions data={data} />
            </div>
        </ProviderShell>
    );
}

/** Explains why a business that is not approved does not appear publicly. */
function StatusNotice({ vendor }: { vendor: VendorDashboard["vendor"] }) {
    const messages: Partial<Record<VendorDashboard["vendor"]["vendor_status"], string>> = {
        pending:
            "Your business is awaiting approval. It will appear in search and on its public page once an administrator approves it.",
        draft: "Your business is a draft. Submit it for approval to make it public.",
        rejected: "Your business was not approved, so it is not public.",
        suspended: "Your business has been suspended and is hidden from customers.",
    };
    const message = messages[vendor.vendor_status];
    if (!message) return null;

    const isProblem =
        vendor.vendor_status === "rejected" || vendor.vendor_status === "suspended";

    return (
        <div
            role="status"
            className={`mt-5 rounded-xl p-4 text-[0.875rem] leading-relaxed ${isProblem
                    ? "bg-error-bg text-error-ink"
                    : "bg-sponsor-bg text-sponsor-ink"
                }`}
        >
            <p>{message}</p>
            {vendor.vendor_rejection_reason && (
                <p className="mt-1">
                    <span className="font-semibold">Reason:</span>{" "}
                    {vendor.vendor_rejection_reason}
                </p>
            )}
        </div>
    );
}

function AnalyticsOverview({ data }: { data: VendorDashboard }) {
    const { vendor, stats, days } = data;

    return (
        <Panel
            id="analytics"
            title="Analytics Overview"
            action={
                <nav
                    aria-label="Period"
                    className="flex rounded-[10px] border border-line-strong p-0.5"
                >
                    {PERIODS.map((p) => (
                        <Link
                            key={p}
                            href={`${providerHref(
                                "/vendors/dashboard",
                                vendor.vendor_id
                            )}&days=${p}#analytics`}
                            aria-current={p === days ? "true" : undefined}
                            scroll={false}
                            className={`rounded-lg px-2.5 py-1 text-[0.75rem] font-medium whitespace-nowrap ${p === days
                                    ? "bg-brand-50 text-brand-600"
                                    : "text-muted hover:text-ink"
                                }`}
                        >
                            {p} days
                        </Link>
                    ))}
                </nav>
            }
        >
            {/* Keyed so a new period starts with no day selected. */}
            <TrendChart key={days} series={data.series} />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(
                    [
                        ["Profile Views", stats.profileViews],
                        ["Search Appearances", stats.searchAppearances],
                    ] as const
                ).map(([label, count]) => (
                    <div key={label} className="rounded-lg border border-line p-4">
                        <p className="text-[0.8125rem] text-muted">{label}</p>
                        <p className="mt-1 flex items-baseline gap-2">
                            <span className="text-[1.375rem] font-bold tabular-nums">
                                {count.current.toLocaleString("en-US")}
                            </span>
                            <span className="text-[0.8125rem]">
                                <Change count={count} />
                            </span>
                        </p>
                    </div>
                ))}
            </div>

            <p className="mt-3 text-[0.75rem] text-soft">
                Search appearances count the first page of results for typed searches.
            </p>
        </Panel>
    );
}

// A simple page that lists the businesses connected to the signed-in provider account.
function BusinessPicker({ vendors }: { vendors: VendorPickerRow[] }) {
    return (
        <main className="mx-auto w-full max-w-xl px-4 py-12">
            <h1 className="text-[1.5rem] font-bold tracking-tight">
                Choose a business
            </h1>

            <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
                Choose which of your businesses you want to manage.
            </p>

            {vendors.length === 0 ? (
                <p className="form-status-error mt-6">
                    No businesses are connected to this vendor account.
                </p>
            ) : (
                <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                    {vendors.map((vendor) => (
                        <li key={vendor.vendor_id}>
                            <Link
                                href={switchHref(vendor.vendor_id)}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                            >
                                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                                    {vendor.vendor_name}
                                </span>

                                {vendor.member_role === "manager" && (
                                    <span className="text-[0.75rem] text-muted">Manager</span>
                                )}

                                <StatusBadge status={vendor.vendor_status} />

                                <ChevronRight className="size-4 shrink-0 text-soft" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
