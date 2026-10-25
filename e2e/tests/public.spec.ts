// What a visitor sees without signing in.

import { test, expect, expectNoSideScroll, allowConsoleError } from "../fixtures";

test("the home page shows categories and featured businesses @phone", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Browse Categories/i })).toBeVisible();
    await expect(page.getByText(/Featured Businesses/i).first()).toBeVisible();
    await expectNoSideScroll(page);
});

test("home page cards fit their panels at laptop widths", async ({ page }) => {
    for (const width of [1280, 1366, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        for (const name of ["Featured Businesses", "Browse Categories"]) {
            const clipped = await page.getByRole("region", { name }).evaluate((section) =>
                [...section.querySelectorAll("li")].flatMap((card) => {
                    const edge = card.getBoundingClientRect().right;
                    return [...card.querySelectorAll("*")]
                        .filter((el) => el.children.length === 0 && el.textContent!.trim())
                        .filter((el) => el.getBoundingClientRect().right > edge + 1 || el.scrollWidth > el.clientWidth + 1)
                        .map((el) => el.textContent!.trim());
                })
            );
            expect(clipped, `${name} at ${width}px: text cut off or outside its card`).toEqual([]);
        }
    }
});

/** A JPEG's [width, height], from its frame header. */
function jpegSize(jpeg: Buffer): [number, number] | null {
    for (let i = 2; i + 9 < jpeg.length; ) {
        if (jpeg[i] !== 0xff) return null;
        const marker = jpeg[i + 1];
        if (marker >= 0xc0 && marker <= 0xc3) return [jpeg.readUInt16BE(i + 7), jpeg.readUInt16BE(i + 5)];
        i += 2 + jpeg.readUInt16BE(i + 2);
    }
    return null;
}

test("share cards are 1200 x 630 images, and each page points to its own", async ({ page, request, consoleErrors }) => {
    // Pages with a cover photo share it inside the card, so every one of these points to its card.
    const pages: Record<string, string> = {
        "/og/event/rajshahi-book-fair": "/events/rajshahi-book-fair",
        "/og/event/silk-city-trade-expo": "/events/silk-city-trade-expo",
        "/og/category/health": "/categories/health",
        "/og/business/rajshahi-mango-traders": "/business/rajshahi-mango-traders",
    };
    for (const [card, path] of Object.entries(pages)) {
        await page.goto(path);
        expect(await page.locator('meta[property="og:image"]').first().getAttribute("content")).toContain(card);
        const res = await request.get(card);
        expect(res.status(), card).toBe(200);
        expect(res.headers()["content-type"]).toBe("image/jpeg");
        expect(jpegSize(await res.body()), `${card} size`).toEqual([1200, 630]);
    }
    expect((await request.get("/og.png")).status()).toBe(200);
    allowConsoleError(consoleErrors, /status of 404/);
    expect((await request.get("/og/event/no-such-event")).status()).toBe(404);
});

test("the share menu on a business page opens in full and closes on a click outside @phone", async ({ page }) => {
    await page.goto("/business/rajshahi-mango-traders");
    const menu = page.locator("details").filter({ has: page.locator("summary", { hasText: "Share" }) });
    await menu.locator("summary").click();
    const options = menu.locator("a, button");
    await expect(options).toHaveCount(4); // WhatsApp, Facebook, X, Copy link (plus the phone's own share sheet where offered)
    // No box around the menu that hides its overflow may cut through it (the header card used to).
    const clippedBy = await menu.evaluate((details) => {
        const panel = details.querySelector("div")!.getBoundingClientRect();
        for (let el = details.parentElement; el && el !== document.body; el = el.parentElement) {
            const style = getComputedStyle(el);
            if (style.overflowX === "visible" && style.overflowY === "visible") continue;
            const box = el.getBoundingClientRect();
            if (panel.top < box.top || panel.bottom > box.bottom || panel.left < box.left || panel.right > box.right) {
                return `${el.tagName.toLowerCase()}.${el.className}`;
            }
        }
        return null;
    });
    expect(clippedBy, "the menu is cut off by").toBeNull();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(options.first()).toBeHidden();
});

test("search finds a business and labels paid placement as Sponsored", async ({ page }) => {
    await page.goto("/search?q=mango");
    await expect(page.getByRole("link", { name: "Rajshahi Mango Traders" }).first()).toBeVisible();
    await page.goto("/search");
    await expect(page.getByText("Sponsored").first()).toBeVisible();
});

test("a visit from the Sponsored results is marked as sponsored, and the mark leaves the address", async ({ page }) => {
    await page.goto("/search");
    const sponsored = page.locator("article").filter({ hasText: "Sponsored" }).first().getByRole("heading").getByRole("link");
    await expect(sponsored).toHaveAttribute("href", /^\/business\/[\w-]+\?from=sponsored$/);
    await sponsored.click();
    await expect(page).toHaveURL(/\/business\/[\w-]+$/);
});

test("search filters apply as soon as they change, with no Search button @phone", async ({ page }) => {
    await page.goto("/search");
    // The header has its own search box; the filters themselves have no Search button.
    await expect(page.getByRole("main").getByRole("button", { name: "Search", exact: true })).toHaveCount(0);

    await page.getByLabel("Category").selectOption({ label: "Medical" });
    await expect(page).toHaveURL(/category=health/);
    await expect(page.getByRole("link", { name: /Category: Medical/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rajshahi Medical Centre" }).first()).toBeVisible();

    await page.getByLabel("Sort by").selectOption("name");
    await expect(page).toHaveURL(/category=health.*sort=name|sort=name.*category=health/);

    // Removing the filter resets the dropdown as well as the results.
    await page.getByRole("link", { name: /Category: Medical/ }).click();
    await expect(page).not.toHaveURL(/category=/);
    await expect(page.getByLabel("Category")).toHaveValue("");
    await expectNoSideScroll(page);
});

test("a business page shows its details and payment methods @phone", async ({ page }) => {
    await page.goto("/business/rajshahi-mango-traders");
    await expect(page.getByRole("heading", { level: 1, name: "Rajshahi Mango Traders" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save/ }).first()).toBeVisible();
    await expect(page.getByText(/Opening Hours/i).first()).toBeVisible();
    // The phone number is shown: a Call link on a phone, plain text to read or copy on a computer.
    const call = page.getByRole("link", { name: "Call +8801711000005" });
    if ((page.viewportSize()?.width ?? 1280) >= 1024) {
        await expect(page.getByText("+8801711000005", { exact: true }).filter({ visible: true })).toHaveCount(1);
        await expect(call).toBeHidden();
    } else {
        await expect(call).toHaveAttribute("href", "tel:+8801711000005");
    }
    await expectNoSideScroll(page);
});

test("the Bangla version of a page switches the interface language", async ({ page }) => {
    await page.goto("/?lang=bn");
    await expect(page.getByText("রাজশাহী ঘুরে দেখুন").first()).toBeVisible();
});

test("switching language stays on the same page, with its filters", async ({ page }) => {
    await page.goto("/business/rajshahi-mango-traders");
    const languages = page.getByRole("navigation", { name: "Language" }).first();
    await languages.getByRole("link", { name: "বাংলা" }).click();
    await expect(page).toHaveURL(/\/business\/rajshahi-mango-traders\?lang=bn$/);
    await expect(page.getByRole("heading", { level: 1, name: "রাজশাহী আম ব্যবসায়ী" })).toBeVisible();
    await languages.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/business\/rajshahi-mango-traders$/);

    await page.goto("/events?type=festival");
    await languages.getByRole("link", { name: "বাংলা" }).click();
    await expect(page).toHaveURL(/\/events\?type=festival&lang=bn$/);
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
