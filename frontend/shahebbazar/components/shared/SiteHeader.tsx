import { type Locale } from "@/lib/i18n";
import { SessionControls } from "@/components/auth/SessionControls";
import { MainNavList } from "../public/SideNav";
import { HeaderBar } from "./HeaderBar";

type SiteHeaderProps = {
    locale: Locale;
    current?: string;
    /** The visitor runs a business, so the menu links to it (from AppShell). */
    runsBusiness?: boolean;
};

// Site header for the public pages and the customer account: the shared header bar with the
// visitor's account controls and the main navigation in the phone menu.
export function SiteHeader({ locale, current, runsBusiness = false }: SiteHeaderProps) {
    return (
        <HeaderBar
            locale={locale}
            account={<SessionControls variant="header" locale={locale} />}
            menuNav={
                <nav aria-label="Main">
                    <MainNavList locale={locale} current={current} runsBusiness={runsBusiness} />
                </nav>
            }
            menuAccount={<SessionControls variant="menu" locale={locale} />}
        />
    );
}
