// The business owner's Marketing workspace (KAN-285, KAN-286): brief, drafts, editing, sending.

import { test, expect, signIn, sql, expectNoSideScroll } from "../fixtures";
import type { Page } from "@playwright/test";

const WORKSPACE = "/vendors/dashboard/marketing?vendor=1";

async function newCampaign(page: Page, { goal, products, language = "English" }: { goal: string; products: string[]; language?: string }) {
    await page.goto(WORKSPACE);
    await page.getByRole("link", { name: "New campaign" }).click();
    await expect(page.getByRole("heading", { name: "New campaign" })).toBeVisible();
    await page.getByRole("radio", { name: new RegExp(`^${goal}`) }).check();
    for (const product of products) await page.getByRole("checkbox", { name: new RegExp(product) }).check();
    await page.getByRole("radio", { name: language }).check();
    await page.getByRole("button", { name: "Write the drafts" }).click();
    await expect(page).toHaveURL(/\/vendors\/dashboard\/marketing\/\d+/);
}

test.beforeEach(async ({ context }) => {
    await signIn(context, "owner");
});

test.afterAll(async () => {
    await sql("DELETE FROM marketing_campaigns WHERE vendor_id = 1");
});

test("the workspace shows the pass, what's ready and the campaigns @phone", async ({ page }) => {
    await page.goto("/vendors/dashboard?vendor=1");
    await page.goto(WORKSPACE);
    await expect(page.getByRole("heading", { level: 1, name: "Marketing" })).toBeVisible();
    await expect(page.getByText("Email campaigns left")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ready to promote" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New campaign" })).toBeVisible();
    await expectNoSideScroll(page);
});

test("an owner writes and fixes an offer campaign; parts still to fill in block sending", async ({ page }) => {
    await newCampaign(page, { goal: "Offer", products: ["Khirsapat Mango", "Fazli Mango"] });

    // The drafts use the business's real details; the missing offer is marked and blocks sending.
    const subject = page.getByLabel("Subject");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(/Khirsapat Mango \(Himsagar\): ৳2,800–৳4,200 per maund/);
    await expect(page.getByText("Before sending", { exact: true })).toBeVisible();
    await expect(page.locator("mark").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Send to 3 customers/ })).toBeDisabled();

    // Replace every [[placeholder]] in all three channels and save.
    for (const box of [subject, page.getByRole("textbox", { name: "Message", exact: true }), page.getByRole("textbox", { name: "Facebook post" }), page.getByRole("textbox", { name: "WhatsApp message" })]) {
        const value = await box.inputValue();
        await box.fill(value.replace(/\[\[[^\]]+\]\]/g, "10% off all mangoes this week"));
    }
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved as version 2.");
    await expect(page.getByText("Before sending", { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: /^Send to 3 customers/ })).toBeEnabled();

    await page.getByRole("link", { name: "Marketing" }).first().click();
    await expect(page.getByRole("link", { name: /Offer: Khirsapat Mango/ }).first()).toContainText("Draft");
});

test("a Bangla campaign is written in Bangla @phone", async ({ page }) => {
    await newCampaign(page, { goal: "New stock", products: ["Khirsapat Mango"], language: "বাংলা" });
    await expect(page.getByLabel("Subject")).toHaveValue(/রাজশাহী আম ব্যবসায়ী-এ নতুন এসেছে: খিরসাপাত আম/);
    await expectNoSideScroll(page);
});

test("deleting a campaign asks first", async ({ page }) => {
    await newCampaign(page, { goal: "Reminder", products: ["Fazli Mango"] });
    await page.getByRole("button", { name: "Delete campaign" }).click();
    await page.getByRole("dialog", { name: "Delete this campaign?" }).getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/vendors\/dashboard\/marketing\?vendor=1$/);
    await expect(page.getByRole("link", { name: /Reminder: Fazli Mango/ })).toHaveCount(0);
});

