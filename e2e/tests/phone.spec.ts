// Phone numbers in the browser (KAN-325): the number is how everyone signs in, so each form is tried
// with the ways people really type and paste it. The rules themselves are tested in
// backend/test/phone.test.js; these check the pages pass what people type through unchanged.

import type { Locator, Page } from "@playwright/test";
import { test, expect, allowConsoleError, codeSince, fillBusinessRegistration, logMark, newCustomer, sql } from "../fixtures";
import { PHONES } from "../env";

const BN = "০১২৩৪৫৬৭৮৯";
const bangla = (text: string) => text.replace(/[0-9]/g, (d) => BN[Number(d)]);
/** The local form of a stored number: +8801712345678 to 01712345678. */
const local = (stored: string) => `0${stored.slice(4)}`;
const ERROR = "Enter a Bangladesh mobile number: 10 digits after +880, such as 1712-345678.";

/** Fails when part of `element` is off the screen, left or right. */
async function expectWithinScreen(page: Page, element: Locator) {
    const box = (await element.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(box.x, "starts on the screen").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, "ends on the screen").toBeLessThanOrEqual(width);
}

/** Signs in on the login page with the number written as `typed`, reading the code the API printed for `stored`. */
async function signInWith(page: Page, typed: string, stored: string, path = "/login") {
    await page.goto(path);
    await page.locator("#customer-login-phone").fill(typed);
    const mark = logMark();
    await page.locator("form").getByRole("button", { name: /Send verification code|যাচাইকরণ কোড পাঠান/ }).click();
    await page.locator("#customer-login-code").fill(await codeSince(stored, mark));
    await page.locator("form").getByRole("button", { name: /Verify and log in|যাচাই করে লগ ইন করুন/ }).click();
    await expect(page).toHaveURL(/\/account(\?lang=bn)?$/);
}

test("a customer signs in with their number written three ways: dashes, +880 with spaces, and as pasted from WhatsApp @phone", async ({ page, context }) => {
    const { phone: stored } = await newCustomer("Format Tester");
    const n = local(stored); // 01791234567
    for (const typed of [
        `${n.slice(0, 5)}-${n.slice(5)}`, // 01791-234567
        `+880 ${n.slice(1, 5)} ${n.slice(5)}`, // +880 1791 234567
        `+880 ${n.slice(1, 5)}–${n.slice(5)}`, // pasted: non-breaking space and an en dash
    ]) {
        await signInWith(page, typed, stored);
        await context.clearCookies();
    }
});

test("on the Bangla page, a customer signs in with their number in Bangla digits @phone", async ({ page }) => {
    const { phone: stored } = await newCustomer("বাংলা সংখ্যা");
    await signInWith(page, bangla(local(stored)), stored, "/login?lang=bn");
});

test("numbers that aren't Bangladesh mobiles are refused with one clear message, and no code is made", async ({ page, consoleErrors }) => {
    allowConsoleError(consoleErrors, /status of 400/); // the browser logs each refused request itself
    const codes = async () => (await sql<{ n: number }>("SELECT count(*)::int AS n FROM otp_codes"))[0].n;
    await page.goto("/login");
    const box = page.locator("#customer-login-phone");
    // A landline, another country, a 012 number, a digit short, a digit too many, two 0s after +880.
    for (const bad of ["0721-775544", "+44 7911 123456", "01212345678", "0171234567", "017123456789", "+880 00 1712345678"]) {
        const before = await codes();
        await box.fill(bad);
        await page.getByRole("button", { name: "Send verification code" }).click();
        await expect(page.getByRole("alert").filter({ hasText: ERROR })).toBeVisible();
        await expect(box, "still on the number step").toBeVisible();
        expect(await codes(), `no code for ${bad}`).toBe(before);
    }
});

