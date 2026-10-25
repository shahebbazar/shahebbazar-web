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

test("the product form lists each category followed by its own subcategories", async ({ page }) => {
    await page.goto("/vendors/dashboard/add-listing?vendor=1");
    const options = page.getByRole("combobox", { name: "Category" }).locator("option");
    await expect(options).not.toHaveCount(1);
    const labels = (await options.allTextContents()).slice(1); // after "Choose a category"
    const parentOf = new Map(
        (await sql<{ child: string; parent: string }>(
            `SELECT c.category_name AS child, p.category_name AS parent
             FROM categories c JOIN categories p ON p.category_id = c.category_parent_id`
        )).map((r) => [r.child, r.parent])
    );
    let heading = "";
    for (const label of labels) {
        if (!label.startsWith("— ")) { heading = label; continue; }
        expect(heading, `"${label}" sits under its own category`).toBe(parentOf.get(label.slice(2)));
    }
});

test("an owner of two businesses can still leave the business picker @phone", async ({ page, context }) => {
    await signIn(context, "twoBusinesses"); // replaces the owner's session from beforeEach
    await page.goto("/vendors/dashboard");
    await expect(page.getByRole("heading", { name: "Choose a business" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Shahebbazar" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Log out/ }).filter({ visible: true }).or(page.getByRole("button", { name: /menu/i }))).toBeVisible();
    await expectNoSideScroll(page);
    await page.setViewportSize({ width: 360, height: 780 }); // narrower than the test phone, as many are
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

test("someone who runs a business is sent to it, not to registering another one", async ({ page }) => {
    await page.goto("/events");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "My Business" })).toHaveAttribute("href", "/vendors/dashboard");
    await expect(nav.getByRole("link", { name: "Add Business" })).toHaveCount(0);

    await page.goto("/vendors/register");
    await expect(page.getByText("You already run Rajshahi Mango Traders.")).toBeVisible();
    await page.getByRole("link", { name: "Go to your dashboard" }).click();
    await expect(page).toHaveURL(/\/vendors\/dashboard/);
    await expect(page.getByRole("link", { name: "Bookings" })).toHaveCount(0);
});
