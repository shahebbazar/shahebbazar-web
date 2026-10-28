import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { AuthUser } from "@/lib/auth-client";
import { ACTIVE_BUSINESS_COOKIE, switchHref } from "@/lib/activeBusiness";
import { localiseDigits } from "@/lib/format";
import { fill, t, type Locale } from "@/lib/i18n";
import { providerText } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
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
    const locale = await getAccountLocale();
    const copy = providerText(locale);
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
                <BusinessPicker vendors={vendors} locale={locale} />
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
                        {copy.dashTitle}
                    </h1>
                    <p className="mt-1.5 text-[0.9375rem] text-muted">
                        {copy.dashIntro}
                    </p>
                </div>
                <p className="rounded-[10px] border border-brand-200 bg-surface px-4 py-2 text-[0.875rem] font-medium text-brand-600">
                    {fill(copy.businessId, { code: localiseDigits(businessCode(vendor.vendor_id), locale) })}
                </p>
            </div>

            <StatusNotice vendor={vendor} locale={locale} />

            <div className="mt-6">
                <StatCards data={data} locale={locale} />
            </div>

            {alerts && (
                <div className="mt-6">
                    <AlertsPanel vendorId={vendor.vendor_id} alerts={alerts} locale={locale} />
                </div>
            )}

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <BusinessPreview data={data} locale={locale} />
                <AnalyticsOverview data={data} locale={locale} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <ListingsPreview data={data} locale={locale} />
                <QuickActions data={data} locale={locale} />
            </div>
        </ProviderShell>
    );
}

/** Explains why a business that is not approved does not appear publicly. */
function StatusNotice({ vendor, locale }: { vendor: VendorDashboard["vendor"]; locale: Locale }) {
    const copy = providerText(locale);
    const messages: Partial<Record<VendorDashboard["vendor"]["vendor_status"], string>> = {
        pending: copy.statusPending,
        draft: copy.statusDraft,
        rejected: copy.statusRejected,
        suspended: copy.statusSuspended,
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
                    <span className="font-semibold">{copy.reason}</span>{" "}
                    {vendor.vendor_rejection_reason}
                </p>
            )}
        </div>
    );
}

function AnalyticsOverview({ data, locale }: { data: VendorDashboard; locale: Locale }) {
    const copy = providerText(locale);
    const { vendor, stats, days } = data;

    return (
        <Panel
            id="analytics"
            title={copy.analyticsTitle}
            action={
                <nav
                    aria-label={copy.periodLabel}
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
                            {fill(copy.periodDays, { days: localiseDigits(String(p), locale) })}
                        </Link>
                    ))}
                </nav>
            }
        >
            {/* Keyed so a new period starts with no day selected. */}
            <TrendChart key={days} series={data.series} locale={locale} />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(
                    [
                        [copy.profileViews, stats.profileViews],
                        [copy.searchAppearances, stats.searchAppearances],
                    ] as const
                ).map(([label, count]) => (
                    <div key={label} className="rounded-lg border border-line p-4">
                        <p className="text-[0.8125rem] text-muted">{label}</p>
                        <p className="mt-1 flex items-baseline gap-2">
                            <span className="text-[1.375rem] font-bold tabular-nums">
                                {localiseDigits(count.current.toLocaleString("en-US"), locale)}
                            </span>
                            <span className="text-[0.8125rem]">
                                <Change count={count} locale={locale} />
                            </span>
                        </p>
                    </div>
                ))}
            </div>

            <p className="mt-3 text-[0.75rem] text-soft">
                {copy.searchNote}
            </p>
        </Panel>
    );
}

// A simple page that lists the businesses connected to the signed-in provider account.
function BusinessPicker({ vendors, locale }: { vendors: VendorPickerRow[]; locale: Locale }) {
    const copy = providerText(locale);
    return (
        <main className="mx-auto w-full max-w-xl px-4 py-12">
            <h1 className="text-[1.5rem] font-bold tracking-tight">
                {copy.chooseTitle}
            </h1>

            <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
                {copy.chooseIntro}
            </p>

            {vendors.length === 0 ? (
                <p className="form-status-error mt-6">
                    {copy.chooseNone}
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
                                    <span className="text-[0.75rem] text-muted">{t(locale).accountRoleManager}</span>
                                )}

                                <StatusBadge status={vendor.vendor_status} locale={locale} />

                                <ChevronRight className="size-4 shrink-0 text-soft" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
