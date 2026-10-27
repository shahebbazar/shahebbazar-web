import type { Locale } from "./i18n";

// Display formatting helpers.

/** Converts a `pg` NUMERIC value to a number, returning 0 when unparseable. */
export function toNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const n = typeof value === "number" ? value : parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

/** Formats a rating to one decimal place. */
export function formatRating(value: string | number | null | undefined): string {
    return toNumber(value).toFixed(1);
}

// Formats a SQL TIME value as a 12-hour clock time.
export function formatClockTime(sqlTime: string | null): string | null {
    if (!sqlTime) return null;
    const [hStr, mStr] = sqlTime.split(":");
    const hour = Number(hStr);
    const minute = Number(mStr);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    const suffix = hour >= 12 ? "PM" : "AM";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

// Splits a date into abbreviated month and day for the event date block.
export function formatEventDate(iso: string): { month: string; day: string } {
    const date = new Date(iso);
    return {
        month: date
            .toLocaleString("en-US", { month: "short", timeZone: "Asia/Dhaka" })
            .toUpperCase(),
        day: date.toLocaleString("en-US", { day: "2-digit", timeZone: "Asia/Dhaka" }),
    };
}

/** Formats an event date, or a date range when the event spans several days. Bangla uses Bangla month names and digits. */
export function formatEventRange(startIso: string, endIso: string | null, locale: Locale = "en"): string {
    const lang = locale === "bn" ? "bn-BD" : "en-GB";
    // Bangla's short month names are clipped ("নভে"), so it uses the full ones.
    const month = locale === "bn" ? "long" : "short";
    const opts: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month,
        year: "numeric",
        timeZone: "Asia/Dhaka",
    };
    const start = new Date(startIso);
    const startText = start.toLocaleDateString(lang, opts);
    if (!endIso) return startText;

    const end = new Date(endIso);
    if (start.toDateString() === end.toDateString()) return startText;

    const shortOpts: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month,
        timeZone: "Asia/Dhaka",
    };
    return `${start.toLocaleDateString(lang, shortOpts)} – ${end.toLocaleDateString(lang, opts)}`;
}

const DHAKA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" });
const WHEN_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
const WHEN_TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });

/** An event's day and times in Dhaka time: "Sat, 2 Nov 2026, 10:00 AM – 5:00 PM", or a range of days. */
export function formatEventWhen(startIso: string, endIso: string | null): string {
    const start = new Date(startIso);
    const startText = `${WHEN_DAY.format(start)}, ${WHEN_TIME.format(start)}`;
    if (!endIso) return startText;
    const end = new Date(endIso);
    if (DHAKA_DAY.format(start) === DHAKA_DAY.format(end)) return `${startText} – ${WHEN_TIME.format(end)}`;
    return `${startText} – ${WHEN_DAY.format(end)}, ${WHEN_TIME.format(end)}`;
}

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** Converts ASCII digits to Bengali digits when the Bangla locale is active. */
export function localiseDigits(text: string, locale: Locale): string {
    if (locale !== "bn") return text;
    return text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/**
 * A stored Bangladeshi number (+880 form) in the local style: "0721-775544", "02-9123456" (or
 * "01712-345678" for a mobile). Used for landlines; anything else is shown as stored.
 */
export function formatLocalPhone(phone: string): string {
    const national = /^\+880(\d+)$/.exec(phone.replace(/[\s-]/g, ""))?.[1];
    if (!national) return phone;
    if (/^1\d{9}$/.test(national)) return `0${national.slice(0, 4)}-${national.slice(4)}`;
    // Landlines: Dhaka's area code is 02; elsewhere it has three digits (Rajshahi 0721).
    if (national.startsWith("2")) return `02-${national.slice(1)}`;
    return `0${national.slice(0, 3)}-${national.slice(3)}`;
}

/**
 * A Bangladeshi number typed any common way ("01811 223344", "+880 721-775544") in its stored +880
 * form, or null when it isn't one. The same as normalisePhone in backend/lib/businessProfile.js.
 */
export function toStoredPhone(raw: string): string | null {
    const compact = raw.replace(/[\s\-().]/g, "");
    const national = /^\+880(\d+)$/.exec(compact)?.[1] ?? /^880(\d+)$/.exec(compact)?.[1] ?? /^0(\d+)$/.exec(compact)?.[1];
    if (!national) return null;
    if (national.startsWith("1")) return /^1[3-9]\d{8}$/.test(national) ? `+880${national}` : null;
    return /^[2-9]\d{6,9}$/.test(national) ? `+880${national}` : null;
}

/**
 * A main number (sign-in, business contact, WhatsApp) as shown: a mobile in full international form,
 * "+8801712345678"; a landline in the local style, "0721-775544". backend/lib/phone.js (displayPhone)
 * does the same for emails and campaign wording.
 */
export function formatPhone(phone: string): string {
    const compact = phone.replace(/[\s-]/g, "");
    return /^\+8801\d{9}$/.test(compact) ? compact : formatLocalPhone(phone);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A timestamp's parts in Dhaka time (UTC+6 all year, no daylight saving). Built by hand rather than
// with Intl, because browsers differ from the server on the hour ("02:47" against "2:47"), which makes
// pages rendered on the server fail to hydrate.
function dhaka(iso: string) {
    const d = new Date(new Date(iso).getTime() + 6 * 60 * 60 * 1000);
    return {
        day: d.getUTCDate(),
        month: MONTHS[d.getUTCMonth()],
        year: d.getUTCFullYear(),
        time: `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    };
}

// A short date and time in Dhaka time, e.g. "26 Oct 2026, 14:47".
export function formatDateTime(iso: string): string {
    const { day, month, year, time } = dhaka(iso);
    return `${day} ${month} ${year}, ${time}`;
}

// The same without the year, e.g. "26 Oct, 14:47".
export function formatDayTime(iso: string): string {
    const { day, month, time } = dhaka(iso);
    return `${day} ${month}, ${time}`;
}
