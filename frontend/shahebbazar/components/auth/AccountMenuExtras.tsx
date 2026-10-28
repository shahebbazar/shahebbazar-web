import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { t, type Locale } from "@/lib/i18n";
import { LogoutButton } from "./LogoutButton";

/** Under the account switcher's list: the theme and Log out, kept out of the header bar. */
export function AccountMenuExtras({ locale = "en" }: { locale?: Locale }) {
    return (
        <>
            <div>
                <p className="mb-1.5 px-2 text-[0.75rem] font-medium text-muted">{t(locale).appearance}</p>
                <ThemeSelector className="w-full" locale={locale} />
            </div>
            <LogoutButton locale={locale} />
        </>
    );
}
