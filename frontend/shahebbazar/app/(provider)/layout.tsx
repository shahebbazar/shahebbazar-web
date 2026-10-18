import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth-client";
import { authenticatedApiGet } from "@/lib/auth-server";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type AuthMeResponse = {
  authenticated: true;
  user: AuthUser;
};

export default async function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await authenticatedApiGet<AuthMeResponse>("/auth/me");

  if (!session) {
    redirect("/login");
  }

  if (session.user.user_role === "customer") {
    redirect("/account");
  }

  // Admins may open a business's pages to check or fix them; the pages show they are in admin view.
  return children;
}
