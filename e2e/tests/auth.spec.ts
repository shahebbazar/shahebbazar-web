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

test("the Reply button in an offer email logs a signed-out customer in, then opens a message to the business @phone", async ({ page, context }) => {
    await page.goto("/message/rajshahi-mango-traders");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fmessages%2Fnew%3Fvendor%3Drajshahi-mango-traders$/);
    // Rumana Akter, one of Rajshahi Mango Traders' email subscribers (her own phone, so the code limit isn't shared).
    await requestAndEnterCode(page, "customer", "+8801722000003");
    await expect(page).toHaveURL(/\/account\/messages\/new\?vendor=rajshahi-mango-traders$/);
    await expect(page.getByText("Rajshahi Mango Traders", { exact: true })).toBeVisible();

    // Signed in, it goes straight there.
    await page.goto("/message/rajshahi-mango-traders");
    await expect(page).toHaveURL(/\/account\/messages\/new\?vendor=rajshahi-mango-traders$/);
    await context.clearCookies();
});

test("login only returns to a page on this site", async ({ page }) => {
    await page.goto("/login?next=//evil.example/x");
    await requestAndEnterCode(page, "customer", "+8801722000004"); // Sajid Rahman
    await expect(page).toHaveURL(/\/account$/);
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

test("the code step gives the expiry, not development instructions, outside local development", async ({ page }) => {
    const hint = async () => {
        await expect(page.getByText("The code expires after five minutes.")).toBeVisible();
        await expect(page.getByText(/API terminal|Development mode/)).toHaveCount(0);
    };
    await page.goto("/login");
    await page.locator("#customer-login-phone").fill(PHONES.customer2);
    await page.getByRole("button", { name: "Send verification code" }).click();
    await hint();

    const phone = `0179${Date.now().toString().slice(-7)}`;
    await page.goto("/register/customer");
    await page.locator("#customer-register-name").fill("Hint Check");
    await page.locator("#customer-register-phone").fill(phone);
    await page.getByRole("button", { name: "Continue with phone verification" }).click();
    await hint();

    await page.goto("/vendors/register");
    await page.getByRole("textbox", { name: "Business name" }).fill("Hint Check Stall");
    await page.getByRole("textbox", { name: "Email address" }).fill("hint.check@example.com");
    await page.getByRole("textbox", { name: "Phone number" }).fill(`0178${Date.now().toString().slice(-7)}`);
    await page.getByRole("textbox", { name: "Street address" }).fill("1 Station Road");
    await page.getByRole("textbox", { name: "City or area" }).fill("Rajshahi");
    await page.getByRole("button", { name: "Continue with phone verification" }).click();
    await hint();
});

test("signed-out visitors are sent to sign in from private pages", async ({ page }) => {
    for (const path of ["/account", "/vendors/dashboard", "/admin"]) {
        await page.goto(path);
        await expect(page, path).toHaveURL(/\/(login|admin\/login)/);
    }
});