test("a number already registered can't be registered again by writing it differently", async ({ page, consoleErrors }) => {
    allowConsoleError(consoleErrors, /status of 409/); // the browser logs the refused registration itself
    await page.goto("/register/customer");
    await page.locator("#customer-register-name").fill("Copy Cat");
    // The seeded customer +8801722000001, written in Bangla digits with spaces.
    const typed = bangla("017 2200 0001");
    await page.locator("#customer-register-phone").fill(typed);
    const mark = logMark();
    await page.getByRole("button", { name: "Continue with phone verification" }).click();
    await page.locator("#customer-register-code").fill(await codeSince(PHONES.customer, mark));
    await page.getByRole("button", { name: "Complete registration" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That phone number is already registered." })).toBeVisible();
    const [{ n }] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE user_phone = $1", [PHONES.customer]);
    expect(n).toBe(1);
});

test("a business registered with its number in Bangla digits is stored in the one form, and its owner signs in with English digits", async ({ page, context }) => {
    const stored = `+880178${Date.now().toString().slice(-7)}`;
    const name = `Bangla Digits Stall ${Date.now() % 100000}`;
    await page.goto("/vendors/register");
    await fillBusinessRegistration(page, { name, phone: bangla(local(stored)) });
    const mark = logMark();
    await page.getByRole("button", { name: "Continue with phone verification" }).click();
    await expect(page.getByText(`Verification code sent to +880 ${stored.slice(4, 8)}-${stored.slice(8)}`)).toBeVisible();
    await page.locator("#vendor-register-code").fill(await codeSince(stored, mark));
    await page.getByRole("button", { name: "Complete registration" }).click();
    await expect(page).toHaveURL(/\/vendors\/dashboard/);
    const [vendor] = await sql<{ vendor_phone: string }>("SELECT vendor_phone FROM vendors WHERE vendor_name = $1", [name]);
    expect(vendor.vendor_phone).toBe(stored);

    await context.clearCookies();
    await page.goto("/login");
    await page.getByRole("tab", { name: "Business owner" }).click();
    await page.locator("#vendor-login-phone").fill(`+880 ${stored.slice(4, 8)}-${stored.slice(8)}`);
    const again = logMark();
    await page.getByRole("button", { name: "Send verification code" }).click();
    await page.locator("#vendor-login-code").fill(await codeSince(stored, again));
    await page.getByRole("button", { name: "Verify and log in" }).click();
    await expect(page).toHaveURL(/\/vendors\/dashboard/);
});

const HINT = "Your Bangladesh mobile number, where the sign-in code is sent by SMS. Type it with or without the first 0.";

test("every form's number box is the same: +880 in front, the example, and the hint behind the info button @phone", async ({ page }) => {
    for (const [path, id] of [
        ["/login", "customer-login-phone"],
        ["/admin/login", "admin-login-phone"],
        ["/register/customer", "customer-register-phone"],
        ["/vendors/register", "vendor_phone"],
    ] as const) {
        await page.goto(path);
        const input = page.locator(`#${id}`);
        await expect(input, path).toHaveAttribute("type", "tel");
        await expect(input, path).toHaveAttribute("inputmode", "tel");
        await expect(input, path).toHaveAttribute("placeholder", "1712-345678");
        await expect(input.locator("xpath=preceding-sibling::*[1]"), path).toHaveText("+880");
        // The name says the box follows +880, and the hint is still read out with it.
        await expect(input, path).toHaveAccessibleName("Mobile number after +880");
        await expect(input, path).toHaveAccessibleDescription(HINT);
        // The hint isn't under the box any more; it's behind the info button.
        await expect(page.getByText(HINT), path).toBeHidden();
        await expect(page.getByRole("button", { name: "About the mobile number" }), path).toBeVisible();
    }
    for (const path of ["/login?lang=bn", "/register/customer?lang=bn"]) {
        await page.goto(path);
        const input = page.getByRole("textbox", { name: /মোবাইল নম্বর/ });
        await expect(input, path).toHaveAttribute("placeholder", "১৭১২-৩৪৫৬৭৮");
        await expect(input, path).toHaveAccessibleDescription(/এসএমএসে লগ ইন কোড/);
        await expect(page.getByRole("button", { name: "মোবাইল নম্বর সম্পর্কে" }), path).toBeVisible();
    }
});

test("the info button shows the hint on hover and on keyboard focus, and hides it again", async ({ page }) => {
    await page.goto("/login");
    const info = page.getByRole("button", { name: "About the mobile number" });
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeHidden();
    await info.hover();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(HINT);
    await page.getByRole("heading", { level: 1 }).hover();
    await expect(tip).toBeHidden();
    await info.focus();
    await expect(tip, "keyboard users see it too").toBeVisible();
    await page.locator("#customer-login-phone").focus();
    await expect(tip).toBeHidden();
});

test("on a phone, tapping the info button shows the hint @phone", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "phone layout only");
    await page.goto("/login");
    await page.getByRole("button", { name: "About the mobile number" }).tap();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expectWithinScreen(page, page.getByRole("tooltip"));
});

