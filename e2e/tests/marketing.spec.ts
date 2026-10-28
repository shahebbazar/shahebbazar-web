// The business owner's Marketing workspace (KAN-285, KAN-286): brief, drafts, editing, sending.

import { test, expect, signIn, sql, userIdOf, expectNoSideScroll } from "../fixtures";
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

    // Replace every [[placeholder]] in the subject and the one message (which all three channels follow) and save.
    for (const box of [subject, page.getByRole("textbox", { name: "Message", exact: true })]) {
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

test("one message makes all three channels; one channel can be changed on its own and put back @phone", async ({ page }) => {
    await newCampaign(page, { goal: "Reminder", products: ["Fazli Mango"] });
    const message = page.getByRole("textbox", { name: "Message", exact: true });
    await message.fill("Mango season is here!\nCome and taste the Fazli.");
    const emailPreview = page.getByLabel("Email preview");
    await expect(emailPreview).toContainText("Mango season is here!");
    await expect(emailPreview).toContainText("Shahebbazar");
    // The preview can show the email as mail apps in dark mode do.
    await expect(emailPreview).toHaveAttribute("data-scheme", "light");
    await page.getByRole("group", { name: "Preview colours" }).getByRole("button", { name: "Dark" }).click();
    await expect(emailPreview).toHaveAttribute("data-scheme", "dark");
    await page.getByRole("group", { name: "Preview colours" }).getByRole("button", { name: "Light" }).click();
    await expect(page.getByLabel("Facebook preview")).toContainText("#Rajshahi #ShahebBazar");
    await expect(page.getByLabel("WhatsApp preview")).toContainText("Mango season is here!");
    await expect(page.getByText("Made from your message")).toHaveCount(3);

    // Facebook alone gets different words; a later change to the message leaves it alone.
    await page.getByRole("button", { name: "Change for Facebook only" }).click();
    await page.getByRole("textbox", { name: "Facebook post" }).fill("Only on Facebook: free tasting!");
    await expect(page.getByText("Changed for Facebook only")).toBeVisible();
    await message.fill("Mango season is here!\nNow with Langra too.");
    await expect(page.getByLabel("Facebook preview")).toContainText("Only on Facebook: free tasting!");
    await expect(page.getByLabel("WhatsApp preview")).toContainText("Now with Langra too.");

    // And back to the message.
    await page.getByRole("button", { name: "Use my message again" }).click();
    await expect(page.getByLabel("Facebook preview")).toContainText("Now with Langra too.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved as version 2." })).toBeVisible();
    await page.reload();
    await expect(message).toHaveValue("Mango season is here!\nNow with Langra too.");
    await expectNoSideScroll(page);
    // Later tests count the Reminder campaigns.
    await sql("DELETE FROM marketing_campaigns WHERE campaign_id = $1", [Number(new URL(page.url()).pathname.split("/").pop())]);
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

    // Facebook and WhatsApp are posted by the owner, with the share buttons.
    await expect(page.getByText("You post this")).toHaveCount(2);
    await expect(page.getByRole("group", { name: "Share" }).getByRole("link", { name: "WhatsApp" })).toBeVisible();

    // No approval step: the draft can be sent straight away.
    const panel = page.getByRole("region", { name: "Send by email" });
    await expect(panel).toContainText("Goes to the 3 customers who chose to get your offers by email");
    await expect(panel).toContainText(/Uses 1 of your pass's email campaigns/);
    await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);

    // Switching a photo off doesn't block sending: the change is saved as part of the send.
    await page.getByRole("switch", { name: "Include a photo in the WhatsApp message" }).uncheck({ force: true });
    // Unsaved wording can't be shared: the share buttons wait for it to be saved.
    await expect(page.getByText("Save your changes first, so what you share is the saved version.")).toBeVisible();
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
    await expect(page.getByRole("region", { name: "Campaigns" }).getByRole("link", { name: /Reminder: Khirsapat Mango/ }).first()).toContainText("Sent");
    await expect(page.getByRole("region", { name: "Results" })).toContainText(/\d+ emails? sent in \d+ campaigns?/);
});

