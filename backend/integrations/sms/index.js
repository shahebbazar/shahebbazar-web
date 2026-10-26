// SMS delivery for sign-in codes (KAN-278). One interface, two adapters:
//
//   bulksmsbd  the client's provider, BulkSMSBD (bulksmsbd.net). Used when SMS_PROVIDER=bulksmsbd and
//              SMS_API_KEY and SMS_SENDER_ID are set. Sent over HTTPS, so the key is never sent in clear.
//   console    prints the message to the API console instead ("[mock verification]" lines, which local
//              development and the tests read). Used otherwise, so nothing is ever sent by accident.
//
// send({ to, message }) resolves to { provider } when the provider accepts the SMS, and rejects with an
// error whose message is safe to log (it never contains the API key).

const PROVIDER_URL = "https://bulksmsbd.net/api/smsapi";
const TIMEOUT_MS = 10000;

// BulkSMSBD's answers (response_code). 202 means accepted; the rest explain why not.
const BULKSMSBD_ERRORS = {
    1001: "invalid number",
    1002: "sender ID not correct or disabled",
    1003: "a required field is missing",
    1005: "provider internal error",
    1006: "balance validity not available",
    1007: "balance insufficient",
    1011: "user ID not found",
    1012: "masking SMS must be sent in Bengali",
    1013: "sender ID has not found a gateway for this API key",
    1014: "sender type name not found for this sender",
    1015: "sender ID has no valid gateway",
    1016: "sender type name active price info not found",
    1017: "sender type name price info not found",
    1018: "the account is disabled",
    1019: "the sender type price for this account is disabled",
    1020: "the parent account was not found",
    1021: "the parent account's active price was not found",
    1031: "the account is not verified",
    1032: "this server's IP address is not whitelisted in the BulkSMSBD panel",
};

/** A Bangladeshi mobile in the form BulkSMSBD expects: 8801XXXXXXXXX, without the "+". */
const providerNumber = (phone) => String(phone).replace(/^\+/, "");

const consoleAdapter = {
    name: "console",
    async send() {
        // The sign-in route prints the "[mock verification]" lines itself, with the code.
        return { provider: "console" };
    },
};

const bulksmsbdAdapter = {
    name: "bulksmsbd",
    async send({ to, message }) {
        const body = new URLSearchParams({
            api_key: process.env.SMS_API_KEY,
            senderid: process.env.SMS_SENDER_ID,
            number: providerNumber(to),
            message,
        });
        let res;
        try {
            res = await fetch(process.env.SMS_API_URL || PROVIDER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
                body,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (err) {
            throw new Error(`BulkSMSBD could not be reached (${err.name === "TimeoutError" ? "timed out" : err.message})`);
        }
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(`BulkSMSBD answered ${res.status} with something other than JSON`);
        }
        const code = Number(data.response_code);
        if (code === 202) return { provider: "bulksmsbd" };
        throw new Error(`BulkSMSBD refused the SMS: ${code} ${BULKSMSBD_ERRORS[code] ?? data.error_message ?? "unknown error"}`);
    },
};

/** The adapter in use: BulkSMSBD only when switched on and configured. */
function smsAdapter() {
    return process.env.SMS_PROVIDER === "bulksmsbd" && process.env.SMS_API_KEY && process.env.SMS_SENDER_ID
        ? bulksmsbdAdapter
        : consoleAdapter;
}

/**
 * The sign-in code text: Bangla for someone who reads the site in Bangla, English otherwise. Short, so
 * the English one fits one SMS and the Bangla one (sent as Unicode, 70 characters a part) two at most.
 */
function codeMessage(code, { language = "en", minutes }) {
    return language === "bn"
        ? `সাহেব বাজার কোড: ${code}। ${minutes} মিনিট পর্যন্ত বৈধ। কাউকে জানাবেন না।`
        : `Your Shahebbazar code is ${code}. It expires in ${minutes} minutes. Don't share it with anyone.`;
}

module.exports = { smsAdapter, codeMessage, providerNumber, BULKSMSBD_ERRORS };
