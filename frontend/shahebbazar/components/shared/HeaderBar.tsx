import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import { localeHref, t, type Locale } from "@/lib/i18n";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { LanguageLinks } from "./LanguageLinks";
import { MobileMenu } from "./MobileMenu";

// The one header bar for every part of the site: the public pages, the customer account, the business
// dashboard and admin. Each has the same brand, search, language switch and account menu, at the same
// widths; only the account menu's contents and the page links in the phone menu differ.
//
//   phone            brand · menu (search, page links, account, theme, language)
//   tablet (md)      brand · search · account · menu
//   laptop (lg) up   brand · search · English | বাংলা · account

/** Searches the public directory, in the page's language. */
function SearchForm({ locale, variant }: { locale: Locale; variant: "header" | "menu" }) {
    const copy = t(locale);
    const header = variant === "header";
    return (
        <form action={localeHref("/search", locale)} role="search" className={header ? "relative hidden max-w-md flex-1 md:block" : "relative"}>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-soft" aria-hidden="true" />
            <input
                name="q"
                type="search"
                aria-label={copy.searchPlaceholder}
                placeholder={copy.searchPlaceholder}
                className={`h-11 w-full rounded-full border border-line-strong bg-surface pl-11 text-sm text-ink outline-none transition placeholder:text-soft focus:border-brand-500 focus:ring-3 focus:ring-brand-100 ${header ? "pr-14" : "pr-4"}`}
            />
            {locale === "bn" && <input type="hidden" name="lang" value="bn" />}
            {header && (
                <button
                    type="submit"
                    aria-label={copy.search}
                    className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700"
                >
                    <Search className="size-4" />
                </button>
            )}
        </form>
    );
}

export function HeaderBar({
    locale,
    badge,
    account,
    menuNav,
    menuAccount,
}: {
    locale: Locale;
    /** Beside the brand, e.g. "Admin". */
    badge?: React.ReactNode;
    /** The account menu (or Log in / Register), from tablet width up. */
    account: React.ReactNode;
    /** The area's page links, in the phone menu. */
    menuNav?: React.ReactNode;
    /** The account's choices and Log out, in the phone menu. */
    menuAccount: React.ReactNode;
}) {
    const copy = t(locale);
    const section = "mt-3 border-t border-line pt-3";
    const heading = "mb-2 px-1 text-[0.75rem] font-medium text-muted";

    return (
        // Its own lang: in admin the header follows the chosen language but the pages are English.
        <header lang={locale} className={`sticky top-0 z-40 border-b border-line bg-surface ${locale === "bn" ? "font-bn" : ""}`}>
            <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
                <div className="flex shrink-0 items-center gap-3">
                    <Link href={localeHref("/", locale)} className="flex shrink-0 items-center gap-2">
                        <MapPin className="size-6 fill-brand-600 text-brand-600" strokeWidth={1.5} />
                        <span className="text-xl font-bold tracking-tight text-brand-600 sm:text-[1.35rem]">{copy.brand}</span>
                    </Link>
                    {badge}
                </div>

                <SearchForm locale={locale} variant="header" />

                <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3 sm:gap-4">
                    <nav aria-label="Language" className="hidden items-center gap-2 text-[0.8125rem] lg:flex">
                        <LanguageLinks locale={locale} variant="header" />
                    </nav>

                    <div className="hidden min-w-0 md:block">{account}</div>

                    <MobileMenu locale={locale}>
                        <div className="mt-2">
                            <SearchForm locale={locale} variant="menu" />
                        </div>

                        {menuNav && <div className="mt-3">{menuNav}</div>}

                        <section className={section}>
                            <p className={heading}>{copy.accountHeading}</p>
                            {menuAccount}
                        </section>

                        <section className={section}>
                            <p className={heading}>{copy.appearance}</p>
                            <ThemeSelector className="w-full" locale={locale} />
                        </section>

                        <nav aria-label="Language" className={`${section} grid grid-cols-2 gap-2 text-sm font-medium`}>
                            <LanguageLinks locale={locale} variant="menu" />
                        </nav>
                    </MobileMenu>
                </div>
            </div>
        </header>
    );
}
