import { SiteHeader } from "../shared/SiteHeader";
import { SideNav } from "./SideNav";
import { SiteFooter } from "../shared/SiteFooter";
import type { Locale } from "@/lib/i18n";
import { getViewer } from "@/lib/auth-server";

// Page chrome: header, navigation rail, content column and footer.
export async function AppShell({
    locale,
    current,
    children,
}: {
    locale: Locale;
    current?: string;
    children: React.ReactNode;
}) {
    // The main menu sends someone who runs a business to it instead of to registering one.
    const runsBusiness = (await getViewer())?.user_role === "vendor";

    return (
        <div className="flex min-h-screen flex-col">
            <SiteHeader locale={locale} current={current} runsBusiness={runsBusiness} />

            {/* Declared here rather than on <html>, which the layout renders without access to the query string. */}
            <div
                lang={locale}
                className={`mx-auto flex w-full max-w-[1440px] flex-1 gap-5 px-4 py-5 sm:px-6 ${
                    locale === "bn" ? "font-bn" : ""
                }`}
            >
                <SideNav locale={locale} current={current} runsBusiness={runsBusiness} />
                <main className="min-w-0 flex-1">{children}</main>
            </div>

            <SiteFooter locale={locale} />
        </div>
    );
}
