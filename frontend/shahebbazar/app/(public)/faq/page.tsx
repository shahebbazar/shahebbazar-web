import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/public/AppShell";
import { pageMetadata } from "@/lib/seo";
import { localeHref, resolveLocale, t } from "@/lib/i18n";

export const metadata: Metadata = pageMetadata({
    title: "Frequently asked questions",
    description: "Answers about finding businesses on Shahebbazar, signing in, getting offers, listing a business and privacy.",
    path: "/faq",
});

type Answer = { q: string; a: React.ReactNode };

const GROUPS: { id: string; title: string; items: Answer[] }[] = [
    {
        id: "customers",
        title: "Finding and contacting businesses",
        items: [
            {
                q: "What is Shahebbazar?",
                a: "A local business directory for Rajshahi. You can find shops and services, compare opening hours, prices, photos and reviews, and contact the business directly.",
            },
            {
                q: "Do I need an account?",
                a: "Not to browse or search. An account lets you save businesses, message them, write reviews, report problems and choose to get offers.",
            },
            {
                q: "How do I sign in? Is there a password?",
                a: "There is no password. Enter your mobile number and we send you a one-time code by SMS. Each code works once and expires after a few minutes.",
            },
            {
                q: "Does it cost anything?",
                a: "No. Using Shahebbazar as a customer is free.",
            },
            {
                q: "How do I contact a business?",
                a: "Use Call, Get Directions or Message on the business's page. Messages need you to be signed in, and the business replies in your account under Messages.",
            },
            {
                q: "Can I pay through Shahebbazar?",
                a: "No. Shahebbazar is a directory, not a shop. Each business page shows the payment methods it accepts, such as cash, bKash or Nagad, and you pay the business directly.",
            },
            {
                q: "How do reviews work?",
                a: "You can write one review per business and update it later. You cannot review a business you run. Our team can hide reviews that break the rules.",
            },
        ],
    },
    {
        id: "offers",
        title: "Offers from businesses",
        items: [
            {
                q: "How do I get offers from a business?",
                a: "Save the business with the bookmark button. We then ask whether you want its offers by SMS or by email. Nothing is ticked for you, and saving a business does not sign you up.",
            },
            {
                q: "Why can't I choose email?",
                a: (
                    <>
                        Your account has no email address yet. Add one on{" "}
                        <Link href="/account/details#email" className="font-medium text-brand-600 hover:underline">
                            My account → My details
                        </Link>
                        , then tick Email under the business.
                    </>
                ),
            },
            {
                q: "How do I stop offers?",
                a: (
                    <>
                        Use the unsubscribe link in any offer, untick SMS or Email under the business on{" "}
                        <Link href="/account/saved" className="font-medium text-brand-600 hover:underline">
                            My account → Saved businesses
                        </Link>
                        , or remove the business from your saved list. It takes effect straight away.
                    </>
                ),
            },
            {
                q: "Does the business see my phone number or email?",
                a: "No. Offers are sent through Shahebbazar, so the business never receives your contact details unless you message or call it yourself.",
            },
            {
                q: "What does Sponsored mean?",
                a: "Businesses with a Marketing pass appear in the Sponsored section at the top of search results and on the home page. They are always labelled Sponsored, and the ordinary results below are not affected.",
            },
        ],
    },
    {
        id: "businesses",
        title: "For businesses",
        items: [
            {
                q: "How do I list my business?",
                a: (
                    <>
                        Choose{" "}
                        <Link href="/vendors/register" className="font-medium text-brand-600 hover:underline">
                            Add Business
                        </Link>
                        . If you already have a customer account, you can register the business from My account and keep everything you have.
                        Listing is free.
                    </>
                ),
            },
            {
                q: "When will my business appear?",
                a: "After our team checks it. Until then it stays pending and is not shown publicly. Products and services you add are checked the same way.",
            },
            {
                q: "Can more than one person run a business page?",
                a: "Yes. The owner can add managers by phone number in the dashboard under Settings. Managers can update the page and answer messages.",
            },
            {
                q: "How do I get into Sponsored results?",
                a: (
                    <>
                        With a Marketing pass for 7, 30 or 90 days. Passes are activated by the Shahebbazar team for now;{" "}
                        <Link href="/about#contact" className="font-medium text-brand-600 hover:underline">
                            contact us
                        </Link>{" "}
                        to arrange one.
                    </>
                ),
            },
        ],
    },
    {
        id: "privacy",
        title: "Privacy and safety",
        items: [
            {
                q: "Is my phone number public?",
                a: "No. It is never shown on a public page. A business sees it only if you contact that business.",
            },
            {
                q: "How do I report something wrong?",
                a: "Use Report on the business, review or message. Our team looks at every report.",
            },
            {
                q: "Where can I read the full policies?",
                a: (
                    <>
                        See the{" "}
                        <Link href="/privacy" className="font-medium text-brand-600 hover:underline">
                            Privacy Policy
                        </Link>{" "}
                        and{" "}
                        <Link href="/terms" className="font-medium text-brand-600 hover:underline">
                            Terms of Use
                        </Link>
                        .
                    </>
                ),
            },
        ],
    },
];

export default async function FaqPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
    const locale = resolveLocale((await searchParams).lang);
    const copy = t(locale);

    return (
        <AppShell locale={locale}>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
                <Link href={localeHref("/", locale)} className="hover:text-brand-600">
                    {copy.home}
                </Link>
                <ChevronRight className="size-3.5" />
                <span className="text-ink">FAQ</span>
            </nav>

            <article className="mt-3 max-w-3xl">
                <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Frequently asked questions</h1>
                <p className="mt-2 text-[0.9375rem] text-muted">
                    Can&apos;t find your answer?{" "}
                    <Link href={localeHref("/about#contact", locale)} className="font-medium text-brand-600 hover:underline">
                        Contact us
                    </Link>
                    .
                </p>

                {GROUPS.map((group) => (
                    <section key={group.id} id={group.id} className="mt-8 scroll-mt-20">
                        <h2 className="text-[1.0625rem] font-semibold tracking-tight">{group.title}</h2>
                        <div className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface shadow-card">
                            {group.items.map((item) => (
                                <details key={item.q} className="group px-4">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-[0.9375rem] font-medium [&::-webkit-details-marker]:hidden">
                                        {item.q}
                                        <ChevronDown className="size-4 shrink-0 text-soft transition-transform group-open:rotate-180" />
                                    </summary>
                                    <p className="pb-4 text-[0.9375rem] leading-relaxed text-muted">{item.a}</p>
                                </details>
                            ))}
                        </div>
                    </section>
                ))}
            </article>
        </AppShell>
    );
}
