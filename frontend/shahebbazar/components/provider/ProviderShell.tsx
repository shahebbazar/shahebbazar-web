import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AccountMenuExtras } from "@/components/auth/AccountMenuExtras";
import {
    House,
    MapPin,
    Megaphone,
    MessagesSquare,
    Package,
    Settings,
    Star,
    Store,
    Ticket,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import { authenticatedApiGet } from "@/lib/auth-server";
import { t, type Locale } from "@/lib/i18n";
import { providerText, type ProviderDictionary } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
import type { VendorPickerRow } from "@/lib/types";
import { MobileMenu } from "../shared/MobileMenu";
import { AccountSwitcher, AccountSwitcherList, type AccountSide } from "../shared/AccountSwitcher";
import { LanguageLinks } from "../shared/LanguageLinks";
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
    | "events"
    | "marketing"
    | "settings";

type NavItem = {
    key: string;
    label: keyof ProviderDictionary;
    Icon: LucideIcon;
} & (
        | { path: string; hash?: string }
        // Not built yet. "Soon" is planned for this phase; "Later" was moved
        // to Phase 2 by the client.

        | { path?: undefined; availability: "Soon" | "Later" }
    );

const NAV: NavItem[] = [
    { key: "dashboard", label: "navDashboard", Icon: House, path: "/vendors/dashboard" },
    { key: "business", label: "navBusiness", Icon: Store, path: "/vendors/dashboard/business" },
    { key: "listings", label: "navListings", Icon: Package, path: "/vendors/dashboard/listings" },
    { key: "payments", label: "navPayments", Icon: Wallet, path: "/vendors/dashboard/payment-methods" },
    { key: "reviews", label: "navReviews", Icon: Star, path: "/vendors/dashboard/reviews" },
    { key: "messages", label: "navMessages", Icon: MessagesSquare, path: "/vendors/dashboard/messages" },
    { key: "events", label: "navEvents", Icon: Ticket, path: "/vendors/dashboard/events" },
    { key: "marketing", label: "navMarketing", Icon: Megaphone, path: "/vendors/dashboard/marketing" },
    { key: "settings", label: "navSettings", Icon: Settings, path: "/vendors/dashboard/settings" },
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
    events: "/vendors/dashboard/events",
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
    const businesses = (await authenticatedApiGet<VendorPickerRow[]>("/vendor-account/businesses")) ?? [];
    const locale = await getAccountLocale();
    const copy = providerText(locale);
    const switcher = <AccountSwitcherList side={{ kind: "business", vendorId: vendor.vendor_id }} businesses={businesses} businessPath={PAGE_PATHS[current]} locale={locale} />;

    const navList = (
        <ul className="space-y-0.5">
            {NAV.map((item) => (
                <li key={item.key}>
                    <NavRow item={item} label={copy[item.label]} vendorId={vendor.vendor_id} active={item.key === current} />
                </li>
            ))}
        </ul>
    );

    return (
        // The language is declared here, as in AppShell: the root layout renders <html> without it.
        <div lang={locale} className={`flex min-h-screen flex-col ${locale === "bn" ? "font-bn" : ""}`}>
            <ProviderHeader
                locale={locale}
                userName={vendor.vendor_name}
                side={{ kind: "business", vendorId: vendor.vendor_id }}
                businesses={businesses}
                businessPath={PAGE_PATHS[current]}
                mobileNav={
                    <nav aria-label={copy.navLabel}>
                        {navList}
                    </nav>
                }
                switcher={switcher}
            />

            <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-6 px-4 py-6 sm:px-6">
                <aside className="hidden w-[236px] shrink-0 lg:block">
                    <nav
                        aria-label={copy.navLabel}
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

/**
 * Page frame for "Choose a business": the same header as the dashboard, with the account menu on the
 * owner's customer side, so they can still open a business, their account, the site or log out.
 */
export async function PickerShell({
    userName,
    avatarUrl = null,
    children,
}: {
    userName: string;
    /** The owner's profile photo, for the customer-side account menu. */
    avatarUrl?: string | null;
    children: React.ReactNode;
}) {
    const businesses = (await authenticatedApiGet<VendorPickerRow[]>("/vendor-account/businesses")) ?? [];
    const side = { kind: "customer" } as const;
    const locale = await getAccountLocale();

    return (
        <div lang={locale} className={`flex min-h-screen flex-col ${locale === "bn" ? "font-bn" : ""}`}>
            <ProviderHeader
                locale={locale}
                userName={userName}
                avatarUrl={avatarUrl}
                side={side}
                businesses={businesses}
                businessPath={PAGE_PATHS.dashboard}
                switcher={<AccountSwitcherList side={side} businesses={businesses} businessPath={PAGE_PATHS.dashboard} avatarUrl={avatarUrl} locale={locale} />}
            />
            {children}
        </div>
    );
}

function ProviderHeader({
    locale,
    userName,
    avatarUrl = null,
    side,
    businesses,
    businessPath,
    mobileNav,
    switcher,
}: {
    locale: Locale;
    userName: string;
    avatarUrl?: string | null;
    side: AccountSide;
    businesses: VendorPickerRow[];
    businessPath: string;
    mobileNav?: React.ReactNode;
    switcher: React.ReactNode;
}) {
    return (
        <header className="sticky top-0 z-40 border-b border-line bg-surface">
            <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
                <Link href="/" className="flex shrink-0 items-center gap-2">
                    <MapPin className="size-6 fill-brand-600 text-brand-600" strokeWidth={1.5} />
                    <span className="text-xl font-bold tracking-tight text-brand-600 sm:text-[1.35rem]">
                        {t(locale).brand}
                    </span>
                </Link>

                <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
                    <nav aria-label="Language" className="hidden items-center gap-2 text-[0.8125rem] md:flex">
                        <LanguageLinks locale={locale} variant="header" />
                    </nav>

                    {/* The theme and Log out are in the account menu. */}
                    <AccountSwitcher
                        locale={locale}
                        userName={userName}
                        avatarUrl={avatarUrl}
                        side={side}
                        businesses={businesses}
                        businessPath={businessPath}
                        extras={<AccountMenuExtras locale={locale} />}
                    />

                    {/* Mobile navigation and logout */}
                    <MobileMenu locale={locale}>
                        {mobileNav}

                        <div className={mobileNav ? "mt-3 border-t border-line pt-3" : ""}>
                            {switcher}
                        </div>

                        <div className="mt-3 border-t border-line px-3.5 pt-3">
                            <p className="mb-2 text-[0.75rem] font-medium text-muted">
                                {t(locale).appearance}
                            </p>

                            <ThemeSelector className="w-full" locale={locale} />
                        </div>

                        <nav aria-label="Language" className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm font-medium">
                            <LanguageLinks locale={locale} variant="menu" />
                        </nav>

                        <div className="mt-3 border-t border-line px-3.5 pt-3">
                            <LogoutButton locale={locale} />
                        </div>
                    </MobileMenu>
                </div>
            </div>
        </header>
    );
}

function NavRow({ item, label, vendorId, active }: { item: NavItem; label: string; vendorId: number; active: boolean }) {
    const { Icon } = item;
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
