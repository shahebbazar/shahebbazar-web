import Link from "next/link";
import type { AuthUser } from "@/lib/auth-client";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { VendorPickerRow } from "@/lib/types";
import { AccountSwitcher, AccountSwitcherList } from "@/components/shared/AccountSwitcher";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { AccountMenuExtras } from "./AccountMenuExtras";
import { LogoutButton } from "./LogoutButton";

type AuthMeResponse = {
    authenticated: true;
    user: AuthUser;
};

type SessionControlsProps = {
    variant?: "header" | "menu";
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
}: SessionControlsProps) {
    const session = await authenticatedApiGet<AuthMeResponse>("/auth/me");

    if (!session) {
        return (
            <div className={variant === "menu" ? "grid grid-cols-2 gap-2" : "flex items-center gap-3"}>
                {variant === "header" && (
                    <div className="hidden lg:block">
                        <ThemeSelector />
                    </div>
                )}
                <Link href="/login" className={OUTLINE}>
                    Log in
                </Link>
                <Link href="/register" className={PRIMARY}>
                    Register
                </Link>
            </div>
        );
    }

    if (session.user.user_role === "admin") {
        return (
            <div className={variant === "menu" ? "grid grid-cols-2 gap-2" : "flex items-center gap-3"}>
                {variant === "header" && <ThemeSelector />}
                <Link href="/admin" className={OUTLINE}>
                    Admin dashboard
                </Link>
                <LogoutButton />
            </div>
        );
    }

    const businesses =
        session.user.user_role === "vendor"
            ? ((await authenticatedApiGet<VendorPickerRow[]>("/vendor-account/businesses")) ?? [])
            : [];

    if (variant === "menu") {
        return (
            <div className="space-y-3">
                <AccountSwitcherList side={{ kind: "customer" }} businesses={businesses} avatarUrl={session.user.user_avatar_url} />
                <LogoutButton />
            </div>
        );
    }

    return (
        <AccountSwitcher
            userName={session.user.user_name}
            avatarUrl={session.user.user_avatar_url}
            side={{ kind: "customer" }}
            businesses={businesses}
            extras={<AccountMenuExtras />}
        />
    );
}
