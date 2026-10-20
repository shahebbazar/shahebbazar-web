// What a visitor sees without signing in.

import { test, expect, expectNoSideScroll, allowConsoleError } from "../fixtures";

test("the home page shows categories and featured businesses @phone", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Browse Categories/i })).toBeVisible();
    await expect(page.getByText(/Featured Businesses/i).first()).toBeVisible();
    await expectNoSideScroll(page);
});

test("search finds a business and labels paid placement as Sponsored", async ({ page }) => {
    await page.goto("/search?q=mango");
    await expect(page.getByRole("link", { name: "Rajshahi Mango Traders" }).first()).toBeVisible();
    await page.goto("/search");
    await expect(page.getByText("Sponsored").first()).toBeVisible();
});

test("a business page shows its details and payment methods @phone", async ({ page }) => {
    await page.goto("/business/rajshahi-mango-traders");
    await expect(page.getByRole("heading", { level: 1, name: "Rajshahi Mango Traders" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save/ }).first()).toBeVisible();
    await expect(page.getByText(/Opening Hours/i).first()).toBeVisible();
    await expectNoSideScroll(page);
});

test("the Bangla version of a page switches the interface language", async ({ page }) => {
    await page.goto("/?lang=bn");
    await expect(page.getByText("রাজশাহী ঘুরে দেখুন").first()).toBeVisible();
});

test("every footer link opens a page", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page.locator("footer a[href^='/']").evaluateAll((links) =>
        [...new Set(links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!.split("#")[0]))]
    );
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
        const res = await request.get(href);
        expect(res.status(), href).toBeLessThan(400);
    }
});

test("FAQ answers open when clicked", async ({ page }) => {
    await page.goto("/faq");
    const question = page.getByText("How do I stop offers?");
    await question.click();
    await expect(page.getByText(/takes effect straight away/)).toBeVisible();
});

test("an unknown address shows the not-found page", async ({ page, consoleErrors }) => {
    allowConsoleError(consoleErrors, /status of 404/); // the browser logs the page's own 404
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse businesses" })).toBeVisible();
});

test("a made-up unsubscribe link is refused politely", async ({ page }) => {
    await page.goto("/unsubscribe/1.2.sms.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await expect(page.getByText("This unsubscribe link is not valid")).toBeVisible();
});