test("a draft can be deleted from the campaign list, after asking @phone", async ({ page }) => {
    await newCampaign(page, { goal: "New stock", products: ["Fazli Mango"] });
    await page.goto(WORKSPACE);
    const row = page.getByRole("link", { name: /New stock: Fazli Mango/ }).first();
    await expect(row).toBeVisible();
    const before = await page.getByRole("link", { name: /New stock: Fazli Mango/ }).count();
    await page.getByRole("button", { name: /^Delete New stock: Fazli Mango/ }).first().click();
    const dialog = page.getByRole("dialog", { name: /^Delete "New stock: Fazli Mango/ });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("link", { name: /New stock: Fazli Mango/ })).toHaveCount(before);
    await page.getByRole("button", { name: /^Delete New stock: Fazli Mango/ }).first().click();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("link", { name: /New stock: Fazli Mango/ })).toHaveCount(before - 1);
    await expectNoSideScroll(page);
});

test("an admin can read a campaign but not change it", async ({ browser }) => {
    const [{ campaign_id }] = await sql<{ campaign_id: number }>("SELECT campaign_id FROM marketing_campaigns WHERE vendor_id = 1 ORDER BY campaign_id LIMIT 1");
    const context = await browser.newContext();
    await signIn(context, "admin");
    const page = await context.newPage();
    await page.goto(`/vendors/dashboard/marketing/${campaign_id}?vendor=1`);
    await expect(page.getByLabel("Subject")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await context.close();
});

test("a business without a pass sees the free plan, what a pass adds, and can still write a campaign @phone", async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(context, "otherVendor"); // Uttara Light Engineering: no pass in the seed
    const page = await context.newPage();
    await page.goto("/vendors/dashboard/marketing?vendor=6");
    await expect(page.getByText("Free plan")).toBeVisible();
    await expect(page.getByText(/send 1 email campaign a month/)).toBeVisible();
    await expect(page.getByText("A Marketing pass adds")).toBeVisible();
    await expect(page.getByText("Free email campaigns left this month")).toBeVisible();
    await expect(page.getByText(/0 customers get your offers by email/)).toBeVisible();
    await expect(page.getByRole("link", { name: "New campaign" })).toBeVisible();
    await expectNoSideScroll(page);
    await context.close();
});

test("an offer with a coupon: the code and its last day are in the drafts, saved details are marked blue, and the coupon shows until when it works", async ({ page }) => {
    await page.goto(WORKSPACE);
    await page.getByRole("link", { name: "New campaign" }).click();
    await page.getByRole("radio", { name: /^Offer/ }).check();
    await page.getByRole("checkbox", { name: /Khirsapat Mango/ }).check();
    await page.getByLabel("Your offer").fill("10% off Khirsapat this week");
    await page.getByLabel(/Coupon code/).fill("mango-e2e");
    await expect(page.getByLabel(/Coupon code/)).toHaveValue("MANGO-E2E");
    await expect(page.getByText("needed: the coupon ends after this day")).toBeVisible();
    await page.getByLabel(/^Ends/).fill("2099-12-31");
    await page.getByRole("button", { name: "Write the drafts" }).click();
    await expect(page).toHaveURL(/\/vendors\/dashboard\/marketing\/\d+/);

    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(/Use code MANGO-E2E when you visit or order, until 31 December\./);
    const preview = page.getByLabel("Email preview");
    await expect(preview.locator("[data-fact]", { hasText: "Khirsapat Mango (Himsagar)" }).first()).toBeVisible();
    await expect(preview.locator("[data-fact]", { hasText: "৳2,800–৳4,200" }).first()).toBeVisible();
    await expect(page.getByText(/parts come from your saved business and product details/)).toBeVisible();

    const coupon = page.getByRole("region", { name: "Coupon" });
    await expect(coupon).toContainText("MANGO-E2E");
    await expect(coupon).toContainText("Valid until 31 Dec 2099");
    await expect(coupon.getByRole("button")).toHaveCount(0);

    await page.goto(WORKSPACE);
    await expect(page.getByText(/coupon MANGO-E2E, valid until 31 dec 2099/).first()).toBeVisible();
});

test("each channel's photos can be switched off, which saves as a new version @phone", async ({ page }) => {
    await newCampaign(page, { goal: "Reminder", products: ["Fazli Mango"] });
    const whatsapp = page.getByLabel("WhatsApp preview");
    const facebook = page.getByLabel("Facebook preview");
    await expect(whatsapp.locator("img")).toHaveCount(1);
    await expect(facebook.locator("img")).toHaveCount(1);
    await expect(page.getByLabel("Email preview").locator("img[src*='fazli']")).toHaveCount(1);

    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();
    await page.getByRole("switch", { name: "Include a photo in the WhatsApp message" }).uncheck({ force: true });
    await expect(whatsapp.locator("img")).toHaveCount(0);
    await expect(facebook.locator("img")).toHaveCount(1);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole("status").filter({ hasText: "Saved as version 2." })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("switch", { name: "Include a photo in the WhatsApp message" })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "Include photos in the email" })).toBeChecked();
    await expect(whatsapp.locator("img")).toHaveCount(0);
    await expectNoSideScroll(page);
});

