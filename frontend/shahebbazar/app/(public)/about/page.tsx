import type { Metadata } from "next";
import Link from "next/link";
import { Flag, MessageSquare, Search, Store } from "lucide-react";
import { AppShell } from "@/components/public/AppShell";
import { pageMetadata } from "@/lib/seo";
import { resolveLocale, localeHref } from "@/lib/i18n";

export const metadata: Metadata = pageMetadata({
    title: "About Shahebbazar",
    description: "Shahebbazar is a local business directory for Rajshahi: find shops and services, compare them and contact them directly.",
    path: "/about",
});

const STEPS = [
    { Icon: Search, title: "Find", body: "Search or browse categories to find shops, services and products across Rajshahi." },
    { Icon: Store, title: "Compare", body: "Check opening hours, prices, photos and honest reviews from other customers." },
    { Icon: MessageSquare, title: "Contact", body: "Call, get directions, or send the business a message. Deals are made directly with the business." },
];

export default async function AboutPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
    const locale = resolveLocale((await searchParams).lang);

    return (
        <AppShell locale={locale}>
            <article className="max-w-3xl space-y-6">
                <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
                    <h1 className="text-2xl font-bold tracking-tight">About Shahebbazar</h1>
                    <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
                        Shahebbazar is a local business directory for Rajshahi, starting with the Shaheb Bazar commercial area. It
                        helps customers find local shops and services, and helps businesses in silk, handicrafts, agro-supplies,
                        light manufacturing and everyday services be found online.
                    </p>
                    <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
                        Our team reviews businesses and listings, and customers can report anything that looks wrong.
                    </p>
                </section>

                <section id="how-it-works" className="scroll-mt-20 rounded-xl border border-line bg-surface p-6 shadow-card">
                    <h2 className="text-xl font-semibold">How it works</h2>
                    <ol className="mt-4 grid gap-4 sm:grid-cols-3">
                        {STEPS.map(({ Icon, title, body }) => (
                            <li key={title}>
                                <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                                    <Icon className="size-5" />
                                </span>
                                <p className="mt-2 font-semibold">{title}</p>
                                <p className="mt-1 text-sm text-muted">{body}</p>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-5 text-sm text-muted">
                        Own a business? List it for free, add your products and prices, and answer customer messages from your{" "}
                        <Link href="/vendors/dashboard" className="font-medium text-brand-600 hover:underline">
                            dashboard
                        </Link>
                        .
                    </p>
                </section>

                <section id="contact" className="scroll-mt-20 rounded-xl border border-line bg-surface p-6 shadow-card">
                    <h2 className="text-xl font-semibold">Contact and support</h2>
                    <ul className="mt-3 space-y-3 text-sm text-muted">
                        <li className="flex gap-2">
                            <MessageSquare className="mt-0.5 size-4 shrink-0 text-brand-600" />
                            Questions about a business, its products or prices: use the Message button on the business&apos;s page.
                        </li>
                        <li className="flex gap-2">
                            <Flag className="mt-0.5 size-4 shrink-0 text-brand-600" />
                            Wrong information, a fake review or a scam: use Report on the business, review or message, and our team will look at it.
                        </li>
                        <li className="flex gap-2">
                            <Store className="mt-0.5 size-4 shrink-0 text-brand-600" />
                            Business owners: manage your page, products, reviews and messages from the{" "}
                            <Link href="/vendors/dashboard" className="font-medium text-brand-600 hover:underline">
                                provider dashboard
                            </Link>
                            .
                        </li>
                    </ul>
                    <p className="mt-4 text-sm">
                        <Link href={localeHref("/terms", locale)} className="font-medium text-brand-600 hover:underline">Terms</Link>
                        {" · "}
                        <Link href={localeHref("/privacy", locale)} className="font-medium text-brand-600 hover:underline">Privacy</Link>
                        {" · "}
                        <Link href={localeHref("/refunds", locale)} className="font-medium text-brand-600 hover:underline">Refunds</Link>
                    </p>
                </section>
            </article>
        </AppShell>
    );
}
