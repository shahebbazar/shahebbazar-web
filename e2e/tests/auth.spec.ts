// Signing in through the real page: phone number, then the code the API sends (printed to its log here).

import { test, expect, codeSince, logMark, allowConsoleError } from "../fixtures";
import { PHONES } from "../env";
import type { Page } from "@playwright/test";

async function requestAndEnterCode(page: Page, audience: "customer" | "vendor", phone: string, code?: string) {
    await page.locator(`#${audience}-login-phone`).fill(phone);
    const mark = logMark();
    await page.getByRole("button", { name: "Send verification code" }).click();
    const sent = await codeSince(phone, mark);
    await page.locator(`#${audience}-login-code`).fill(code ?? sent);
    await page.getByRole("button", { name: "Verify and log in" }).click();
    return sent;
}

test("a customer signs in with a code and signs out @phone", async ({ page }) => {
    await page.goto("/login");
    await requestAndEnterCode(page, "customer", PHONES.customer);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Hello, Imran Chowdhury" })).toBeVisible();

    await page.goto("/");
    const logOut = page.getByRole("button", { name: /Log out/ });
    if (!(await logOut.isVisible())) await page.getByRole("button", { name: /menu/i }).click(); // phone: inside the menu
    await logOut.click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/account"); // signed out: sent back to sign in
    await expect(page).toHaveURL(/\/login/);
});

test("a business owner signs in to their dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: "Business owner" }).click();
    await requestAndEnterCode(page, "vendor", PHONES.owner);
    await expect(page).toHaveURL(/\/vendors\/dashboard/);
    await expect(page.locator("main")).toContainText("Rajshahi Mango Traders");
});

test("a wrong code is refused with a message", async ({ page, consoleErrors }) => {
    allowConsoleError(consoleErrors, /status of 401/); // the browser logs the refused request itself
    await page.goto("/login");
    // Enters a code that differs from the one sent.
    await page.locator("#customer-login-phone").fill(PHONES.customer2);
    const mark = logMark();
    await page.getByRole("button", { name: "Send verification code" }).click();
    const sent = await codeSince(PHONES.customer2, mark);
    await page.locator("#customer-login-code").fill(sent === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Verify and log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /invalid or has expired/ })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
});

test("signed-out visitors are sent to sign in from private pages", async ({ page }) => {
    for (const path of ["/account", "/vendors/dashboard", "/admin"]) {
        await page.goto(path);
        await expect(page, path).toHaveURL(/\/(login|admin\/login)/);
    }
});
