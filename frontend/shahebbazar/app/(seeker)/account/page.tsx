import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Bookmark, Building2, ChevronRight, MessagesSquare, Star, UserRound } from "lucide-react";
import { AccountShell } from "@/components/customer/AccountShell";
import { authenticatedApiGet } from "@/lib/auth-server";
import { formatDateTime } from "@/lib/format";
import type { AuthUser } from "@/lib/auth-client";
import type { AlertList, Customer } from "@/lib/types";
import { markMyAlertsRead } from "../actions";

export const metadata: Metadata = {
    title: "My account",
};

export default async function AccountPage() {
    const [me, alerts, session] = await Promise.all([
        authenticatedApiGet<Customer>("/me"),
        authenticatedApiGet<AlertList>("/me/alerts"),
        authenticatedApiGet<{ user: AuthUser }>("/auth/me"),
    ]);
    const isVendor = session?.user.user_role === "vendor";

    if (!me) {
        return (
            <AccountShell current="overview" title="My account">
                <p className="text-sm text-muted">No customer account exists yet.</p>
            </AccountShell>
        );
    }

    const cards = [
        { href: "/account/saved", label: "Saved businesses", value: me.saved_count, Icon: Bookmark },
        { href: "/account/messages", label: "Unread messages", value: me.unread_messages, Icon: MessagesSquare },
        { href: "/account/reviews", label: "Reviews written", value: me.review_count, Icon: Star },
    ];

    return (
        <AccountShell current="overview" title={`Hello, ${me.user_name}`}>
            <p className="text-sm text-muted">
                {me.user_phone}
                {me.user_email ? ` · ${me.user_email}` : ""}
                {" · "}
                <Link href="/account/details" className="font-medium text-brand-600 hover:underline">
                    Edit my details
                </Link>
            </p>

            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                {cards.map(({ href, label, value, Icon }) => (
                    <li key={href}>
                        <Link
                            href={href}
                            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card hover:border-brand-200"
                        >
                            <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                                <Icon className="size-5" />
                            </span>
                            <span>
                                <span className="block text-xl font-bold">{value}</span>
                                <span className="block text-[0.8125rem] text-muted">{label}</span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>

            {!me.user_email && (
                <Link
                    href="/account/details#email"
                    className="mt-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 hover:border-brand-300"
                >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-brand-600">
                        <UserRound className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">Add an email address</span>
                        <span className="block text-[0.8125rem] text-muted">
                            Optional. Lets businesses you choose send you offers by email.
                        </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-soft" />
                </Link>
            )}

            {/* Customers can become providers from here (KAN-249). */}
            <Link
                href={isVendor ? "/vendors/dashboard" : "/vendors/register"}
                className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card hover:border-brand-200"
            >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <Building2 className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                        {isVendor ? "Go to your business dashboard" : "Do you run a business? Register it"}
                    </span>
                    <span className="block text-[0.8125rem] text-muted">
                        {isVendor
                            ? "Manage your listings, messages and reviews."
                            : "It is added to this account. You keep everything you have here."}
                    </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-soft" />
            </Link>

            <section className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold">
                        <Bell className="size-4" /> Alerts
                        {alerts && alerts.unread > 0 && (
                            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[0.6875rem] text-white">
                                {alerts.unread} new
                            </span>
                        )}
                    </h2>
                    {alerts && alerts.unread > 0 && (
                        <form action={markMyAlertsRead}>
                            <button type="submit" className="text-[0.8125rem] font-medium text-brand-600 hover:underline">
                                Mark all as read
                            </button>
                        </form>
                    )}
                </div>
                {!alerts || alerts.alerts.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">No alerts yet.</p>
                ) : (
                    <ul className="mt-3 divide-y divide-line">
                        {alerts.alerts.map((alert) => (
                            <li key={alert.id} className="py-2.5">
                                <Link
                                    href={`/account/messages/${alert.payload.conversation_id}`}
                                    className={`block text-sm hover:text-brand-600 ${alert.read_at ? "text-muted" : "font-semibold"}`}
                                >
                                    New message from {alert.payload.from}: “{alert.payload.preview}”
                                </Link>
                                <span className="text-xs text-soft">{formatDateTime(alert.created_at)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </AccountShell>
    );
}
