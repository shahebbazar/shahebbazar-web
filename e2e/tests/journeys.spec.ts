// The journeys a demo walks through, end to end across customer, business owner and admin: reviews and
// replies, reports, messages, a new business from registering to going public, signing up, browsing by
// category, and the admin sign-in.

import type { Browser, BrowserContext } from "@playwright/test";
import { test, expect, codeSince, logMark, newCustomer, signIn, signInUser, sql } from "../fixtures";
import { PHONES } from "../env";

const MANGO = "rajshahi-mango-traders"; // business 1, owned by PHONES.owner

/** A second browser signed in as someone else, for the other side of a journey. */
async function asSomeoneElse(browser: Browser, signInTo: (context: BrowserContext) => Promise<void>) {
    const context = await browser.newContext();
    await signInTo(context);
    return { context, page: await context.newPage() };
}

/** A mobile number nobody has registered, in the local form people type. */
const freshLocalPhone = (prefix: "0177" | "0178" | "0179") => `${prefix}${Date.now().toString().slice(-7)}`;
const stored = (local: string) => `+880${local.slice(1)}`;

test("a customer writes a review, it shows on the business page, and the owner's reply shows under it @phone", async ({ page, context, browser }) => {
    const customer = await newCustomer("Review Writer");
    await signInUser(context, customer.id);
    const body = `Sweet Himsagar, packed with care ${Date.now() % 100000}`;
    const reply = "Thank you! See you next season.";

    try {
        await page.goto(`/business/${MANGO}`);
        await page.getByRole("button", { name: "Write a Review" }).click();
        await page.getByRole("radio", { name: "4 / 5" }).click();
        await page.getByPlaceholder("Tell others about your experience (optional)").fill(body);
        await page.getByRole("button", { name: "Post review" }).click();
        await expect(page.getByRole("status")).toHaveText("Thanks! Your review is posted.");
        await page.reload();
        const review = page.getByRole("listitem").filter({ hasText: body });
        await expect(review).toContainText("Review Writer");

        const owner = await asSomeoneElse(browser, (c) => signIn(c, "owner"));
        await owner.page.goto("/vendors/dashboard/reviews?vendor=1");
        const card = owner.page.getByRole("listitem").filter({ hasText: body });
        await card.getByRole("button", { name: "Reply" }).click();
        await card.getByRole("textbox", { name: "Your reply" }).fill(reply);
        await card.getByRole("button", { name: "Post reply" }).click();
        await expect(card.getByText("Your reply (public)")).toBeVisible();
        await owner.context.close();

        await page.reload();
        await expect(review).toContainText("Reply from the owner");
        await expect(review).toContainText(reply);
    } finally {
        await sql("DELETE FROM reviews WHERE user_id = $1", [customer.id]);
    }
});

