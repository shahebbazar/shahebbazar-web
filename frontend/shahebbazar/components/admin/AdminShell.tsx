import Link from "next/link";
import { ChartLine, Flag, LayoutGrid, MapPin, ShieldCheck, Star, type LucideIcon } from "lucide-react";
import { MobileMenu } from "../shared/MobileMenu";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
// Page frame for the admin area.

type Item = { key: string; label: string; Icon: LucideIcon } & ({ href: string } | { soon: true });

const NAV: Item[] = [
    { key: "approvals", label: "Approvals", Icon: ShieldCheck, href: "/admin" },
    { key: "reports", label: "Reports", Icon: Flag, href: "/admin/reports" },
    { key: "reviews", label: "Reviews", Icon: Star, href: "/admin/reviews" },
    { key: "trends", label: "Search trends", Icon: ChartLine, href: "/admin/trends" },
    { key: "categories", label: "Categories", Icon: LayoutGrid, href: "/admin/categories" },
];

export function AdminShell({
    current,
    userName = "Administrator",
    children,
}: {
    current: string;
    userName?: string;
    children: React.ReactNode;
}) {
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
            <header className="sticky top-0 z-40 border-b border-line bg-surface">
                <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
                    <Link href="/" className="flex shrink-0 items-center gap-2">
                        <MapPin className="size-6 fill-brand-600 text-brand-600" strokeWidth={1.5} />
                        <span className="text-xl font-bold tracking-tight text-brand-600 sm:text-[1.35rem]">Shahebbazar</span>
                    </Link>
                    <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[0.75rem] font-semibold text-brand-700">Admin</span>
                        <div className="ml-auto flex items-center gap-3">
                            <div className="hidden lg:block">
                                <ThemeSelector />
                            </div>

                            <div className="hidden leading-tight sm:block">
                            <p className="max-w-40 truncate text-sm font-semibold">
                                {userName}
                            </p>

                            <p className="text-xs text-muted">
                                Administrator
                            </p>
                        </div>

                        <div className="hidden lg:block">
                            <LogoutButton />
                        </div>

                        <MobileMenu>
                            <p className="truncate px-3.5 pb-2 text-sm font-semibold">
                                {userName}
                            </p>

                            <nav aria-label="Admin">
                                {navList}
                            </nav>

                            <div className="mt-3 border-t border-line px-3.5 pt-3">
                                <p className="mb-2 text-[0.75rem] font-medium text-muted">
                                    Appearance
                                </p>

                                <ThemeSelector className="w-full" />
                            </div>

                            <div className="mt-3 border-t border-line px-3.5 pt-3">
                                <LogoutButton />
                            </div>

                        </MobileMenu>
                    </div>
                </div>
            </header>

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
