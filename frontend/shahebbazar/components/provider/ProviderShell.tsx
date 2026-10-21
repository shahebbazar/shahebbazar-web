import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import {
    CalendarDays,
    ChevronDown,
    House,
    MapPin,
    Megaphone,
    MessagesSquare,
    Package,
    Plus,
    Settings,
    Star,
    Store,
    UserRound,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import { authenticatedApiGet } from "@/lib/auth-server";
import { switchHref } from "@/lib/activeBusiness";
import type { VendorPickerRow } from "@/lib/types";
import { MobileMenu } from "../shared/MobileMenu";
import { ThemeSelector } from "@/components/theme/ThemeSelector";

// Page frame for the provider area: header, navigation rail and content.

export type ProviderNavKey =
    | "dashboard"
    | "business"
    | "listings"
    | "payments"
    | "inquiries"
    | "reviews"
    | "messages"
    | "marketing"
    | "settings";

type NavItem = {
    key: string;
    label: string;
    Icon: LucideIcon;
} & (
        | { path: string; hash?: string }
        // Not built yet. "Soon" is planned for this phase; "Later" was moved
        // to Phase 2 by the client.

        | { path?: undefined; availability: "Soon" | "Later" }
    );

const NAV: NavItem[] = [
    { key: "dashboard", label: "Dashboard", Icon: House, path: "/vendors/dashboard" },
    { key: "business", label: "My Business", Icon: Store, path: "/vendors/dashboard/business" },
    { key: "listings", label: "Products & Services", Icon: Package, path: "/vendors/dashboard/listings" },
    { key: "payments", label: "Payment Methods", Icon: Wallet, path: "/vendors/dashboard/payment-methods" },
    { key: "reviews", label: "Reviews", Icon: Star, path: "/vendors/dashboard/reviews" },
    { key: "messages", label: "Messages", Icon: MessagesSquare, path: "/vendors/dashboard/messages" },
    { key: "bookings", label: "Bookings", Icon: CalendarDays, availability: "Later" },
    { key: "marketing", label: "Marketing", Icon: Megaphone, path: "/vendors/dashboard/marketing" },
    { key: "settings", label: "Settings", Icon: Settings, path: "/vendors/dashboard/settings" },
];


export function parseVendorParam(
    raw: string | string[] | undefined
): number | null {
    if (typeof raw !== "string" || !/^\d{1,10}$/.test(raw)) {
        return null;
    }

    const id = Number(raw);
    return id > 0 && id <= 2147483647 ? id : null;
}


export function providerHref(
    path: string,
    vendorId: number,
    hash?: string
): string {
    return `${path}?vendor=${vendorId}${hash ? `#${hash}` : ""}`;
}


/** "SB-000042": the id the design shows in the header, zero-padded. */
export function businessCode(vendorId: number): string {
    return `SB-${String(vendorId).padStart(6, "0")}`;
}

const PAGE_PATHS: Record<ProviderNavKey, string> = {
    dashboard: "/vendors/dashboard",
    business: "/vendors/dashboard/business",
    listings: "/vendors/dashboard/listings",
    payments: "/vendors/dashboard/payment-methods",
    inquiries: "/vendors/dashboard/inquiries",
    reviews: "/vendors/dashboard/reviews",
    messages: "/vendors/dashboard/messages",
    marketing: "/vendors/dashboard/marketing",
    settings: "/vendors/dashboard/settings",
};

export async function ProviderShell({
    vendor,
    current,
    children,
}: {
    vendor: { vendor_id: number; vendor_name: string };
    current: ProviderNavKey;
    children: React.ReactNode;
}) {
    const initial = vendor.vendor_name.trim().charAt(0).toUpperCase() || "?";
    const businesses = (await authenticatedApiGet<VendorPickerRow[]>("/vendor-account/businesses")) ?? [];
    const role = businesses.find((b) => b.vendor_id === vendor.vendor_id)?.member_role;
    const switcher = <BusinessList businesses={businesses} activeId={vendor.vendor_id} path={PAGE_PATHS[current]} />;

    const navList = (
        <ul className="space-y-0.5">
            {NAV.map((item) => (
                <li key={item.key}>
                    <NavRow item={item} vendorId={vendor.vendor_id} active={item.key === current} />
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
                        <span className="text-xl font-bold tracking-tight text-brand-600 sm:text-[1.35rem]">
                            Shahebbazar
                        </span>
                    </Link>

                        <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
                            <div className="hidden lg:block">
                                <ThemeSelector />
                            </div>

                        <details className="group relative min-w-0">
                            <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2.5 rounded-[10px] px-1.5 py-1 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                                <span
                                    aria-hidden
                                    className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
                                >
                                    {initial}
                                </span>

                                <span className="hidden min-w-0 leading-tight min-[420px]:block">
                                    <span className="block truncate text-sm font-semibold">
                                        {vendor.vendor_name}
                                    </span>
                                    <span className="block text-[0.75rem] text-muted">
                                        {role === "manager" ? "Manager" : "Business owner"}
                                    </span>
                                </span>
                                <ChevronDown className="hidden size-4 shrink-0 text-soft transition-transform group-open:rotate-180 lg:block" />
                            </summary>

                            {/* Business switcher (KAN-251) */}
                            <div className="absolute right-0 z-50 mt-2 hidden w-72 rounded-xl border border-line bg-surface p-2 shadow-raised lg:block">
                                {switcher}
                            </div>
                        </details>

                        {/* Desktop logout */}
                        <div className="hidden lg:block">
                            <LogoutButton />
                        </div>

                        {/* Mobile navigation and logout */}
                        <MobileMenu>
                            <nav aria-label="Provider">
                                {navList}
                            </nav>

                            <div className="mt-3 border-t border-line pt-3">
                                {switcher}
                            </div>

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
                    <nav
                        aria-label="Provider"
                        className="rounded-xl border border-line bg-surface p-2 shadow-card"
                    >
                        {navList}
                    </nav>
                </aside>

                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}

function NavRow({ item, vendorId, active }: { item: NavItem; vendorId: number; active: boolean }) {
    const { Icon, label } = item;
    const rowClasses = "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-sm font-medium transition-colors";

    if (item.path === undefined) {
        return (
            <div
                aria-disabled="true"
                className={`${rowClasses} cursor-default text-soft justify-between bg-transparent`}
            >
                <div className="flex items-center gap-3">
                    <Icon className="size-4 shrink-0" />
                    <span>{label}</span>
                </div>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted border border-line">
                    {item.availability}
                </span>
            </div>
        );
    }

    return (
        <Link
            href={providerHref(item.path, vendorId, item.hash)}
            className={`${rowClasses} ${active
                ? "bg-brand-50 text-brand-700"
                : "text-muted hover:bg-surface-2 hover:text-ink"
                }`}
        >
            <Icon className={`size-4 shrink-0 ${active ? "text-brand-600" : ""}`} />
            <span>{label}</span>
        </Link>
    );
}

// The businesses this vendor runs, plus ways to add another or use their customer account.
function BusinessList({
    businesses,
    activeId,
    path,
}: {
    businesses: VendorPickerRow[];
    activeId: number;
    path: string;
}) {
    const row = "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-sm font-medium";

    return (
        <div>
            {businesses.length > 1 && (
                <>
                    <p className="px-3.5 pb-1 text-[0.75rem] font-medium text-muted">Your businesses</p>
                    <ul className="space-y-0.5">
                        {businesses.map((b) => (
                            <li key={b.vendor_id}>
                                <Link
                                    href={switchHref(b.vendor_id, path)}
                                    aria-current={b.vendor_id === activeId ? "true" : undefined}
                                    className={`${row} ${b.vendor_id === activeId ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
                                >
                                    <Store className="size-4 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">{b.vendor_name}</span>
                                    {b.member_role === "manager" && <span className="text-[0.6875rem] text-soft">Manager</span>}
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <div className="my-2 border-t border-line" />
                </>
            )}
            <Link href="/vendors/register" className={`${row} text-muted hover:bg-surface-2 hover:text-ink`}>
                <Plus className="size-4 shrink-0" />
                Register another business
            </Link>
            <Link href="/account" className={`${row} text-muted hover:bg-surface-2 hover:text-ink`}>
                <UserRound className="size-4 shrink-0" />
                My customer account
            </Link>
        </div>
    );
}
