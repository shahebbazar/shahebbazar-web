// A business owner's dashboard.

import { test, expect, signIn, sql, expectNoSideScroll } from "../fixtures";

test.beforeEach(async ({ context }) => {
    await signIn(context, "owner");
});

test("the dashboard shows the business and its figures @phone", async ({ page }) => {
    await page.goto("/vendors/dashboard?vendor=1");
    // On a phone the business name sits in the collapsed menu, so check the page content rather than visibility.
    await expect(page.locator("main")).toContainText("Rajshahi Mango Traders");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSideScroll(page);
});

test("switching business redirects within the site's own address", async ({ page }) => {
    // Behind the server's proxy the website sees its internal address, so the redirect must be relative.
    const response = await page.request.get("/vendors/switch?to=1&next=/vendors/dashboard/marketing", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe("/vendors/dashboard/marketing?vendor=1");

    await page.goto("/vendors/switch?to=1");
    await expect(page).toHaveURL(/\/vendors\/dashboard\?vendor=1$/);
    await expect(page.locator("main")).toContainText("Rajshahi Mango Traders");
});

test("adding a product says it waits for approval, and it does", async ({ page }) => {
    const title = `E2E Langra Mango ${Date.now() % 100000}`;
    await page.goto("/vendors/dashboard/add-listing?vendor=1");
    await page.locator("input[name=listing_title]").fill(title);
    await page.locator("select[name=category_id]").selectOption({ index: 1 });
    await page.locator("input[name=listing_price]").fill("450");
    await page.getByRole("button", { name: "Publish listing" }).click();
    await expect(page.getByText("Listing created. It appears publicly once an admin approves it.")).toBeVisible();
    const [row] = await sql<{ listing_status: string }>("SELECT listing_status FROM vendor_listings WHERE listing_title = $1", [title]);
    expect(row.listing_status).toBe("pending");
    await sql("DELETE FROM vendor_listings WHERE listing_title = $1", [title]);
});

test("the business details form and other dashboard pages open", async ({ page }) => {
    for (const [path, text] of [
        ["/vendors/dashboard/business?vendor=1", /Business/],
        ["/vendors/dashboard/listings?vendor=1", /Listings|Products/],
        ["/vendors/dashboard/messages?vendor=1", /Messages/],
        ["/vendors/dashboard/reviews?vendor=1", /Reviews/],
        ["/vendors/dashboard/payment-methods?vendor=1", /Payment Methods/],
        ["/vendors/dashboard/settings?vendor=1", /Settings/],
    ] as const) {
        const res = await page.goto(path);
        expect(res?.status(), path).toBe(200);
        await expect(page.getByRole("heading", { name: text }).first(), path).toBeVisible();
    }
});
