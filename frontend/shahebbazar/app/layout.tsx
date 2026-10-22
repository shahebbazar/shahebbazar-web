import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { NavigationTracker } from "@/components/analytics/NavigationTracker";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
    display: "swap",
});

// The team's test server: demo data, a strip across the top saying so, and not indexed.
const TEST_BUILD = process.env.NEXT_PUBLIC_TEST_BUILD === "true";

// Site-wide metadata.
const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default:
            "Shahebbazar — Rajshahi's local business directory",
        template: "%s | Shahebbazar",
    },
    description:
        "Find trusted businesses and services across Rajshahi. Search shops, clinics, hotels, restaurants and suppliers by what they actually sell.",
    openGraph: {
        type: "website",
        siteName: "Shahebbazar",
        locale: "en_GB",
        alternateLocale: "bn_BD",
    },
    twitter: {
        card: "summary_large_image",
    },
    // A test server (NEXT_PUBLIC_TEST_BUILD) is kept out of search engines.
    robots: TEST_BUILD ? { index: false, follow: false } : { index: true, follow: true },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        // The document language is set per page in AppShell,
        // since layouts cannot read the locale parameter.
        <html
            lang="en"
            className={`${geistSans.variable} h-full antialiased`}
            suppressHydrationWarning
        >
            <body className="min-h-full">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <NavigationTracker />
                    {TEST_BUILD && (
                        <p className="bg-sponsor-bg px-4 py-1 text-center text-xs font-medium text-sponsor-ink">
                            Test site with demo data. Not the live Shahebbazar.
                        </p>
                    )}
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}