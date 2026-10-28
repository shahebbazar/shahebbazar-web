import Link from "next/link";
import { Bell } from "lucide-react";
import { formatDateTime, localiseDigits } from "@/lib/format";
import { fill, type Locale } from "@/lib/i18n";
import { providerText } from "@/lib/i18n-provider";
import type { AlertList } from "@/lib/types";
import { markOwnerAlertsRead } from "@/app/(provider)/vendors/dashboard/owner-actions";
import { Panel } from "./DashboardCards";
import { providerHref } from "./ProviderShell";

export function AlertsPanel({ vendorId, alerts, locale = "en" }: { vendorId: number; alerts: AlertList; locale?: Locale }) {
    const copy = providerText(locale);
    const recent = alerts.alerts.slice(0, 5);

    return (
        <Panel
            title={alerts.unread > 0 ? fill(copy.alertsNew, { count: localiseDigits(String(alerts.unread), locale) }) : copy.alertsTitle}
            action={
                alerts.unread > 0 ? (
                    <form action={markOwnerAlertsRead.bind(null, vendorId)}>
                        <button type="submit" className="text-[0.8125rem] font-medium text-brand-600 hover:underline">
                            {copy.alertsMarkRead}
                        </button>
                    </form>
                ) : undefined
            }
        >
            {recent.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                    <Bell className="size-4" /> {copy.alertsNone}
                </p>
            ) : (
                <ul className="divide-y divide-line">
                    {recent.map((alert) => (
                        <li key={alert.id} className="py-2.5">
                            <Link
                                href={providerHref(`/vendors/dashboard/messages/${alert.payload.conversation_id}`, vendorId)}
                                className={`block text-sm hover:text-brand-600 ${alert.read_at ? "text-muted" : "font-semibold"}`}
                            >
                                {fill(copy.alertsMessage, { from: alert.payload.from ?? "", preview: alert.payload.preview ?? "" })}
                            </Link>
                            <span className="text-xs text-soft">{localiseDigits(formatDateTime(alert.created_at), locale)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}
