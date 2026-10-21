import type { Metadata } from "next";
import { AppShell } from "@/components/public/AppShell";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { safeNext } from "@/lib/safeNext";


export const metadata: Metadata = {
    title: "Log in",
    description:
        "Log in to a Shahebbazar customer or business account using phone verification.",
};

// ?next=/path returns the visitor there after logging in (only paths on this site).
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const next = safeNext((await searchParams).next);
    return (
        <AppShell locale="en">
            <div className="flex min-h-[640px] items-start justify-center py-8 sm:py-12">
                <LoginPanel next={next} />
            </div>
        </AppShell>
    );
}
