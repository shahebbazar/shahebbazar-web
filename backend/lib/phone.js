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

module.exports = {
    normalisePhone,
};
