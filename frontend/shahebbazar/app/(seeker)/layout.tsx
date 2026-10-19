import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { AuthUser } from "@/lib/auth-client";

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

export default async function SeekerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session =
        await authenticatedApiGet<AuthMeResponse>(
            "/auth/me"
        );

    if (!session) {
        redirect("/login");
    }

    // Vendors keep their customer account (KAN-253).
    if (session.user.user_role === "admin") {
        redirect("/admin");
    }

    return children;
}