test("a reported review is hidden by an admin from Reports, and leaves the business page", async ({ page, context, browser }) => {
    const author = await newCustomer("Reported Author");
    const reporter = await newCustomer("Careful Reader");
    const body = `Total rubbish, never go here ${Date.now() % 100000}`;
    const [{ review_id }] = await sql<{ review_id: number }>(
        `INSERT INTO reviews (vendor_id, user_id, review_rating, review_body)
         VALUES ((SELECT vendor_id FROM vendors WHERE vendor_slug = $1), $2, 1, $3) RETURNING review_id`,
        [MANGO, author.id, body]
    );

    try {
        await signInUser(context, reporter.id);
        await page.goto(`/business/${MANGO}`);
        await page.getByRole("listitem").filter({ hasText: body }).getByRole("link", { name: "Report" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "Report this review" })).toBeVisible();
        await page.getByRole("radio", { name: "Fake review" }).check();
        await page.getByRole("textbox", { name: /Details/ }).fill("Written by a competitor.");
        await page.getByRole("button", { name: "Send report" }).click();
        await expect(page.getByRole("status")).toHaveText("Thank you. Our team will review your report.");

        const admin = await asSomeoneElse(browser, (c) => signIn(c, "admin"));
        await admin.page.goto("/admin/reports");
        const report = admin.page.getByRole("listitem").filter({ hasText: "Written by a competitor." });
        await expect(report).toContainText("Fake review");
        await expect(report).toContainText("by Careful Reader");
        await report.getByRole("button", { name: "Hide review" }).click();
        await admin.page.getByRole("dialog").getByRole("button", { name: "Hide review" }).click();
        await expect.poll(async () => (await sql<{ review_status: string }>("SELECT review_status FROM reviews WHERE review_id = $1", [review_id]))[0].review_status).toBe("hidden");
        await admin.context.close();

        await page.goto(`/business/${MANGO}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByText(body)).toHaveCount(0);
    } finally {
        await sql("DELETE FROM reports WHERE report_target_type = 'review' AND report_target_id = $1", [review_id]);
        await sql("DELETE FROM reviews WHERE review_id = $1", [review_id]);
    }
});

test("a customer messages a business, the owner replies from the dashboard, and the customer sees the reply @phone", async ({ page, context, browser }) => {
    const customer = await newCustomer("Curious Buyer");
    await signInUser(context, customer.id);
    const question = `Do you deliver to Upashahar? ${Date.now() % 100000}`;
    const answer = "Yes, every Tuesday and Friday.";

    await page.goto(`/message/${MANGO}`);
    await page.getByRole("textbox", { name: "Write your question…" }).fill(question);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/account\/messages\/\d+$/);
    await expect(page.getByText(question)).toBeVisible();
    const thread = page.url();

    const owner = await asSomeoneElse(browser, (c) => signIn(c, "owner"));
    await owner.page.goto("/vendors/dashboard/messages?vendor=1");
    await owner.page.getByRole("link").filter({ hasText: "Curious Buyer" }).first().click();
    await expect(owner.page.getByText(question)).toBeVisible();
    await owner.page.getByRole("textbox", { name: "Reply to Curious Buyer…" }).fill(answer);
    await owner.page.getByRole("button", { name: "Send" }).click();
    await expect(owner.page.getByText(answer)).toBeVisible();
    await owner.context.close();

    await page.goto(thread);
    await expect(page.getByText(answer)).toBeVisible();
});

test("a new business registers, is rejected with a reason, fixes it, and goes public once approved", async ({ page, browser }) => {
    const name = `E2E Fresh Mangoes ${Date.now() % 100000}`;
    const phone = freshLocalPhone("0178");
    const reason = "Add your opening hours and a photo of the shop front.";

    // Registering signs the owner in.
    await page.goto("/vendors/register");
    await page.getByRole("textbox", { name: "Business name" }).fill(name);
    await page.getByRole("textbox", { name: "Email address" }).fill("fresh.mangoes@example.com");
    await page.getByRole("textbox", { name: "Phone number" }).fill(phone);
    await page.getByRole("textbox", { name: "Street address" }).fill("12 Station Road");
    await page.getByRole("textbox", { name: "City or area" }).fill("Rajshahi");
    const mark = logMark();
    await page.getByRole("button", { name: "Continue with phone verification" }).click();
    await page.locator("#vendor-register-code").fill(await codeSince(stored(phone), mark));
    await page.getByRole("button", { name: "Complete registration" }).click();
    await expect(page).toHaveURL(/\/vendors\/dashboard/);
    const [vendor] = await sql<{ vendor_id: number; vendor_slug: string; vendor_status: string }>(
        "SELECT vendor_id, vendor_slug, vendor_status FROM vendors WHERE vendor_name = $1", [name]
    );
    expect(vendor.vendor_status).toBe("pending");
    expect((await page.request.get(`/business/${vendor.vendor_slug}`)).status(), "not public yet").toBe(404);

    const admin = await asSomeoneElse(browser, (c) => signIn(c, "admin"));
    await admin.page.goto("/admin");
    let card = admin.page.getByRole("article").filter({ hasText: name });
    await card.getByRole("button", { name: "Reject…" }).click();
    await card.getByRole("textbox", { name: `Why is “${name}” being rejected?` }).fill(reason);
    await card.getByRole("button", { name: "Reject", exact: true }).click();
    await expect.poll(async () => (await sql<{ vendor_status: string }>("SELECT vendor_status FROM vendors WHERE vendor_id = $1", [vendor.vendor_id]))[0].vendor_status).toBe("rejected");

    // The owner sees why, and sends it back.
    await page.goto(`/vendors/dashboard/business?vendor=${vendor.vendor_id}`);
    await expect(page.getByText("Your business was not approved.")).toBeVisible();
    await expect(page.getByText(`Reason: ${reason}`)).toBeVisible();
    // Registering asks only for the basics; a category, area and description are needed to submit it.
    await page.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Hospitals" });
    const area = page.getByRole("combobox", { name: "Area / Location" });
    await area.selectOption({ label: (await area.getByRole("option").nth(1).textContent())!.trim() });
    await page.getByRole("textbox", { name: "Description" }).fill("Fresh Rajshahi mangoes picked each morning in season.");
    await page.getByRole("button", { name: "Save & submit for approval" }).click();
    await expect.poll(async () => (await sql<{ vendor_status: string }>("SELECT vendor_status FROM vendors WHERE vendor_id = $1", [vendor.vendor_id]))[0].vendor_status).toBe("pending");

    await admin.page.goto("/admin");
    card = admin.page.getByRole("article").filter({ hasText: name });
    await expect(card).toContainText("Resubmitted after rejection");
    await card.getByRole("button", { name: "Approve & verify" }).click();
    await expect.poll(async () => (await sql<{ vendor_status: string }>("SELECT vendor_status FROM vendors WHERE vendor_id = $1", [vendor.vendor_id]))[0].vendor_status).toBe("approved");
    await admin.context.close();

    await page.goto(`/business/${vendor.vendor_slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.goto(`/search?q=${encodeURIComponent(name)}`);
    await expect(page.getByRole("link", { name }).first()).toBeVisible();
});

test("a new customer registers with their phone and lands on their account @phone", async ({ page }) => {
    const phone = freshLocalPhone("0177");
    await page.goto("/register/customer");
    await page.locator("#customer-register-name").fill("Nusrat Newcomer");
    await page.locator("#customer-register-phone").fill(phone);
    const mark = logMark();
    await page.getByRole("button", { name: "Continue with phone verification" }).click();
    await page.locator("#customer-register-code").fill(await codeSince(stored(phone), mark));
    await page.getByRole("button", { name: "Complete registration" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Hello, Nusrat Newcomer" })).toBeVisible();
});

test("browsing by category: all categories, then one, then a business in it @phone", async ({ page }) => {
    await page.goto("/categories");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: /^Medical/ }).first().click();
    await expect(page).toHaveURL(/\/categories\/health/);
    await page.getByRole("link", { name: "Rajshahi Medical Centre" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Rajshahi Medical Centre" })).toBeVisible();
});

test("an administrator signs in on the admin login page with a code", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { level: 1, name: "Administrator login" })).toBeVisible();
    await page.locator("#admin-login-phone").fill(PHONES.admin);
    const mark = logMark();
    await page.getByRole("button", { name: "Send verification code" }).click();
    await page.locator("#admin-login-code").fill(await codeSince(PHONES.admin, mark));
    await page.getByRole("button", { name: "Verify and log in" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Approvals" })).toBeVisible();
});
