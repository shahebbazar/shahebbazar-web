// The admin area: approvals, settings, marketing passes and moderation pages.

import { test, expect, setApproval, signIn, sql, userIdOf, expectNoSideScroll } from "../fixtures";

test.beforeEach(async ({ context }) => {
    await signIn(context, "admin");
});

test("approving a listing from the queue publishes it and records this admin", async ({ page }) => {
    const title = `E2E Queue Item ${Date.now() % 100000}`;
    const [{ listing_id }] = await sql<{ listing_id: number }>(
        `INSERT INTO vendor_listings (vendor_id, category_id, listing_title, listing_slug)
         VALUES (1, (SELECT min(category_id) FROM categories), $1, $2) RETURNING listing_id`,
        [title, `e2e-queue-item-${Date.now()}`]
    );
    await page.goto("/admin?tab=listings");
    const card = page.locator("li, article").filter({ hasText: title }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
    await card.getByRole("button", { name: "Approve" }).click();
    await expect.poll(async () => (await sql<{ listing_status: string }>("SELECT listing_status FROM vendor_listings WHERE listing_id = $1", [listing_id]))[0].listing_status).toBe("approved");
    const [audit] = await sql<{ audit_actor_user_id: number }>(
        "SELECT audit_actor_user_id FROM audit_logs WHERE audit_target_type = 'listing' AND audit_target_id = $1 ORDER BY audit_id DESC LIMIT 1",
        [listing_id]
    );
    expect(audit.audit_actor_user_id).toBe(await userIdOf("admin"));
    await sql("DELETE FROM vendor_listings WHERE listing_id = $1", [listing_id]);
});

const approvalSetting = async () =>
    (await sql<{ setting_value: boolean }>("SELECT setting_value FROM platform_settings WHERE setting_key = 'require_business_approval'"))[0].setting_value;

test("turning business approval off asks first in the page, and Approvals then warns @phone", async ({ page }) => {
    await setApproval("business", true);
    await page.goto("/admin/settings");
    const toggle = page.getByRole("switch", { name: "Approve new businesses before they appear" });
    await expect(toggle).toBeChecked();

    // Cancel changes nothing.
    await toggle.click();
    const dialog = page.getByRole("dialog", { name: /Turn off/ });
    await expect(dialog).toBeVisible();
    await expectNoSideScroll(page);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeChecked();

    try {
        await toggle.click();
        await dialog.getByRole("button", { name: "Turn off" }).click();
        await expect(toggle).not.toBeChecked();
        // The switch flips before the save finishes; wait for the saved value before moving on.
        await expect.poll(() => approvalSetting()).toBe(false);
        await expect(toggle).toBeEnabled();

        await page.goto("/admin");
        await expect(page.getByText(/Approval is switched off for new businesses/)).toBeVisible();

        await page.goto("/admin/settings");
        await page.getByRole("switch", { name: "Approve new businesses before they appear" }).click(); // back on: no question
        await expect(page.getByRole("switch", { name: "Approve new businesses before they appear" })).toBeChecked();
        await expect.poll(() => approvalSetting()).toBe(true);
    } finally {
        await setApproval("business", false);
    }
});

const reviewsSetting = async () =>
    (await sql<{ setting_value: boolean }>("SELECT setting_value FROM platform_settings WHERE setting_key = 'show_removed_account_reviews'"))[0]?.setting_value ?? true;

test("an admin can hide reviews from deleted accounts on Settings, and show them again @phone", async ({ page }) => {
    // A review from an account removed after its 30 days, shown as from a "Former customer".
    const body = `E2E review from a deleted account ${Date.now() % 100000}`;
    const [{ user_id }] = await sql<{ user_id: number }>(
        `INSERT INTO users (user_phone, user_name, user_role, user_status)
         VALUES ('deleted-e' || floor(random() * 1e9)::text, 'Former customer', 'customer', 'deleted') RETURNING user_id`
    );
    await sql(
        `INSERT INTO reviews (vendor_id, user_id, review_rating, review_body)
         VALUES ((SELECT vendor_id FROM vendors WHERE vendor_slug = 'rajshahi-mango-traders'), $1, 4, $2)`,
        [user_id, body]
    );
    const review = page.getByText(body);

    try {
        await page.goto("/business/rajshahi-mango-traders");
        await expect(review).toBeVisible();

        await page.goto("/admin/settings");
        const reviews = page.getByRole("region", { name: "Reviews" });
        const toggle = reviews.getByRole("switch", { name: "Show reviews from deleted accounts" });
        await expect(toggle).toBeChecked();
        await expect(reviews.getByText(/after 30 days the reviews show again/)).toBeVisible();

        await toggle.click();
        const dialog = page.getByRole("dialog", { name: /Turn off/ });
        await expect(dialog).toContainText("switch it back on at any time");
        await expect(dialog).not.toContainText("Approvals");
        await dialog.getByRole("button", { name: "Turn off" }).click();
        await expect(reviews.getByText("Off: the reviews stay hidden for good.")).toBeVisible();
        await expect.poll(() => reviewsSetting()).toBe(false);

        await page.goto("/business/rajshahi-mango-traders");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(review).toHaveCount(0);

        await page.goto("/admin/settings");
        await page.getByRole("switch", { name: "Show reviews from deleted accounts" }).click(); // back on: no question
        await expect.poll(() => reviewsSetting()).toBe(true);
        await page.goto("/business/rajshahi-mango-traders");
        await expect(review).toBeVisible();
    } finally {
        await sql("DELETE FROM platform_settings WHERE setting_key = 'show_removed_account_reviews'");
        await sql("DELETE FROM reviews WHERE user_id = $1", [user_id]);
        await sql("DELETE FROM users WHERE user_id = $1", [user_id]);
    }
});

test("Settings shows when each setting last changed in Dhaka time, the same on the server and in the browser", async ({ page }) => {
    // 20:47 UTC on 25 October is 2:47 the next morning in Dhaka. Browsers can write that hour as
    // "02:47" where the server writes "2:47", which broke the page (a hydration error).
    await sql(
        `INSERT INTO platform_settings (setting_key, setting_value, setting_updated_at, setting_updated_by)
         VALUES ('show_removed_account_reviews', 'true', '2026-10-25T20:47:00Z', $1)`,
        [await userIdOf("admin")]
    );
    try {
        await page.goto("/admin/settings");
        await expect(page.getByRole("region", { name: "Reviews" })).toContainText(/Last changed 26 Oct, 2:47 by /);
    } finally {
        await sql("DELETE FROM platform_settings WHERE setting_key = 'show_removed_account_reviews'");
    }
});

test("ending a marketing pass asks first, and Cancel keeps it running", async ({ page }) => {
    const [pass] = await sql<{ subscription_id: number; vendor_name: string }>(
        `SELECT s.subscription_id, v.vendor_name FROM vendor_marketing_subscriptions s JOIN vendors v USING (vendor_id)
         WHERE s.subscription_status = 'active' ORDER BY s.subscription_id LIMIT 1`
    );
    await page.goto("/admin/marketing");
    const card = page.locator("li, article, div").filter({ hasText: pass.vendor_name }).filter({ has: page.getByRole("button", { name: "End now" }) }).last();
    await card.getByRole("button", { name: "End now" }).click();
    const dialog = page.getByRole("dialog", { name: `End ${pass.vendor_name}'s pass now?` });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    const [row] = await sql<{ subscription_status: string }>("SELECT subscription_status FROM vendor_marketing_subscriptions WHERE subscription_id = $1", [pass.subscription_id]);
    expect(row.subscription_status).toBe("active");
});

test("every admin page opens", async ({ page }) => {
    for (const [path, heading] of [
        ["/admin", "Approvals"],
        ["/admin/reports", "Reports"],
        ["/admin/reviews", "Reviews"],
        ["/admin/trends", "Search trends"],
        ["/admin/categories", "Categories"],
        ["/admin/marketing", "Marketing passes"],
        ["/admin/settings", "Settings"],
    ] as const) {
        const res = await page.goto(path);
        expect(res?.status(), path).toBe(200);
        await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    }
});

test("a customer cannot open the admin area", async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(context, "customer");
    const page = await context.newPage();
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);
    await context.close();
});

test("the free plan's monthly emails are a number an admin sets on Settings", async ({ page }) => {
    await page.goto("/admin/settings");
    const marketing = page.getByRole("region", { name: "Marketing" });
    const input = marketing.getByLabel("Free email campaigns a month");
    await expect(input).toHaveValue("1");
    const save = marketing.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();
    try {
        await input.fill("3");
        await save.click();
        await expect(marketing.getByRole("status")).toHaveText("Saved.");
        await expect
            .poll(async () => (await sql<{ setting_value: number }>("SELECT setting_value FROM platform_settings WHERE setting_key = 'free_marketing_emails_per_month'"))[0]?.setting_value)
            .toBe(3);
        await input.fill("50");
        await expect(save).toBeDisabled();
    } finally {
        await sql("DELETE FROM platform_settings WHERE setting_key = 'free_marketing_emails_per_month'");
    }
});
