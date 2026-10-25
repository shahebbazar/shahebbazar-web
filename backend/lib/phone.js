// Converts a Bangladeshi mobile number, written any common way, to +8801XXXXXXXXX.
// Sign-in codes go by SMS through a Bangladeshi provider, so other numbers are refused.
function normalisePhone(value) {
    if (typeof value !== "string") {
        return null;
    }

    let phone = value
        .trim()
        .replace(/[\s\-().]/g, "");

    // Convert an international dialing prefix to "+".
    if (phone.startsWith("00")) {
        phone = `+${phone.slice(2)}`;
    }

    // Local format (01XXXXXXXXX) or country code without "+" (8801XXXXXXXXX).
    if (/^01\d{9}$/.test(phone)) {
        phone = `+88${phone}`;
    } else if (/^8801\d{9}$/.test(phone)) {
        phone = `+${phone}`;
    }

    // Mobile numbers start 013 to 019.
    if (!/^\+8801[3-9]\d{8}$/.test(phone)) {
        return null;
    }

    return phone;
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

module.exports = {
    normalisePhone,
    displayPhone,
};
