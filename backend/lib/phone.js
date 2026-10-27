// Bangladeshi phone numbers, typed or pasted any common way, in their stored +880 form.
//
// Accepted: 01712345678, 01712-345678, 017 1234 5678, +8801712345678, 8801712345678, 008801712345678,
// +880 01712-345678 (the local 0 kept after the country code), in Bangla digits (০১৭১২৩৪৫৬৭৮), with
// spaces, dashes, dots or brackets, including the non-breaking and zero-width spaces and long dashes
// that come with numbers copied from WhatsApp or a contact card.
// frontend/shahebbazar/lib/format.ts (toStoredPhone) does the same; test/phone.test.js checks they agree.

// Spaces of every kind (\s covers non-breaking ones), zero-width characters, hyphens and dashes, the
// minus sign, dots and brackets.
const SEPARATORS = /[\s​-‍⁠\-‐-―−().]/g;
const BENGALI_DIGITS = /[০-৯]/g;

/** The digits of a Bangladeshi number after its country code or trunk 0 ("1712345678"), or null. */
function nationalNumber(value) {
    if (typeof value !== "string") return null;
    let phone = value
        .replace(BENGALI_DIGITS, (d) => String(d.charCodeAt(0) - 0x09e6))
        .replace(SEPARATORS, "");
    // An international dialling prefix, 00, means "+".
    if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;

    const international = /^\+?880(\d+)$/.exec(phone);
    if (international) {
        // "+880 01712…": the local 0 kept after the country code.
        return international[1].replace(/^0/, "");
    }
    return /^0(\d+)$/.exec(phone)?.[1] ?? null;
}

const isMobile = (national) => /^1[3-9]\d{8}$/.test(national);
// Landlines: an area code (2 for Dhaka, three digits elsewhere, such as 721 for Rajshahi) and the number.
const isLandline = (national) => /^[2-9]\d{6,9}$/.test(national);

// A mobile number (013 to 019) as +8801XXXXXXXXX, or null. Sign-in codes go by SMS through a
// Bangladeshi provider, so landlines and other countries' numbers are refused.
function normalisePhone(value) {
    const national = nationalNumber(value);
    return national && isMobile(national) ? `+880${national}` : null;
}

// A mobile or landline as +880…, or null: for a business's contact and second numbers.
function normaliseAnyPhone(value) {
    const national = nationalNumber(value);
    return national && (isMobile(national) || isLandline(national)) ? `+880${national}` : null;
}

// A business's main number as shown in emails and campaign wording: a mobile in full international
// form (+8801712345678), a landline in the local style with its area code (02-9123456, 0721-775544).
// Anything else is shown as stored. frontend/shahebbazar/lib/format.ts (formatPhone) does the same.
function displayPhone(phone) {
    if (!phone) return phone;
    const compact = String(phone).replace(/[\s-]/g, "");
    if (/^\+8801\d{9}$/.test(compact)) return compact;
    const national = /^\+880(\d+)$/.exec(compact)?.[1];
    if (!national) return phone;
    if (national.startsWith("2")) return `02-${national.slice(1)}`;
    return `0${national.slice(0, 3)}-${national.slice(3)}`;
}

// What every form says when a sign-in number isn't one. The forms show +880 in front of the box.
const PHONE_ERROR = "Enter a Bangladesh mobile number: 10 digits after +880, such as 1712-345678.";

module.exports = {
    PHONE_ERROR,
    normalisePhone,
    normaliseAnyPhone,
    displayPhone,
};
