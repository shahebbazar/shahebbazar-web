import Link from "next/link";
import { ChartLine, Flag, LayoutGrid, Megaphone, Settings, ShieldCheck, Star, type LucideIcon } from "lucide-react";
import { getAccountLocale } from "@/lib/locale-server";
import { HeaderBar } from "../shared/HeaderBar";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminAccountMenu } from "@/components/auth/SessionControls";

// Page frame for the admin area. The header is the site's shared one, in the chosen language; the
// admin pages themselves are English only.

type Item = { key: string; label: string; Icon: LucideIcon } & ({ href: string } | { soon: true });

const NAV: Item[] = [
    { key: "approvals", label: "Approvals", Icon: ShieldCheck, href: "/admin" },
    { key: "reports", label: "Reports", Icon: Flag, href: "/admin/reports" },
    { key: "reviews", label: "Reviews", Icon: Star, href: "/admin/reviews" },
    { key: "trends", label: "Search trends", Icon: ChartLine, href: "/admin/trends" },
    { key: "categories", label: "Categories", Icon: LayoutGrid, href: "/admin/categories" },
    { key: "marketing", label: "Marketing", Icon: Megaphone, href: "/admin/marketing" },
    { key: "settings", label: "Settings", Icon: Settings, href: "/admin/settings" },
];

export async function AdminShell({
    current,
    userName = "Administrator",
    children,
}: {
    current: string;
    userName?: string;
    children: React.ReactNode;
}) {
    const locale = await getAccountLocale();
    const row = "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-sm";
    const navList = (
        <ul className="space-y-0.5">
            {NAV.map((item) => (
                <li key={item.key}>
                    {"href" in item ? (
                        <Link
                            href={item.href}
                            aria-current={item.key === current ? "page" : undefined}
                            className={`${row} ${item.key === current
                                    ? "bg-brand-50 font-semibold text-brand-600"
                                    : "font-medium text-muted hover:bg-surface-2 hover:text-ink"
                                }`}
                        >
                            <item.Icon className="size-[19px]" strokeWidth={1.75} />
                            {item.label}
                        </Link>
                    ) : (
                        <span aria-disabled="true" className={`${row} font-medium text-soft`}>
                            <item.Icon className="size-[19px]" strokeWidth={1.75} />
                            <span className="flex-1">{item.label}</span>
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-medium text-muted">
                                Soon
                            </span>
                        </span>
                    )}
                </li>
            ))}
        </ul>
    );

    return (
        <div className="flex min-h-screen flex-col">
            <HeaderBar
                locale={locale}
                badge={
                    <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[0.75rem] font-semibold text-brand-700">Admin</span>
                }
                account={<AdminAccountMenu userName={userName} locale={locale} />}
                menuNav={<nav aria-label="Admin">{navList}</nav>}
                menuAccount={
                    <div className="space-y-2">
                        <p className="truncate px-1 text-sm font-semibold">{userName}</p>
                        <LogoutButton locale={locale} />
                    </div>
                }
            />

            <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-6 px-4 py-6 sm:px-6">
                <aside className="hidden w-[236px] shrink-0 lg:block">
                    <nav aria-label="Admin" className="rounded-xl border border-line bg-surface p-2 shadow-card">
                        {navList}
                    </nav>
                </aside>

                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
