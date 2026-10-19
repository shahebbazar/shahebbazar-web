import Link from "next/link";
import type { AuthUser } from "@/lib/auth-client";
import { authenticatedApiGet } from "@/lib/auth-server";
import { LogoutButton } from "./LogoutButton";

type AuthMeResponse = {
    authenticated: true;
    user: AuthUser;
};

type SessionControlsProps = {
    variant?: "header" | "menu";
};

export async function SessionControls({
    variant = "header",
}: SessionControlsProps) {
    const session = await authenticatedApiGet<AuthMeResponse>("/auth/me");

    // Unauthenticated state
    if (!session) {
        if (variant === "menu") {
            return (
                <div className="grid grid-cols-2 gap-2">
                    <Link href="/login" className="btn btn-outline">
                        Log in
                    </Link>
                    <Link href="/register" className="btn btn-primary">
                        Register
                    </Link>
                </div>
            );
        }

        return (
            <div className="flex items-center gap-3">
                <Link href="/login" className="btn btn-outline">
                    Log in
                </Link>
                <Link href="/register" className="btn btn-primary">
                    Register
                </Link>
            </div>
        );
    }

    // Authenticated state configuration
    const destinationByRole = {
        customer: "/account",
        vendor: "/vendors/dashboard",
        admin: "/admin",
    } as const;

    const labelByRole = {
        customer: "My Account",
        vendor: "Vendor Dashboard",
        admin: "Admin Dashboard",
    } as const;

    // Typecast or fallback to ensure role matching works safely
    const role = session.user.user_role as keyof typeof destinationByRole;
    const href = destinationByRole[role] ?? "/account";
    const label = labelByRole[role] ?? "My Account";

    // Authenticated: Menu Variant
    if (variant === "menu") {
        return (
            <div className="grid grid-cols-2 gap-2">
                <Link href={href} className="btn btn-outline">
                    {label}
                </Link>
                {role === "vendor" && (
                    <Link href="/account" className="btn btn-outline">
                        My Account
                    </Link>
                )}
                <LogoutButton />
            </div>
        );
    }

    // Authenticated: Header Variant (Default)
    return (
        <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight xl:block">
                <p className="max-w-40 truncate text-sm font-semibold text-ink">
                    {session.user.user_name}
                </p>
                <p className="text-xs capitalize text-muted">
                    {role}
                </p>
            </div>

            {/* Vendors keep their customer account too. */}
            {role === "vendor" && (
                <Link href="/account" className="hidden text-sm font-medium text-muted hover:text-ink xl:block">
                    My Account
                </Link>
            )}
            <Link href={href} className="btn btn-outline">
                {label}
            </Link>
            <LogoutButton />
        </div>
    );
}
