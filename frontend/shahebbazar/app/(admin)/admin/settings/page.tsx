import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { AdminSettings } from "@/lib/types";
import { SettingNumber } from "./SettingNumber";
import { SettingToggle } from "./SettingToggle";

export const metadata: Metadata = {
    title: "Settings",
};

// Approval settings (KAN-293, client feedback 20 October 2026) and what the free Marketing plan includes (KAN-286).
export default async function AdminSettingsPage() {
    const data = await authenticatedApiGet<AdminSettings>("/admin/settings");
    // Null when the session ended after the layout checked it.
    if (!data) redirect("/admin/login");

    const events = data.waiting.events ?? 0;
    const waiting = data.waiting.businesses + data.waiting.listings + events;

    return (
        <AdminShell current="settings">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Settings</h1>
            <p className="mt-1.5 text-[0.9375rem] text-muted">
                Choose whether new businesses and new products or services need an admin&apos;s approval before they appear on
                the public site, and what the free Marketing plan includes. Every change is recorded in the audit log.
            </p>

            <section aria-label="Approval" className="mt-6 max-w-3xl divide-y divide-line rounded-xl border border-line bg-surface shadow-card">
                {data.settings
                    .filter((setting) => setting.group === "approval")
                    .map((setting) => (
                        <SettingToggle key={setting.key} setting={setting} />
                    ))}
            </section>

            {waiting > 0 && (
                <p className="mt-4 max-w-3xl rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
                    Turning approval off doesn&apos;t approve anything already waiting: {data.waiting.businesses}{" "}
                    {data.waiting.businesses === 1 ? "business" : "businesses"}, {data.waiting.listings}{" "}
                    {data.waiting.listings === 1 ? "listing" : "listings"} and {events} {events === 1 ? "event" : "events"} are
                    still in{" "}
                    <Link href="/admin" className="font-medium text-brand-600 hover:underline">
                        Approvals
                    </Link>
                    .
                </p>
            )}

            <h2 className="mt-8 text-lg font-semibold">Marketing</h2>
            <section aria-label="Marketing" className="mt-3 max-w-3xl divide-y divide-line rounded-xl border border-line bg-surface shadow-card">
                {data.settings
                    .filter((setting) => setting.group === "marketing")
                    .map((setting) =>
                        setting.type === "integer" ? (
                            <SettingNumber key={setting.key} setting={setting} />
                        ) : (
                            <SettingToggle key={setting.key} setting={setting} />
                        )
                    )}
            </section>
        </AdminShell>
    );
}
