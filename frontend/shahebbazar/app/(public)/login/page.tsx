import type { Metadata } from "next";
import { AppShell } from "@/components/public/AppShell";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { resolveLocale } from "@/lib/i18n";
import { safeNext } from "@/lib/safeNext";


export const metadata: Metadata = {
    title: "Log in",
    description:
        "Log in to a Shahebbazar customer or business account using phone verification.",
};

// ?next=/path returns the visitor there after logging in (only paths on this site).
// ?account=deleted comes from deleting an account, which can still be brought back by signing in.
// ?lang=bn shows it in Bangla, and sends the code by SMS in Bangla.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; account?: string; lang?: string }> }) {
    const params = await searchParams;
    const next = safeNext(params.next);
    const locale = resolveLocale(params.lang);
    return (
        <AppShell locale={locale}>
            <div className="flex min-h-[640px] flex-col items-center justify-start gap-4 py-8 sm:py-12">
                {params.account === "deleted" && (
                    <p role="status" className="w-full max-w-xl rounded-xl bg-surface-2 p-3 text-sm text-ink">
                        {locale === "bn"
                            ? "আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে এবং ৩০ দিন পরে মুছে ফেলা হবে। মত বদলেছেন? তার আগে নিচে মোবাইল নম্বর দিয়ে লগ ইন করলে অ্যাকাউন্টটি থেকে যাবে।"
                            : "Your account is deactivated and will be deleted in 30 days. Changed your mind? Sign in below with your mobile number before then to keep it."}
                    </p>
                )}
                <LoginPanel next={next} locale={locale} />
            </div>
        </AppShell>
    );
}
