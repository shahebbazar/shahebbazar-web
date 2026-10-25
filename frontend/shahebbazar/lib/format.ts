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

/** Formats an event date, or a date range when the event spans several days. */
export function formatEventRange(startIso: string, endIso: string | null): string {
    const opts: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Dhaka",
    };
    const start = new Date(startIso);
    const startText = start.toLocaleDateString("en-GB", opts);
    if (!endIso) return startText;

    const end = new Date(endIso);
    if (start.toDateString() === end.toDateString()) return startText;

    const shortOpts: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Dhaka",
    };
    return `${start.toLocaleDateString("en-GB", shortOpts)} – ${end.toLocaleDateString("en-GB", opts)}`;
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

/** A stored Bangladeshi mobile number ("+8801712345678") as people write it: "01712-345678". Anything else is shown as stored. */
export function formatPhone(phone: string): string {
    const local = /^\+880(1\d{3})(\d{6})$/.exec(phone.replace(/[\s-]/g, ""));
    return local ? `0${local[1]}-${local[2]}` : phone;
}

// Formats a timestamp as a short date and time in Dhaka time.
export function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString("en-GB", {
        timeZone: "Asia/Dhaka",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}
