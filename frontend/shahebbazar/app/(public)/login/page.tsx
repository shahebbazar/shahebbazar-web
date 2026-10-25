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
// ?account=deleted comes from deleting an account, which can still be brought back by signing in.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; account?: string }> }) {
    const params = await searchParams;
    const next = safeNext(params.next);
    return (
        <AppShell locale="en">
            <div className="flex min-h-[640px] flex-col items-center justify-start gap-4 py-8 sm:py-12">
                {params.account === "deleted" && (
                    <p role="status" className="w-full max-w-xl rounded-xl bg-surface-2 p-3 text-sm text-ink">
                        Your account is deactivated and will be deleted in 30 days. Changed your mind? Sign in below with your mobile
                        number before then to keep it.
                    </p>
                )}
                <LoginPanel next={next} />
            </div>
        </AppShell>
    );
}
