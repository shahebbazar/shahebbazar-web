// A business owner's dashboard.

import fs from "node:fs";
import path from "node:path";
import { test, expect, fillBusinessRegistration, setApproval, signIn, sql, expectNoSideScroll, userIdOf } from "../fixtures";
import { ROOT, UPLOAD_DIR } from "../env";

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

// KAN-334: an owner of two businesses was shown a page to choose one first, though the account
// switcher in the header already moves between them.
test("an owner of two businesses goes straight to an approved one, and the dashboard reopens the one they switched to @phone", async ({ page, context }) => {
    const wide = (page.viewportSize()?.width ?? 1280) >= 1024;
    await signIn(context, "twoBusinesses"); // Silk House, and Cloth Store waiting for approval
    await page.goto("/vendors/dashboard");
    await expect(page).toHaveURL(/\/vendors\/dashboard\?vendor=\d+$/);
    await expect(page.getByRole("heading", { name: "Choose a business" })).toHaveCount(0);
    // Silk House, the approved one, though Cloth Store comes first in the alphabet.
    await expect(page.locator("main")).toContainText("Shaheb Bazar Silk House");
    await expectNoSideScroll(page);

    // The switcher lists the customer account, then the businesses, approved ones first.
    if (wide) await page.locator("summary").filter({ visible: true }).first().click();
    else await page.getByRole("button", { name: /menu/i }).click();
    const accounts = page.locator('a[href="/account"], a[href^="/vendors/switch"]').filter({ visible: true });
    // Each link starts with its picture: a photo, or a first letter when there is none.
    await expect(accounts).toHaveText([/Customer account$/, /Shaheb Bazar Silk House$/, /Shaheb Bazar Cloth Store$/]);

    // After moving to the other business, the dashboard opens it again.
    await page.getByRole("link", { name: "Shaheb Bazar Cloth Store" }).filter({ visible: true }).first().click();
    await expect(page.locator("main")).toContainText("Shaheb Bazar Cloth Store");
    await page.goto("/vendors/dashboard");
    await expect(page.locator("main")).toContainText("Shaheb Bazar Cloth Store");
    await page.setViewportSize({ width: 360, height: 780 }); // narrower than the test phone, as many are
    await expectNoSideScroll(page);
});

