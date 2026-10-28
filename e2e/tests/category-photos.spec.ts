// Category photos shown in place of a missing business cover (CategoryFallbackImage), and the share menu.

import type { Page } from "@playwright/test";
import { test, expect, sql, allowConsoleError } from "../fixtures";

// The stock photos used by components/shared/CategoryFallbackImage.tsx.
const METAL_FABRICATION = "photo-1504917595217";
const LIGHT_MANUFACTURING = "photo-1581092160562"; // metal-fabrication's parent
const ACCOUNTING = "photo-1554224155";
const DEFAULT_ARTWORK = "/images/category-default.svg";

// A 1 x 1 PNG, served for every stock photo so the tests never depend on images.unsplash.com.
const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
);

/** Serves the stock photos locally; any whose id is in `missing` answers 404 instead. */
async function stockPhotos(page: Page, missing: string[] = []) {
    await page.route("https://images.unsplash.com/**", (route) =>
        missing.some((id) => route.request().url().includes(id))
            ? route.fulfill({ status: 404, body: "" })
            : route.fulfill({ contentType: "image/png", body: PIXEL })
    );
}

/** Removes a business's cover for one test, and puts it (and its name) back afterwards. */
async function withoutCover(slug: string, run: () => Promise<void>) {
    const [before] = await sql<{ vendor_cover_url: string | null; vendor_name: string }>(
        "SELECT vendor_cover_url, vendor_name FROM vendors WHERE vendor_slug = $1",
        [slug]
    );
    await sql("UPDATE vendors SET vendor_cover_url = NULL WHERE vendor_slug = $1", [slug]);
    try {
        await run();
    } finally {
        await sql("UPDATE vendors SET vendor_cover_url = $2, vendor_name = $3 WHERE vendor_slug = $1", [
            slug,
            before.vendor_cover_url,
            before.vendor_name,
        ]);
    }
}

const cover = (page: Page) => page.getByRole("img", { name: /cover photograph/ });

test("a business without a cover shows its category's photo, not a letter @phone", async ({ page }) => {
    await stockPhotos(page);
    await withoutCover("uttara-light-engineering", async () => {
        await page.goto("/business/uttara-light-engineering");
        await expect(cover(page)).toHaveAttribute("src", new RegExp(METAL_FABRICATION));
        await expect.poll(() => cover(page).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    });
});

test("a missing category photo falls back to the parent category, then the default artwork", async ({ page, consoleErrors }) => {
    allowConsoleError(consoleErrors, /status of 404/); // the stock photos made to fail below
    await withoutCover("uttara-light-engineering", async () => {
        await stockPhotos(page, [METAL_FABRICATION]);
        await page.goto("/business/uttara-light-engineering");
        await expect(cover(page)).toHaveAttribute("src", new RegExp(LIGHT_MANUFACTURING));

        await page.unrouteAll();
        await stockPhotos(page, ["photo-"]); // every stock photo fails
        await page.goto("/business/uttara-light-engineering");
        await expect(cover(page)).toHaveAttribute("src", DEFAULT_ARTWORK);
        await expect.poll(() => cover(page).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    });
});

test("only a business in a broad category gets a photo picked from its name", async ({ page }) => {
    await stockPhotos(page);
    // DigiTax Accounting is only in Services, so its name picks the accounting photo.
    await withoutCover("digitax-accounting", async () => {
        await page.goto("/business/digitax-accounting");
        await expect(cover(page)).toHaveAttribute("src", new RegExp(ACCOUNTING));
    });
    // A metalworks with "Tax" in its name keeps its own category's photo.
    await withoutCover("uttara-light-engineering", async () => {
        await sql("UPDATE vendors SET vendor_name = 'Uttara Tax Engineering' WHERE vendor_slug = 'uttara-light-engineering'");
        await page.goto("/business/uttara-light-engineering");
        await expect(cover(page)).toHaveAttribute("src", new RegExp(METAL_FABRICATION));
    });
});

test("the share menu's own-share-sheet button says only \"More options\"", async ({ page }) => {
    // Desktop test browsers have no share sheet, so give the page one.
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "share", { value: async () => {}, configurable: true });
    });
    await page.goto("/business/rajshahi-mango-traders");
    const menu = page.locator("details").filter({ has: page.locator("summary", { hasText: "Share" }) });
    await menu.locator("summary").click();
    await expect(menu.locator("a, button")).toHaveCount(5);
    await expect(menu.getByRole("button", { name: "More options", exact: true })).toBeVisible();
});
