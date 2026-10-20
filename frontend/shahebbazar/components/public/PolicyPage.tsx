import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { AppShell } from "./AppShell";
import { localeHref, t, type Locale } from "@/lib/i18n";

// Shared frame for Terms, Privacy and Refunds, so the draft notice appears on all three.

export type PolicySection = {
    heading: string;
    /** Anchor for links such as /privacy#cookies. */
    id?: string;
    /** A string is a paragraph; a nested array becomes a bullet list. */
    body: (string | string[])[];
};

export function PolicyPage({
    locale,
    title,
    updated,
    intro,
    sections,
}: {
    locale: Locale;
    title: string;
    updated: string;
    intro: string;
    sections: PolicySection[];
}) {
    const copy = t(locale);

    return (
        <AppShell locale={locale}>
            <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-1.5 text-[0.8125rem] text-muted"
            >
                <Link href={localeHref("/", locale)} className="hover:text-brand-600">
                    {copy.home}
                </Link>
                <ChevronRight className="size-3.5" />
                <span className="text-ink">{title}</span>
            </nav>

            <article className="mt-3 max-w-3xl">
                <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{title}</h1>
                <p className="mt-1.5 text-[0.8125rem] text-muted">Last updated {updated}</p>

                {/* The wording is a draft, not legal advice. */}
                <aside className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <FileText className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <p className="text-[0.8125rem] leading-relaxed text-amber-900">
                        <strong className="font-semibold">Draft.</strong> This wording was
                        prepared by the project team to complete the site. It has not been
                        reviewed by the client or by a lawyer and must be replaced with
                        approved text before launch.
                    </p>
                </aside>

                <p className="mt-5 text-[0.9375rem] leading-relaxed">{intro}</p>

                {sections.map((section) => (
                    <section key={section.heading} id={section.id} className="mt-7 scroll-mt-20">
                        <h2 className="text-[1.0625rem] font-semibold tracking-tight">
                            {section.heading}
                        </h2>
                        {section.body.map((part, i) =>
                            Array.isArray(part) ? (
                                <ul
                                    key={i}
                                    className="mt-2.5 list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed"
                                >
                                    {part.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p key={i} className="mt-2.5 text-[0.9375rem] leading-relaxed">
                                    {part}
                                </p>
                            )
                        )}
                    </section>
                ))}
            </article>
        </AppShell>
    );
}