test("registering another business opens it, and the dashboard reopens it afterwards (KAN-334)", async ({ page }) => {
    const name = `E2E Second Shop ${Date.now() % 100000}`;
    try {
        await page.goto("/vendors/register");
        await fillBusinessRegistration(page, { name, phone: "01711000005" });
        await page.getByRole("button", { name: "Register business" }).click();
        await expect(page).toHaveURL(/\/vendors\/dashboard\?vendor=\d+$/);
        await expect(page.locator("main")).toContainText(name);
        await page.goto("/vendors/dashboard");
        await expect(page).toHaveURL(/\/vendors\/dashboard\?vendor=\d+$/);
        await expect(page.locator("main")).toContainText(name);
    } finally {
        await sql("DELETE FROM vendors WHERE vendor_name = $1", [name]);
    }
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

// Each `approval` is what the admin setting is; the demo data starts with it off.
for (const approval of [false, true]) {
    test(`adding a product with approval ${approval ? "on says it waits, and it does" : "off makes it public at once"}`, async ({ page }) => {
        const title = `E2E Langra Mango ${approval ? "On" : "Off"} ${Date.now() % 100000}`;
        if (approval) await setApproval("listing", true);
        try {
            await page.goto("/vendors/dashboard/add-listing?vendor=1");
            await page.locator("input[name=listing_title]").fill(title);
            await page.locator("select[name=category_id]").selectOption({ index: 1 });
            await page.locator("input[name=listing_price]").fill("450");
            await page.getByRole("button", { name: "Publish listing" }).click();
            await expect(
                page.getByText(approval ? "Listing created. It appears publicly once an admin approves it." : "Listing created. It is public now.")
            ).toBeVisible();
            const [row] = await sql<{ listing_status: string }>("SELECT listing_status FROM vendor_listings WHERE listing_title = $1", [title]);
            expect(row.listing_status).toBe(approval ? "pending" : "approved");
        } finally {
            await sql("DELETE FROM vendor_listings WHERE listing_title = $1", [title]);
            await setApproval("listing", false);
        }
    });
}

// KAN-329: the file box showed only file names, so the owner couldn't see which photos they had picked.
test("chosen listing photos are shown before saving, and one can be taken out @phone", async ({ page }) => {
    const title = `E2E Photo Preview ${Date.now() % 100000}`;
    const seed = (name: string) => path.join(ROOT, "database", "seed-assets", name);
    await page.goto("/vendors/dashboard/add-listing?vendor=1");
    await page.locator("input[name=listing_title]").fill(title);
    await page.locator("select[name=category_id]").selectOption({ index: 1 });
    await page.getByLabel("Choose listing photos").setInputFiles([seed("seed-listing-khirsapat-mango.jpg"), seed("seed-listing-fazli-mango-wholesale.jpg")]);

    await expect(page.getByRole("img", { name: "Chosen photo 1" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Chosen photo 2" })).toBeVisible();
    await expect(page.getByText("Main photo")).toBeVisible();
    await page.getByRole("button", { name: "Remove chosen photo 2" }).click();
    await expect(page.getByRole("img", { name: "Chosen photo 2" })).toBeHidden();

    try {
        await page.getByRole("button", { name: "Publish listing" }).click();
        await expect(page.getByText(/^Listing created/)).toBeVisible();
        // Only the photo left in is uploaded, and the previews clear for the next listing.
        const rows = await sql("SELECT p.photo_id FROM listing_photos p JOIN vendor_listings l USING (listing_id) WHERE l.listing_title = $1", [title]);
        expect(rows).toHaveLength(1);
        await expect(page.getByRole("img", { name: "Chosen photo 1" })).toBeHidden();
    } finally {
        await sql("DELETE FROM vendor_listings WHERE listing_title = $1", [title]);
    }
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

// KAN-327: after a crop the page kept the cover's old address, whose file the server had deleted, so
// cropping again opened blank with "The photo could not be opened".
test("a cover can be cropped again and again without reloading the page", async ({ page }) => {
    const cover = () =>
        sql<{ id: number; url: string }>(
            "SELECT vendor_photo_id AS id, vendor_photo_url AS url FROM vendor_photos WHERE vendor_id = 1 ORDER BY vendor_photo_sort, vendor_photo_id LIMIT 1"
        ).then((rows) => rows[0]);
    const before = await cover();
    try {
        await page.goto("/vendors/dashboard/business?vendor=1");
        const crop = page.getByRole("dialog", { name: "Position your cover photo" });
        for (let round = 1; round <= 2; round++) {
            await page.getByRole("button", { name: "Crop" }).click();
            await expect(crop.locator("img")).toBeVisible();
            await expect(crop.getByText("The photo could not be opened")).toBeHidden();
            await crop.getByRole("button", { name: "Use this cover" }).click();
            await expect(crop).toBeHidden();
            await expect(page.getByText("Cover photo cropped.")).toBeVisible();
            // The thumbnail shows the new file, not the one the crop replaced.
            const { url } = await cover();
            expect(url, `round ${round}`).not.toBe(before.url);
            await expect(page.getByRole("img", { name: "Business photo 1" })).toHaveAttribute("src", new RegExp(`${url}$`));
        }
    } finally {
        await sql("UPDATE vendor_photos SET vendor_photo_url = $1 WHERE vendor_photo_id = $2", [before.url, before.id]);
        await sql("UPDATE vendors SET vendor_cover_url = $1 WHERE vendor_id = 1", [before.url]);
        // A crop deletes the file it replaced once nothing else uses it, so the seed photo is put back.
        const seed = path.join(UPLOAD_DIR, path.basename(before.url));
        if (!fs.existsSync(seed)) fs.copyFileSync(path.join(ROOT, "database", "seed-assets", path.basename(before.url)), seed);
    }
});

// KAN-330: a saved cover is cropped again from the photo it was cut from, after a reload too, so it can
// zoom back out to the whole photo.
test("a saved cover can be cropped again from the whole photo, starting where it was left", async ({ page }) => {
    const [before] = await sql<{ id: number; url: string }>(
        "SELECT vendor_photo_id AS id, vendor_photo_url AS url FROM vendor_photos WHERE vendor_id = 1 ORDER BY vendor_photo_sort, vendor_photo_id LIMIT 1"
    );
    // An 1800 x 945 cover with no original kept yet, as a cover saved before originals were.
    await page.goto("/");
    const png = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1800;
        canvas.height = 945;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(0, 0, 1800, 945);
        return canvas.toDataURL("image/png").split(",")[1];
    });
    const large = `uploads/e2e-large-cover-${Date.now()}.png`;
    fs.writeFileSync(path.join(UPLOAD_DIR, path.basename(large)), Buffer.from(png, "base64"));
    await sql("UPDATE vendor_photos SET vendor_photo_url = $1, vendor_photo_original_url = NULL, vendor_photo_crop = NULL WHERE vendor_photo_id = $2", [large, before.id]);
    try {
        await page.goto("/vendors/dashboard/business?vendor=1");
        const crop = page.getByRole("dialog", { name: "Position your cover photo" });
        const zoom = crop.getByRole("slider", { name: "Zoom" });
        await page.getByRole("button", { name: "Crop" }).click();
        await zoom.fill("2");
        await expect(crop.getByText("This crop: 900 × 473.", { exact: false })).toBeVisible();
        await crop.getByRole("button", { name: "Use this cover" }).click();
        await expect(page.getByText("Cover photo cropped.")).toBeVisible();

        await page.reload();
        await page.getByRole("button", { name: "Crop" }).click();
        await expect(zoom).toHaveValue("2");
        await expect(crop.getByText("This crop: 900 × 473.", { exact: false })).toBeVisible();
        await zoom.fill("1");
        await expect(crop.getByText("This crop: 1800 × 945.", { exact: false })).toBeVisible();
        await crop.getByRole("button", { name: "Cancel" }).click();
    } finally {
        await sql("UPDATE vendor_photos SET vendor_photo_url = $1, vendor_photo_original_url = NULL, vendor_photo_crop = NULL WHERE vendor_photo_id = $2", [before.url, before.id]);
        await sql("UPDATE vendors SET vendor_cover_url = $1 WHERE vendor_id = 1", [before.url]);
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

test("Bangla picked on the public site stays on in the dashboard and its tabs (KAN-328)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Language" }).first().getByRole("link", { name: "বাংলা" }).click();
    await expect(page).toHaveURL(/lang=bn/);

    // The dashboard's links carry no ?lang, so the choice has to be remembered.
    await page.goto("/vendors/dashboard?vendor=1");
    await expect(page.getByRole("heading", { level: 1, name: "ব্যবসা ড্যাশবোর্ড" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "ব্যবসা" });
    for (const tab of ["পণ্য ও সেবা", "পেমেন্ট পদ্ধতি", "রিভিউ", "মেসেজ", "ইভেন্ট", "সেটিংস"]) {
        await nav.getByRole("link", { name: tab }).click();
        await expect(page.getByRole("heading", { level: 1, name: tab })).toBeVisible();
    }

    // English from the dashboard's own switch, and it stays English.
    await page.getByRole("navigation", { name: "Language" }).getByRole("link", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await page.goto("/vendors/dashboard?vendor=1");
    await expect(page.getByRole("heading", { level: 1, name: "Provider Dashboard" })).toBeVisible();
});

test("with no language picked, the dashboard uses the account's own language (KAN-328)", async ({ page }) => {
    const owner = await userIdOf("owner");
    const [{ user_language }] = await sql<{ user_language: string }>("SELECT user_language FROM users WHERE user_id = $1", [owner]);
    await sql("UPDATE users SET user_language = 'bn' WHERE user_id = $1", [owner]);
    try {
        await page.goto("/vendors/dashboard?vendor=1");
        await expect(page.getByRole("heading", { level: 1, name: "ব্যবসা ড্যাশবোর্ড" })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "ব্যবসা" }).getByRole("link", { name: "আমার ব্যবসা" })).toBeVisible();
    } finally {
        await sql("UPDATE users SET user_language = $2 WHERE user_id = $1", [owner, user_language]);
    }
});
