// A signed-in customer: saving businesses, offers, My details and unsubscribing.

import crypto from "node:crypto";
import path from "node:path";
import { test, expect, signIn, sql, userIdOf, expectNoSideScroll, allowConsoleError, codeSince, logMark } from "../fixtures";
import { ROOT } from "../env";

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

test("a profile photo shows in the header, and an area can be chosen @phone", async ({ page, context }) => {
    const user = await userIdOf("customer2");
    try {
        await signIn(context, "customer2");
        await page.goto("/account/details");
        await page.getByLabel("Choose a profile photo").setInputFiles(path.join(ROOT, "database", "seed-assets", "seed-business-rajshahi-mango-traders.jpg"));
        await expect(page.getByRole("status").filter({ hasText: "Photo saved." })).toBeVisible();
        await expect(page.getByRole("img", { name: "Your profile photo" })).toBeVisible();
        if ((page.viewportSize()?.width ?? 1280) >= 1024) await expect(page.locator("header summary img")).toHaveCount(1);

        const area = page.getByLabel(/Your area/);
        await area.selectOption({ index: 1 });
        await page.getByRole("button", { name: "Save changes" }).click();
        await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
        expect((await sql<{ location_id: number | null }>("SELECT location_id FROM users WHERE user_id = $1", [user]))[0].location_id).not.toBeNull();

        await page.getByRole("button", { name: "Remove" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Photo removed." })).toBeVisible();
        await expectNoSideScroll(page);
    } finally {
        await sql("UPDATE users SET user_avatar_url = NULL, location_id = NULL WHERE user_id = $1", [user]);
    }
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
    await expect(tabs).toHaveCount(6);
    for (const tab of await tabs.all()) await expect(tab).toBeInViewport();
    await expectNoSideScroll(page);
});

test("the preferred language is saved on My details", async ({ page, context }) => {
    const user = await userIdOf("customer2");
    try {
        await signIn(context, "customer2");
        await page.goto("/account/details");
        await page.getByRole("radio", { name: "বাংলা" }).check();
        await page.getByRole("button", { name: "Save changes" }).click();
        await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
        expect((await sql<{ user_language: string }>("SELECT user_language FROM users WHERE user_id = $1", [user]))[0].user_language).toBe("bn");
        await page.reload();
        await expect(page.getByRole("radio", { name: "বাংলা" })).toBeChecked();
    } finally {
        await sql("UPDATE users SET user_language = 'en' WHERE user_id = $1", [user]);
    }
});

test("deleting an account signs out for 30 days, and signing in again brings it back @phone", async ({ page, context }, testInfo) => {
    // A throwaway account, so the seeded ones are untouched.
    const phone = testInfo.project.name === "phone" ? "+8801799000088" : "+8801799000087";
    await sql("DELETE FROM users WHERE user_phone = $1", [phone]);
    const [{ user_id: id }] = await sql<{ user_id: number }>(
        `INSERT INTO users (user_phone, user_name, user_role, user_phone_verified_at) VALUES ($1, 'Leaving Soon', 'customer', now()) RETURNING user_id`,
        [phone]
    );
    const token = crypto.randomBytes(32).toString("hex");
    await sql(
        `INSERT INTO sessions (user_id, session_token_hash, session_expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [id, crypto.createHash("sha256").update(token).digest("hex")]
    );
    await context.addCookies([{ name: "shaheb_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);

    await page.goto("/account/details");
    await expect(page.getByText(/deactivated for 30 days/)).toBeVisible();
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByRole("dialog")).toContainText("within 30 days");
    await page.getByRole("button", { name: "Yes, delete my account" }).click();

    await expect(page).toHaveURL(/\/login\?account=deleted/);
    await expect(page.getByRole("status").filter({ hasText: /will be deleted in 30 days/ })).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === "shaheb_session")).toBe(false);
    const [user] = await sql<{ user_status: string; user_name: string }>("SELECT user_status, user_name FROM users WHERE user_id = $1", [id]);
    expect([user.user_status, user.user_name]).toEqual(["deactivated", "Leaving Soon"]);
    await expectNoSideScroll(page);

    await page.locator("#customer-login-phone").fill(phone);
    const mark = logMark();
    await page.getByRole("button", { name: "Send verification code" }).click();
    await page.locator("#customer-login-code").fill(await codeSince(phone, mark));
    await page.getByRole("button", { name: "Verify and log in" }).click();
    await expect(page).toHaveURL(/\/account\?welcome=back/);
    await expect(page.getByRole("status").filter({ hasText: /Welcome back/ })).toBeVisible();
    expect((await sql<{ user_status: string }>("SELECT user_status FROM users WHERE user_id = $1", [id]))[0].user_status).toBe("active");
    await sql("DELETE FROM users WHERE user_id = $1", [id]);
});

test("a business owner is told to hand over the business before deleting their account", async ({ page, context, consoleErrors }) => {
    allowConsoleError(consoleErrors, /409/);
    await signIn(context, "owner");
    await page.goto("/account/details");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.getByRole("button", { name: "Yes, delete my account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /run a business/ })).toBeVisible();
    await expect(page).toHaveURL(/\/account\/details/);
});

test("a conversation shows the business's photo, and its name opens the business page @phone", async ({ page, context }) => {
    const [user, vendor] = [await userIdOf("customer2"), await vendorId()];
    const [{ conversation_id: id }] = await sql<{ conversation_id: number }>(
        `INSERT INTO conversations (user_id, vendor_id, conversation_last_message_at) VALUES ($1, $2, now()) RETURNING conversation_id`,
        [user, vendor]
    );
    try {
        await sql("INSERT INTO messages (conversation_id, sender_user_id, message_body) VALUES ($1, $2, 'Are you open today?')", [id, user]);
        await signIn(context, "customer2");
        await page.goto("/account/messages");
        await expect(page.locator(`a[href$="/account/messages/${id}"] img`)).toHaveCount(1);
        await page.goto(`/account/messages/${id}`);
        const header = page.getByRole("link", { name: /Padma Handicrafts/ }).first();
        await expect(header.locator("img")).toHaveCount(1);
        await header.click();
        await expect(page).toHaveURL(new RegExp(`/business/${SLUG}`));
    } finally {
        await sql("DELETE FROM conversations WHERE conversation_id = $1", [id]);
    }
});

// KAN-333: the business's photo only appeared once the first message had been sent.
test("a new message shows the business's photo before anything is sent @phone", async ({ page, context }) => {
    await signIn(context, "customer2");
    await page.goto(`/account/messages/new?vendor=${SLUG}`);
    const to = page.locator("div").filter({ has: page.getByText("To", { exact: true }) }).filter({ hasText: "Padma Handicrafts" }).last();
    await expect(to.locator("img")).toHaveCount(1);
});
