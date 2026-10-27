// The mobile number box on sign-in and both sign-up forms (PhoneField). Codes go by SMS through a
// Bangladeshi provider, so only Bangladesh mobile numbers work (backend/lib/phone.js).
//
// The box shows +880 in front, so people type the rest of the number. Whatever they type or paste
// becomes the national number, the digits after +880 (ten for a mobile): a leading 0, +880, 880 or
// 00880 is dropped, Bangla digits count as digits, and anything else (spaces, dashes, brackets) is
// ignored. A digit too many is kept, not cut off, so a mistyped number is refused rather than quietly
// becoming someone else's. backend/test/phone.test.js checks this against the API's rules.

export const COUNTRY_CODE = "+880";
// Enough to show a mistake; nothing longer is ever a phone number.
const MAX_DIGITS = 15;

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** What was typed or pasted, as the digits after +880. */
export function toNational(raw: string): string {
    let digits = raw
        .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
        .replace(/\D/g, "");
    if (digits.startsWith("00880")) digits = digits.slice(5);
    else if (digits.startsWith("880")) digits = digits.slice(3);
    if (digits.startsWith("0")) digits = digits.slice(1);
    return digits.slice(0, MAX_DIGITS);
}

/** The national number as the box shows it, "1712-345678", in Bangla digits on the Bangla pages. */
export function displayNational(national: string, locale: "en" | "bn" = "en"): string {
    const grouped = national.length > 4 ? `${national.slice(0, 4)}-${national.slice(4)}` : national;
    return locale === "bn" ? grouped.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : grouped;
}

/** Where the cursor goes after `digits` digits: past the dash once there is one. */
export function caretAfter(digits: number): number {
    return digits > 4 ? digits + 1 : digits;
}

/**
 * The number the form sends: "+8801712345678", or "" when nothing was typed. The box has already
 * dropped the one 0 people write after the country code; a number that still starts with 0 is sent
 * with that 0 marked, so the API can't drop a second one and refuses it ("+880 00 1712…").
 */
export function toSubmitted(national: string): string {
    if (!national) return "";
    return national.startsWith("0") ? `${COUNTRY_CODE}0${national}` : `${COUNTRY_CODE}${national}`;
}

export const PHONE_COPY = {
    en: {
        label: "Mobile number",
        // Read out after the label by screen readers, which don't see the +880 in front of the box.
        afterCode: "after +880",
        placeholder: "1712-345678",
        info: "About the mobile number",
        hint: "Your Bangladesh mobile number, where the sign-in code is sent by SMS. Type it with or without the first 0.",
    },
    bn: {
        label: "মোবাইল নম্বর",
        afterCode: "+৮৮০-এর পরে",
        placeholder: "১৭১২-৩৪৫৬৭৮",
        info: "মোবাইল নম্বর সম্পর্কে",
        hint: "আপনার বাংলাদেশি মোবাইল নম্বর, যেখানে এসএমএসে লগ ইন কোড পাঠানো হয়। শুরুর ০ সহ বা ছাড়া লিখতে পারেন।",
    },
} as const;