test("the box tidies the number as it's typed: drops 0, +880 or 00880, groups it, and keeps Bangla digits Bangla", async ({ page }) => {
    await page.goto("/login");
    const box = page.locator("#customer-login-phone");
    const typing = async (keys: string, shown: string) => {
        await box.fill("");
        await box.pressSequentially(keys);
        await expect(box, `typing ${keys}`).toHaveValue(shown);
    };
    await typing("01712345678", "1712-345678");
    await typing("1712345678", "1712-345678");
    await typing("+8801712345678", "1712-345678");
    await typing("008801712345678", "1712-345678");
    await typing("+880 01712 345678", "1712-345678");
    await typing("017 1234 5678", "1712-345678");
    await typing("1712", "1712");
    await typing("17123", "1712-3");
    // Letters and other characters don't get in.
    await typing("abc017x12y345678", "1712-345678");
    // A digit too many stays, so it is refused rather than becoming someone else's number.
    await typing("017123456789", "1712-3456789");

    await page.goto("/login?lang=bn");
    const bn = page.locator("#customer-login-phone");
    await bn.pressSequentially("০১৭১২৩৪৫৬৭৮");
    await expect(bn).toHaveValue("১৭১২-৩৪৫৬৭৮");
});

test("pasting a number in any form gives the same box, including the invisible characters WhatsApp adds", async ({ page }) => {
    await page.goto("/login");
    const box = page.locator("#customer-login-phone");
    for (const pasted of ["+880 1712-345678", "+880 1712–345678", "(+880) 01712-345678", "00880 1712 345678", "​01712345678", "০১৭১২-৩৪৫৬৭৮"]) {
        await box.fill(pasted);
        await expect(box, JSON.stringify(pasted)).toHaveValue("1712-345678");
    }
});

test("editing in the middle keeps the cursor in place, and backspace over the dash deletes the digit before it", async ({ page }) => {
    await page.goto("/login");
    const box = page.locator("#customer-login-phone");
    await box.pressSequentially("1712345678");
    await expect(box).toHaveValue("1712-345678");
    // The cursor just after the dash: backspace takes the 2 before it.
    await box.evaluate((el: HTMLInputElement) => el.setSelectionRange(5, 5));
    await page.keyboard.press("Backspace");
    await expect(box).toHaveValue("1713-45678");
    // Typing in the middle puts the digit there and the cursor after it.
    await box.evaluate((el: HTMLInputElement) => el.setSelectionRange(3, 3));
    await page.keyboard.type("2");
    await expect(box).toHaveValue("1712-345678");
    expect(await box.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(4);
    await page.keyboard.type("9");
    await expect(box).toHaveValue("1712-9345678");
    expect(await box.evaluate((el: HTMLInputElement) => el.selectionStart), "past the dash").toBe(6);
});

test("an empty box isn't sent: the browser asks for the number first", async ({ page }) => {
    const codes = async () => (await sql<{ n: number }>("SELECT count(*)::int AS n FROM otp_codes"))[0].n;
    await page.goto("/login");
    const before = await codes();
    await page.locator("#customer-login-phone").pressSequentially("abc");
    await expect(page.locator("#customer-login-phone")).toHaveValue("");
    await page.getByRole("button", { name: "Send verification code" }).click();
    expect(await page.locator("#customer-login-phone").evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
    expect(await codes()).toBe(before);
});
