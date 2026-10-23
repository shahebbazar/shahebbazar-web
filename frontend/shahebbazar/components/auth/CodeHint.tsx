// The note above a verification-code box, shared by sign-in and both sign-up forms. Where the code comes
// from depends on the build: local development prints it in the API terminal, the team's test server
// (NEXT_PUBLIC_TEST_BUILD) uses the demo code, and the live site sends it by SMS, so it only gives the expiry.

const DEVELOPMENT = process.env.NODE_ENV === "development";
const TEST_BUILD = process.env.NEXT_PUBLIC_TEST_BUILD === "true";

const COPY = {
    en: {
        development: "Development mode: check the API terminal for the verification code.",
        test: "Test site: text messages aren't sent yet. Use the demo sign-in code the project team gave you.",
        expiry: "The code expires after five minutes.",
    },
    bn: {
        development: "ডেভেলপমেন্ট মোড: যাচাইকরণ কোডের জন্য API টার্মিনাল দেখুন।",
        test: "পরীক্ষামূলক সাইট: এখনও এসএমএস পাঠানো হয় না। প্রকল্প দলের দেওয়া ডেমো কোডটি ব্যবহার করুন।",
        expiry: "কোডটি পাঁচ মিনিট পরে মেয়াদোত্তীর্ণ হবে।",
    },
};

export function CodeHint({ locale = "en" }: { locale?: "en" | "bn" }) {
    const text = COPY[locale];
    const source = DEVELOPMENT ? text.development : TEST_BUILD ? text.test : null;

    return (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm leading-6 text-brand-700">
            {source && <p>{source}</p>}
            <p>{text.expiry}</p>
        </div>
    );
}
