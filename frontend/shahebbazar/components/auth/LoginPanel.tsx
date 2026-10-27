"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ShieldCheck, UserRound, Copy, Check } from "lucide-react";
import { PhoneVerificationForm } from "@/components/auth/PhoneVerificationForm";
import type { Locale } from "@/lib/i18n";

type AccountType = "customer" | "vendor";

// Local development shows where codes appear; a test server build (NEXT_PUBLIC_TEST_BUILD) points to the demo code.
const DEVELOPMENT = process.env.NODE_ENV === "development";
const TEST_BUILD = process.env.NEXT_PUBLIC_TEST_BUILD === "true";

const COPY = {
    en: {
        title: "Log in to Shahebbazar",
        intro: "Choose your account type, then verify your phone number to continue.",
        tabs: "Choose account type",
        customer: "Customer",
        vendor: "Business owner",
        customerTitle: "Customer login",
        vendorTitle: "Business owner login",
        customerIntro: "Use the phone number connected to your customer account.",
        vendorIntro: "Use the phone number connected to your registered business account.",
        testTitle: "Test site",
        testBody: "Text messages aren't sent yet. Use the demo sign-in code the project team gave you.",
        admin: "Administrator login",
    },
    bn: {
        title: "সাহেববাজারে লগ ইন করুন",
        intro: "অ্যাকাউন্টের ধরন বেছে নিন, তারপর ফোন নম্বর যাচাই করে এগিয়ে যান।",
        tabs: "অ্যাকাউন্টের ধরন বেছে নিন",
        customer: "গ্রাহক",
        vendor: "ব্যবসার মালিক",
        customerTitle: "গ্রাহক লগ ইন",
        vendorTitle: "ব্যবসার মালিক লগ ইন",
        customerIntro: "আপনার গ্রাহক অ্যাকাউন্টের সঙ্গে যুক্ত ফোন নম্বরটি ব্যবহার করুন।",
        vendorIntro: "আপনার নিবন্ধিত ব্যবসায়িক অ্যাকাউন্টের সঙ্গে যুক্ত ফোন নম্বরটি ব্যবহার করুন।",
        testTitle: "পরীক্ষামূলক সাইট",
        testBody: "এখনও এসএমএস পাঠানো হয় না। প্রকল্প দলের দেওয়া ডেমো কোডটি ব্যবহার করুন।",
        admin: "অ্যাডমিনিস্ট্রেটর লগ ইন",
    },
};

/** next: where to go after logging in, if the visitor was on their way somewhere (e.g. messaging a business). */
export function LoginPanel({ next = null, locale = "en" }: { next?: string | null; locale?: Locale }) {
    const [accountType, setAccountType] = useState<AccountType>("customer");
    const [copied, setCopied] = useState(false);
    const text = COPY[locale];

    const isCustomer = accountType === "customer";

    const psqlCommand = `& "C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d shahebbazar -c "SELECT user_id, user_name, user_phone, user_email, user_status FROM users WHERE user_role = 'admin' ORDER BY user_id;"`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(psqlCommand);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy command string", err);
        }
    };

    return (
        <section className="mx-auto w-full max-w-xl rounded-xl border border-line bg-surface p-6 shadow-raised sm:p-8">
            <header className="text-center">
                <h1 className="text-2xl font-semibold text-ink">
                    {text.title}
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted">
                    {text.intro}
                </p>
            </header>

            {/* Account Type Tabs */}
            <div
                className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1.5"
                role="tablist"
                aria-label={text.tabs}
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={isCustomer}
                    onClick={() => setAccountType("customer")}
                    className={
                        isCustomer
                            ? "flex items-center justify-center gap-2 rounded-lg bg-surface px-3 py-3 text-sm font-semibold text-brand-600 shadow-card"
                            : "flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
                    }
                >
                    <UserRound className="size-4" />
                    {text.customer}
                </button>

                <button
                    type="button"
                    role="tab"
                    aria-selected={!isCustomer}
                    onClick={() => setAccountType("vendor")}
                    className={
                        !isCustomer
                            ? "flex items-center justify-center gap-2 rounded-lg bg-surface px-3 py-3 text-sm font-semibold text-brand-600 shadow-card"
                            : "flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
                    }
                >
                    <Building2 className="size-4" />
                    {text.vendor}
                </button>
            </div>

            {/* Main Form Area */}
            <div key={accountType} className="mt-6" role="tabpanel">
                <div className="mb-5">
                    <h2 className="text-lg font-semibold text-ink">
                        {isCustomer ? text.customerTitle : text.vendorTitle}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted">
                        {isCustomer ? text.customerIntro : text.vendorIntro}
                    </p>
                </div>

                <PhoneVerificationForm locale={locale} audience={accountType} next={next} />
            </div>

            {/* Local development: where the code appears. The test server: the team's demo code. Neither on the live site. */}
            {DEVELOPMENT && (
                <aside className="mt-6 rounded-lg border border-brand-200 bg-brand-50 p-4">
                    <h2 className="text-sm font-semibold text-brand-700">
                        Development verification
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-brand-700">
                        A real six-digit verification code is generated, hashed and stored
                        with an expiry time. Until SMS delivery is enabled, the code appears
                        only in the local API terminal.
                    </p>
                </aside>
            )}
            {TEST_BUILD && (
                <aside className="mt-6 rounded-lg border border-sponsor-ink/30 bg-sponsor-bg p-4">
                    <h2 className="text-sm font-semibold text-sponsor-ink">{text.testTitle}</h2>
                    <p className="mt-1 text-sm leading-6 text-sponsor-ink">
                        {text.testBody}
                    </p>
                </aside>
            )}

            {/* Bottom Area: Centered Administrator Link & Minimal Utility Code */}
            <div className="mt-6 flex flex-col items-center gap-2 border-t border-line pt-4 text-center">
                <Link
                    href="/admin"
                    className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    {text.admin}
                </Link>

                {DEVELOPMENT && (
                <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 text-xs text-soft hover:text-muted transition-colors"
                    title="Copy psql dev command to clipboard"
                >
                    {copied ? (
                        <>
                            <Check className="size-3.5 text-brand-600" />
                            <span className="text-brand-600 font-medium">Copied psql command!</span>
                        </>
                    ) : (
                        <>
                            <Copy className="size-3.5" />
                            <span>Copy dev psql helper snippet</span>
                        </>
                    )}
                </button>
                )}
            </div>
        </section>
    );
}
