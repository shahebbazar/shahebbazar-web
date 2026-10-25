"use client";

import { Fragment, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n";

/** The current page in `target`: same address and filters, with only ?lang changed. */
function useSamePage(target: Locale): string {
    const pathname = usePathname();
    const params = new URLSearchParams(useSearchParams());
    if (target === "bn") params.set("lang", "bn");
    else params.delete("lang");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
}

type Variant = "header" | "menu";
type Props = { locale: Locale; variant: Variant };

const STYLE: Record<Variant, (active: boolean, target: Locale) => string> = {
    header: (active, target) =>
        `${target === "bn" ? "font-bn " : ""}${active ? "font-semibold text-brand-600" : "text-muted hover:text-ink"}`,
    menu: (active) =>
        `rounded-[10px] px-3.5 py-2.5 text-center transition-colors ${
            active ? "bg-brand-50 text-brand-600" : "text-muted hover:bg-surface-2 hover:text-ink"
        }`,
};

function Links({ locale, variant, hrefFor }: Props & { hrefFor: (target: Locale) => string }) {
    return (["en", "bn"] as const).map((target, i) => (
        <Fragment key={target}>
            {variant === "header" && i > 0 && (
                <span aria-hidden="true" className="text-line-strong">
                    |
                </span>
            )}
            <Link href={hrefFor(target)} aria-current={locale === target ? "true" : undefined} className={STYLE[variant](locale === target, target)}>
                {target === "en" ? "English" : "বাংলা"}
            </Link>
        </Fragment>
    ));
}

function CurrentPageLinks(props: Props) {
    const en = useSamePage("en");
    const bn = useSamePage("bn");
    return <Links {...props} hrefFor={(target) => (target === "en" ? en : bn)} />;
}

// The English / বাংলা switch in the header and the phone menu (SiteHeader): stays on the page being
// read, in the other language. Until the address is known (pages built ahead of time), the links go to
// the home page.
export function LanguageLinks(props: Props) {
    return (
        <Suspense fallback={<Links {...props} hrefFor={(target) => (target === "en" ? "/" : "/?lang=bn")} />}>
            <CurrentPageLinks {...props} />
        </Suspense>
    );
}
