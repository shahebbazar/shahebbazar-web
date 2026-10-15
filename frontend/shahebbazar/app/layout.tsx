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
    robots: {
        index: true,
        follow: true,
    },
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
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}