import Link from "next/link";
import type { AuthUser } from "@/lib/auth-client";
import { authenticatedApiGet } from "@/lib/auth-server";
import { LogoutButton } from "./LogoutButton";

type AuthMeResponse = {
  authenticated: true;
  user: AuthUser;
};

export async function SessionControls() {
  const session = await authenticatedApiGet<AuthMeResponse>("/auth/me");

  if (!session) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-sm font-medium text-muted hover:text-ink transition-colors"
        >
          Log in
        </Link>

        <Link
          href="/register"
          className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 transition-colors"
        >
          Register
        </Link>
      </div>
    );
  }

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

  const role = session.user.user_role;
  const href = destinationByRole[role] ?? "/account";
  const label = labelByRole[role] ?? "My Account";

  return (
    <div className="flex items-center gap-3">
      <div className="hidden leading-tight sm:block text-right">
        <p className="max-w-40 truncate text-sm font-semibold text-ink">
          {session.user.user_name}
        </p>
        <p className="text-xs capitalize text-muted">
          {role}
        </p>
      </div>

      <Link
        href={href}
        className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium shadow-card hover:bg-surface-2 transition-colors"
      >
        {label}
      </Link>

      <LogoutButton />
    </div>
  );
}
