import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { CustomerRegistrationForm } from "@/components/auth/CustomerRegistrationForm";
import { AppShell } from "@/components/public/AppShell";
import { resolveLocale } from "@/lib/i18n";

export const metadata: Metadata = {
    title: "Create customer account",
    description:
        "Create a Shahebbazar customer account using phone verification.",
};

const COPY = {
    en: {
        title: "Create a customer account",
        intro: "Register to save businesses, write reviews, send enquiries and manage customer messages.",
    },
    bn: {
        title: "গ্রাহক অ্যাকাউন্ট তৈরি করুন",
        intro: "ব্যবসা সংরক্ষণ, রিভিউ লেখা, জিজ্ঞাসা পাঠানো এবং বার্তা দেখার জন্য নিবন্ধন করুন।",
    },
};

// ?lang=bn shows it in Bangla, sends the code by SMS in Bangla, and makes Bangla the account's language.
export default async function CustomerRegistrationPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
    const locale = resolveLocale((await searchParams).lang);
    const text = COPY[locale];

    return (
        <AppShell locale={locale}>
            <div className="flex min-h-[640px] items-start justify-center py-8 sm:py-12">
                <section className="w-full max-w-xl rounded-xl border border-line bg-surface p-6 shadow-raised sm:p-8">
                    <header className="text-center">
                        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
                            <UserRound className="size-6" />
                        </span>

                        <h1 className="mt-4 text-2xl font-semibold text-ink">
                            {text.title}
                        </h1>

                        <p className="mt-2 text-sm leading-6 text-muted">
                            {text.intro}
                        </p>
                    </header>

                    <div className="mt-6">
                        <CustomerRegistrationForm locale={locale} />
                    </div>
                </section>
            </div>
        </AppShell>
    );
}