test("the owner posts on Facebook and WhatsApp themselves and marks it as posted; it shows in the results @phone", async ({ page }) => {
    await newCampaign(page, { goal: "New stock", products: ["Fazli Mango"] });
    const title = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";

    // Share buttons like the business page's: WhatsApp and X open with the wording filled in; Facebook
    // shares the business page and its preview card.
    const share = page.getByRole("group", { name: "Share" });
    const whatsapp = page.getByRole("group", { name: "Post on WhatsApp" });
    const facebook = page.getByRole("group", { name: "Post on Facebook" });
    // The page link in each carries the channel and campaign, so visits from it count for the campaign.
    const id = Number(new URL(page.url()).pathname.split("/").pop());
    await expect(share.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*Rajshahi%20Mango%20Traders/);
    await expect(share.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", new RegExp(`rajshahi-mango-traders%3Ffrom%3Dwhatsapp%26c%3D${id}`));
    await expect(share.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", new RegExp(`facebook\\.com/sharer/sharer\\.php\\?u=.*rajshahi-mango-traders%3Ffrom%3Dfacebook%26c%3D${id}$`));
    await expect(share.getByRole("link", { name: "X", exact: true })).toHaveAttribute("href", /^https:\/\/x\.com\/intent\/post\?text=Just%20in%20at%20Rajshahi%20Mango%20Traders!/);
    await expect(share.getByRole("link", { name: "Open the photo" })).toBeVisible();

    // WhatsApp: marked as posted without a link.
    await whatsapp.getByRole("button", { name: "Mark as posted" }).click();
    await expect(whatsapp).toContainText("Posted on WhatsApp");

    // Facebook: a link to another site is refused; the post's own link is kept.
    const link = facebook.getByLabel(/Posted it\?/);
    await link.fill("example.com/not-facebook");
    await facebook.getByRole("button", { name: "Mark as posted" }).click();
    await expect(facebook.getByRole("alert")).toContainText("isn't a Facebook link");
    await link.fill("facebook.com/rajshahimango/posts/e2e");
    await facebook.getByRole("button", { name: "Mark as posted" }).click();
    await expect(facebook).toContainText("Posted on Facebook");
    await expect(facebook.getByRole("link", { name: "View post" })).toHaveAttribute("href", "https://facebook.com/rajshahimango/posts/e2e");

    // A posted campaign is kept as a record; a mistaken mark can be undone.
    await expect(page.getByRole("button", { name: "Delete campaign" })).toHaveCount(0);
    await whatsapp.getByRole("button", { name: "Not posted yet? Undo" }).click();
    await expect(whatsapp.getByRole("button", { name: "Mark as posted" })).toBeVisible();
    await expectNoSideScroll(page);

    await page.goto(WORKSPACE);
    await expect(page.getByRole("region", { name: "Campaigns" }).getByRole("link", { name: title.trim() }).first()).toContainText("posted on Facebook");
    const results = page.getByRole("region", { name: "Results" });
    await expect(results).toContainText("Visits from your marketing");
    for (const source of ["Sponsored results", "Email", "Facebook", "WhatsApp", "Other sites"]) {
        await expect(results.getByRole("listitem", { name: new RegExp(`^${source}: \\d+$`) })).toBeVisible();
    }
    await expect(results.getByRole("link", { name: new RegExp(title.trim()) }).first()).toContainText(/\d+ visits? · posted on Facebook/);
    await results.getByRole("link", { name: "7 days" }).click();
    await expect(results.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "true");
    await expectNoSideScroll(page);

    // Following a campaign link opens the business page; the marks are taken out of the address.
    await page.goto(`/business/rajshahi-mango-traders?from=whatsapp&c=${id}`);
    await expect(page).toHaveURL(/\/business\/rajshahi-mango-traders$/);
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

// KAN-315: the customer account had the owner's letter on the button but a stock icon in the list,
// and no photo at all on the business side.
test("the customer account has the same picture on the button and in the list, on both sides @phone", async ({ page }) => {
    const wide = (page.viewportSize()?.width ?? 1280) >= 1024;
    const openSwitcher = async () => {
        if (wide) await page.locator("summary").filter({ visible: true }).first().click();
        else await page.getByRole("button", { name: /menu/i }).click();
    };
    const customerRow = () => page.getByRole("link", { name: "Customer account" }).filter({ visible: true }).first();
    const owner = await userIdOf("owner");

    // No photo: the owner's first letter, as on the button.
    await page.goto("/account");
    if (wide) await expect(page.locator("header summary span[aria-hidden]").first()).toHaveText("S");
    await openSwitcher();
    await expect(customerRow().locator("span[aria-hidden]")).toHaveText("S");

    const [{ photo }] = await sql<{ photo: string }>("SELECT vendor_photo_url AS photo FROM vendor_photos WHERE vendor_id = 2 ORDER BY vendor_photo_sort LIMIT 1");
    try {
        await sql("UPDATE users SET user_avatar_url = $1 WHERE user_id = $2", [photo, owner]);
        const src = new RegExp(`${photo.replace(/^\/+/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

        // Customer side: the photo on the button and on the row.
        await page.goto("/account");
        if (wide) await expect(page.locator("header summary img").first()).toHaveAttribute("src", src);
        await openSwitcher();
        await expect(customerRow().locator("img")).toHaveAttribute("src", src);

        // Business side: the button shows the business, and the row still shows the owner's photo.
        await page.goto("/vendors/dashboard?vendor=1");
        await openSwitcher();
        await expect(customerRow().locator("img")).toHaveAttribute("src", src);
    } finally {
        await sql("UPDATE users SET user_avatar_url = NULL WHERE user_id = $1", [owner]);
    }
});

test("an event campaign can be about one of the business's events, with no products, and its posts link to the event (KAN-298)", async ({ page }) => {
    await page.goto(WORKSPACE);
    await page.getByRole("link", { name: "New campaign" }).click();
    await page.getByRole("radio", { name: /^Event/ }).check();
    // The business's upcoming event is offered, and chosen to begin with.
    const event = page.getByRole("radio", { name: /Mango Season Tasting Day/ });
    await expect(event).toBeChecked();
    await expect(page.getByText(/^Optional for an event/)).toBeVisible();
    await expect(page.getByText(/from the event\./)).toBeVisible();
    await page.getByRole("button", { name: "Write the drafts" }).click();
    await expect(page).toHaveURL(/\/vendors\/dashboard\/marketing\/\d+/);

    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(/When: .+, 10:00 AM to 5:00 PM/);
    const share = page.getByRole("group", { name: "Share" });
    await expect(share.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", /%2Fevents%2Fmango-season-tasting-day/);
    await expect(share.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /%2Fevents%2Fmango-season-tasting-day/);
});
