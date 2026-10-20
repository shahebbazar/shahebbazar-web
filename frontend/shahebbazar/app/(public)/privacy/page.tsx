import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { PolicyPage, type PolicySection } from "@/components/public/PolicyPage";
import { resolveLocale } from "@/lib/i18n";

export const metadata: Metadata = pageMetadata({
    title: "Privacy Policy",
    description:
        "What Shahebbazar collects, why it is collected, and what is never shared.",
    path: "/privacy",
});

const SECTIONS: PolicySection[] = [
    {
        heading: "1. What we collect",
        body: [
            "Browsing the directory does not require an account and does not require you to identify yourself.",
            "If you create an account or list a business, we collect:",
            [
                "your mobile number, which is how you sign in",
                "your name, and a business name and address if you list one",
                "the contact details and opening hours you choose to publish",
                "photographs you upload",
                "enquiries and messages you send through the site",
            ],
            "We also record basic usage information, such as which searches are run and which listings are viewed, so businesses can see how often they appear.",
        ],
    },
    {
        heading: "2. Your mobile number",
        body: [
            "Registration uses your mobile number rather than an email address, because that is what most people in Rajshahi use.",
            "We send a one-time code by SMS to confirm the number is yours. Codes are stored only in hashed form, expire after a few minutes and can be used once.",
            "Your number is shown to a business only when you contact that business. It is never published on a public page and never sold.",
        ],
    },
    {
        heading: "3. What businesses can see",
        body: [
            "A business owner sees the enquiries sent to them, and aggregated statistics about their own listing — how many times it was viewed, and which searches it appeared in.",
            "These statistics are counts only. A business cannot see who searched, and small counts are suppressed entirely rather than shown, so that a single rare search in a small area cannot identify the person who made it.",
        ],
    },
    {
        heading: "4. What we never do",
        body: [
            [
                "we do not sell personal information",
                "we do not publish your phone number on a public page",
                "we do not share your identity with a business you have not contacted",
                "we do not use your messages for advertising",
            ],
        ],
    },
    {
        heading: "5. Cookies",
        id: "cookies",
        body: [
            "We use a small number of cookies: one to keep you signed in, and one to remember your language. We do not use advertising cookies.",
        ],
    },
    {
        heading: "6. Keeping information",
        body: [
            "Account information is kept while your account exists. Enquiries and messages are kept so both sides keep a record of what was agreed. Usage statistics are kept in aggregated form.",
            "You can ask us to delete your account and the personal information attached to it. Published reviews may be kept without your name.",
        ],
    },
    {
        heading: "7. Security",
        body: [
            "Passwords and one-time codes are stored hashed, never in readable form. Access to the database is limited to the people who operate the service.",
            "No system is perfectly secure. If a breach affects your information, we will tell you.",
        ],
    },
    {
        heading: "8. Your choices",
        body: [
            "You can view and correct your information from your account, unpublish a listing at any time, and ask for your account to be deleted.",
        ],
    },
    {
        heading: "9. Contact",
        body: [
            "Questions about privacy, or a request to access or delete your information, can be sent through the contact page.",
        ],
    },
];

export default async function PrivacyPage({
    searchParams,
}: {
    searchParams: Promise<{ lang?: string }>;
}) {
    const { lang } = await searchParams;

    return (
        <PolicyPage
            locale={resolveLocale(lang)}
            title="Privacy Policy"
            updated="20 September 2026"
            intro="This page explains what Shahebbazar collects, why, and what we do not do with it. It is written to be read, not to be skipped."
            sections={SECTIONS}
        />
    );
}
