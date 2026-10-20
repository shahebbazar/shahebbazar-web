// The admin area: approvals, settings, marketing passes and moderation pages.

import { test, expect, signIn, sql, userIdOf, expectNoSideScroll } from "../fixtures";

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
        await sql("UPDATE platform_settings SET setting_value = 'true' WHERE setting_key = 'require_business_approval'");
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
