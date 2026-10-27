// Shared helpers for the browser tests.

import crypto from "node:crypto";
import fs from "node:fs";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { API_LOG, DATABASE, PHONES, type Who } from "./env";

/** Runs SQL against the test database. */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const client = new Client({ database: DATABASE });
    await client.connect();
    try {
        return (await client.query(text, params)).rows as T[];
    } finally {
        await client.end();
    }
}

export const userIdOf = async (who: Who) =>
    (await sql<{ user_id: number }>("SELECT user_id FROM users WHERE user_phone = $1", [PHONES[who]]))[0].user_id;

/**
 * Signs the browser context in as a seeded account by creating a session directly, which is quicker
 * than the code flow. The sign-in page itself is tested in auth.spec.ts.
 */
export async function signIn(context: BrowserContext, who: Who) {
    await signInUser(context, await userIdOf(who));
}

/** The same for any account, for example one made with newCustomer(). */
export async function signInUser(context: BrowserContext, userId: number) {
    const token = crypto.randomBytes(32).toString("hex");
    await sql(
        `INSERT INTO sessions (user_id, session_token_hash, session_expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [userId, crypto.createHash("sha256").update(token).digest("hex")]
    );
    await context.addCookies([{ name: "shaheb_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}

/**
 * A new verified customer of its own, so a test can review or report without meeting what other tests
 * (or the seed) left behind. Returns its id and phone.
 */
export async function newCustomer(name: string): Promise<{ id: number; phone: string }> {
    const phone = `+880179${crypto.randomInt(0, 1e7).toString().padStart(7, "0")}`;
    const [{ user_id }] = await sql<{ user_id: number }>(
        `INSERT INTO users (user_phone, user_name, user_role, user_phone_verified_at)
         VALUES ($1, $2, 'customer', now()) RETURNING user_id`,
        [phone, name]
    );
    return { id: user_id, phone };
}

/** Where the API log ends now. Pass it to codeSince() so an earlier code is never picked up. */
export const logMark = () => fs.statSync(API_LOG).size;

/** The first sign-in code the API printed for this phone after `mark` (console delivery). */
export async function codeSince(phone: string, mark: number): Promise<string> {
    const pattern = new RegExp(`phone: ${phone.replace("+", "\\+")}\\s+\\[mock verification\\] purpose: \\w+\\s+\\[mock verification\\] code: (\\d{6})`);
    for (let i = 0; i < 40; i++) {
        // `mark` counts bytes, and the log can contain multi-byte characters, so slice the bytes first.
        const match = fs.readFileSync(API_LOG).subarray(mark).toString("utf8").match(pattern);
        if (match) return match[1];
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No new sign-in code for ${phone} in ${API_LOG}`);
}

/** Fails when the page scrolls sideways, which means something is wider than the screen. */
export async function expectNoSideScroll(page: Page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page is wider than the screen").toBeLessThanOrEqual(0);
}

const allowed = new WeakMap<string[], RegExp[]>();

/** Declares a console error this test expects (for example the 404 of a missing page), before acting. */
export function allowConsoleError(consoleErrors: string[], pattern: RegExp) {
    allowed.set(consoleErrors, [...(allowed.get(consoleErrors) ?? []), pattern]);
}

// Every test fails if the browser logs an error it did not declare, or a script throws.
export const test = base.extend<{ consoleErrors: string[] }>({
    consoleErrors: [
        async ({ page }, use) => {
            const errors: string[] = [];
            page.on("console", (message) => {
                if (message.type() === "error") errors.push(message.text());
            });
            page.on("pageerror", (error) => errors.push(error.message));
            await use(errors);
            const expected = allowed.get(errors) ?? [];
            expect(errors.filter((e) => !expected.some((p) => p.test(e))), "browser console errors").toEqual([]);
        },
        { auto: true },
    ],
});

export { expect };