test("a campaign is previewed and sent by email to the customers who chose email offers, once", async ({ page }) => {
    await page.goto(WORKSPACE);
    await expect(page.getByText(/3 customers get your offers by email/)).toBeVisible();
    await newCampaign(page, { goal: "Reminder", products: ["Khirsapat Mango"] });
    const id = Number(new URL(page.url()).pathname.split("/").pop());

    // Facebook and WhatsApp are previews for now.
    await expect(page.getByText("Preview only")).toHaveCount(2);
    await expect(page.getByText(/Posting to WhatsApp from Shaheb Bazar comes in a later release/)).toBeVisible();

    // No approval step: the draft can be sent straight away.
    const panel = page.getByRole("region", { name: "Send by email" });
    await expect(panel).toContainText("Goes to the 3 customers who chose to get your offers by email");
    await expect(panel).toContainText(/Uses 1 of your pass's email campaigns/);
    await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);

    // Switching a photo off doesn't block sending: the change is saved as part of the send.
    await page.getByRole("switch", { name: "Include a photo in the WhatsApp message" }).uncheck({ force: true });
    const sendButton = page.getByRole("button", { name: "Save and send to 3 customers" });
    await expect(sendButton).toBeEnabled();

    // Cancel sends nothing.
    await sendButton.click();
    const dialog = page.getByRole("dialog", { name: "Send this email to 3 customers?" });
    await expect(dialog).toContainText("Your changes are saved first.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect((await sql<{ n: number }>("SELECT COUNT(*)::int AS n FROM marketing_sends WHERE campaign_id = $1", [id]))[0].n).toBe(0);

    await sendButton.click();
    await dialog.getByRole("button", { name: "Send now" }).click();
    await expect(page.getByRole("region", { name: "Sent" })).toContainText("to 3 customers by email");
    await expect(page.getByLabel("Subject")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: /Send|Save changes|Delete campaign/ })).toHaveCount(0);
    // The version that went out (version 2, with the photo switched off) is recorded as approved.
    const [row] = await sql<{ version_number: number; photos: boolean }>(
        `SELECT v.version_number, (v.version_content->'whatsapp'->>'photos')::boolean AS photos
         FROM marketing_campaigns c JOIN marketing_campaign_versions v ON v.version_id = c.campaign_approved_version_id
         WHERE c.campaign_id = $1`, [id]
    );
    expect(row).toEqual({ version_number: 2, photos: false });

    const sends = await sql<{ send_address: string }>("SELECT send_address FROM marketing_sends WHERE campaign_id = $1 ORDER BY send_address", [id]);
    expect(sends.map((r) => r.send_address)).toEqual(["rumana.akter@example.com", "sajid.rahman@example.com", "tania.sultana@example.com"]);

    await page.goto(WORKSPACE);
    await expect(page.getByRole("link", { name: /Reminder: Khirsapat Mango/ }).first()).toContainText("Sent");
});

test("the account switcher shows which side you're on and moves between the customer account and the business @phone", async ({ page }) => {
    const wide = (page.viewportSize()?.width ?? 1280) >= 1024;
    // On a wide screen the switcher is a dropdown in the header; on a phone its list is in the menu drawer.
    const openSwitcher = async () => {
        if (wide) await page.locator("summary").filter({ visible: true }).first().click();
        else await page.getByRole("button", { name: /menu/i }).click();
    };

    await page.goto("/account");
    if (wide) await expect(page.locator("summary").filter({ hasText: "Customer" }).first()).toContainText("Shahidul Haque");
    await openSwitcher();
    const customer = page.getByRole("link", { name: "Customer account" }).filter({ visible: true });
    await expect(customer).toHaveAttribute("aria-current", "true");
    await page.getByRole("link", { name: "Rajshahi Mango Traders" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/vendors\/dashboard/);
    await expect(page.getByRole("heading", { name: "Provider Dashboard" })).toBeVisible();

    // On the business side the switcher shows the business; the customer account is one click away.
    if (wide) await expect(page.locator("summary").filter({ visible: true }).first()).toContainText("Business owner");
    await openSwitcher();
    await expect(page.getByRole("link", { name: "Rajshahi Mango Traders" }).filter({ visible: true }).first()).toHaveAttribute("aria-current", "true");
    await page.getByRole("link", { name: "Customer account" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/account$/);
});
