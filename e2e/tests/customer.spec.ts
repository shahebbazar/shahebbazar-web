// A signed-in customer: saving businesses, offers, My details and unsubscribing.

import { test, expect, signIn, sql, userIdOf, expectNoSideScroll } from "../fixtures";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { unsubscribeToken } = require("../../backend/services/marketing/consent");

const SLUG = "padma-handicrafts";
const vendorId = async () => (await sql<{ vendor_id: number }>("SELECT vendor_id FROM vendors WHERE vendor_slug = $1", [SLUG]))[0].vendor_id;

async function reset(who: "customer" | "customer2") {
    const [user, vendor] = [await userIdOf(who), await vendorId()];
    await sql("DELETE FROM marketing_consents WHERE user_id = $1 AND vendor_id = $2", [user, vendor]);
    await sql("DELETE FROM saved_businesses WHERE user_id = $1 AND vendor_id = $2", [user, vendor]);
}

test.beforeEach(async () => {
    await reset("customer");
    await reset("customer2");
});

test("saving a business offers SMS or email, unticked, and the choice shows on Saved businesses @phone", async ({ page, context }) => {
    await signIn(context, "customer");
    await page.goto(`/business/${SLUG}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const prompt = page.getByRole("dialog", { name: /Get offers from Padma Handicrafts/ });
    await expect(prompt).toBeVisible();
    const sms = prompt.getByRole("checkbox", { name: /SMS/ });
    const email = prompt.getByRole("checkbox", { name: /email/i });
    await expect(sms).not.toBeChecked();
    await expect(email).not.toBeChecked();
    await expect(email).toBeEnabled(); // the demo customer has an email address
    expect(await sql("SELECT 1 FROM marketing_consents WHERE vendor_id = $1", [await vendorId()]), "saving alone gives no consent").toHaveLength(0);

    await sms.check();
    await prompt.getByRole("button", { name: "Get offers" }).click();
    await expect(prompt.getByRole("status")).toBeVisible();

    await page.goto("/account/saved");
    await expect(page.getByRole("checkbox", { name: "SMS offers from Padma Handicrafts" })).toBeChecked();
    await expectNoSideScroll(page);
});

test("without an email address, email offers point to My details, and adding one enables them", async ({ page, context }) => {
    await signIn(context, "customer2");
    await page.goto(`/business/${SLUG}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const prompt = page.getByRole("dialog", { name: /Get offers/ });
    await expect(prompt.getByRole("checkbox", { name: /email/i })).toBeDisabled();
    await prompt.getByRole("link", { name: /My details/ }).click();

    await expect(page).toHaveURL(/\/account\/details/);
    const email = page.getByLabel(/Email address/);
    await email.fill("farhana.e2e@example.com");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText(/Saved/);

    await page.goto("/account/saved");
    await expect(page.getByRole("checkbox", { name: "Email offers from Padma Handicrafts" })).toBeEnabled();

    // Put the seed back: no email for this customer.
    await sql("UPDATE users SET user_email = NULL WHERE user_id = $1", [await userIdOf("customer2")]);
});

test("My details shows what is missing and refuses an invalid email", async ({ page, context }) => {
    await signIn(context, "customer2");
    await page.goto("/account/details");
    await expect(page.getByText("Mobile number, verified")).toBeVisible();
    await expect(page.getByText("Add one to get offers from businesses by email")).toBeVisible();
    await page.getByLabel(/Email address/).fill("not-an-email");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /valid email/ })).toBeVisible();
});

test("an unsubscribe link asks first, then stops offers without signing in", async ({ page }) => {
    const [user, vendor] = [await userIdOf("customer"), await vendorId()];
    await sql("INSERT INTO marketing_consents (user_id, vendor_id, consent_channel, consent_source) VALUES ($1, $2, 'sms', 'account')", [user, vendor]);

    await page.goto(`/unsubscribe/${unsubscribeToken(user, vendor, "sms")}`);
    await expect(page.getByText("Stop offers from Padma Handicrafts by SMS?")).toBeVisible();
    expect(await sql("SELECT 1 FROM marketing_consents WHERE user_id = $1 AND vendor_id = $2 AND consent_withdrawn_at IS NULL", [user, vendor]), "opening the link changes nothing").toHaveLength(1);

    await page.getByRole("button", { name: "Stop offers" }).click();
    await expect(page.getByText(/will not send you offers by SMS any more/)).toBeVisible();
    expect(await sql("SELECT 1 FROM marketing_consents WHERE user_id = $1 AND vendor_id = $2 AND consent_withdrawn_at IS NULL", [user, vendor])).toHaveLength(0);
});

test("every account tab is visible on a phone @phone", async ({ page, context }) => {
    await signIn(context, "customer");
    await page.goto("/account");
    const tabs = page.getByRole("navigation", { name: "Account" }).getByRole("link");
    await expect(tabs).toHaveCount(5);
    for (const tab of await tabs.all()) await expect(tab).toBeInViewport();
    await expectNoSideScroll(page);
});
