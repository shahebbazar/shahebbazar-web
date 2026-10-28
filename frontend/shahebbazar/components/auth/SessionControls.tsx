import Link from "next/link";
import type { AuthUser } from "@/lib/auth-client";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { VendorPickerRow } from "@/lib/types";
import { fill, localeHref, t, type Locale } from "@/lib/i18n";
import { AccountMenu, AccountSwitcher, AccountSwitcherList } from "@/components/shared/AccountSwitcher";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { AccountMenuExtras } from "./AccountMenuExtras";
import { LogoutButton } from "./LogoutButton";

type AuthMeResponse = {
    authenticated: true;
    user: AuthUser;
};

type SessionControlsProps = {
    variant?: "header" | "menu";
    locale?: Locale;
};

const OUTLINE =
    "inline-flex items-center justify-center rounded-[10px] border border-line-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface-2";
const PRIMARY =
    "inline-flex items-center justify-center rounded-[10px] bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700";

// The public site is the customer side. Customers and business owners get the account switcher
// (the same one as the business dashboard): it shows the customer account as current and lists each
// business they run, so they can switch to it. Admins get a link to the admin area.
export async function SessionControls({
    variant = "header",
    locale = "en",
}: SessionControlsProps) {
    const copy = t(locale);
    const session = await authenticatedApiGet<AuthMeResponse>("/auth/me");

    // Signed out there is no account menu to hold the theme, so it sits beside Log in on laptops.
    if (!session) {
        return (
            <div className={variant === "menu" ? "grid grid-cols-2 gap-2" : "flex items-center gap-3"}>
                {variant === "header" && (
                    <div className="hidden lg:block">
                        <ThemeSelector locale={locale} />
                    </div>
                )}
                <Link href={localeHref("/login", locale)} className={OUTLINE}>
                    {copy.logIn}
                </Link>
                <Link href={localeHref("/register", locale)} className={PRIMARY}>
                    {copy.register}
                </Link>
            </div>
        );
    }

    if (session.user.user_role === "admin") {
        const adminLink = (
            <Link href="/admin" className="block rounded-[10px] px-3.5 py-2.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink">
                {copy.accountAdminDashboard}
            </Link>
        );
        if (variant === "menu") {
            return (
                <div className="space-y-3">
                    {adminLink}
                    <LogoutButton locale={locale} />
                </div>
            );
        }
        return <AdminAccountMenu userName={session.user.user_name} locale={locale}>{adminLink}</AdminAccountMenu>;
    }

    const businesses =
        session.user.user_role === "vendor"
            ? ((await authenticatedApiGet<VendorPickerRow[]>("/vendor-account/businesses")) ?? [])
            : [];

    if (variant === "menu") {
        return (
            <div className="space-y-3">
                <AccountSwitcherList userName={session.user.user_name} side={{ kind: "customer" }} businesses={businesses} avatarUrl={session.user.user_avatar_url} locale={locale} />
                <LogoutButton locale={locale} />
            </div>
        );
    }

    return (
        <AccountSwitcher
            userName={session.user.user_name}
            avatarUrl={session.user.user_avatar_url}
            side={{ kind: "customer" }}
            businesses={businesses}
            extras={<AccountMenuExtras locale={locale} />}
            locale={locale}
        />
    );
}

/** An administrator's account menu: their name, then `children` (the admin links), theme and Log out. */
export function AdminAccountMenu({ userName, locale = "en", children }: { userName: string; locale?: Locale; children?: React.ReactNode }) {
    const copy = t(locale);
    return (
        <AccountMenu
            name={userName}
            role={copy.accountRoleAdmin}
            label={fill(copy.accountMenuLabel, { name: userName, role: copy.accountRoleAdmin })}
            extras={<AccountMenuExtras locale={locale} />}
        >
            {children}
        </AccountMenu>
    );
}
