// Events (KAN-298): a business adds one with a photo, a customer says they're going, finds it in My
// events and gets the business's message; approval when switched on; the public pages, filters and
// calendar links.

import path from "node:path";
import { test, expect, signIn, sql, userIdOf, expectNoSideScroll } from "../fixtures";
import { ROOT } from "../env";

const PHOTO = path.join(ROOT, "database", "seed-assets", "seed-business-rajshahi-mango-traders.jpg");

// "YYYY-MM-DDTHH:MM" in Dhaka time, days from now, as the datetime-local input takes it.
const dhakaLocal = (days: number, hour: number) => {
    const date = new Date(Date.now() + days * 86400000 + 6 * 3600000).toISOString().slice(0, 10);
    return `${date}T${String(hour).padStart(2, "0")}:00`;
};

test("a business adds an event with a photo, a customer says they're going, and gets the business's message", async ({ browser }) => {
    const title = `E2E Lychee Fair ${Date.now() % 100000}`;
    await sql("DELETE FROM events WHERE event_title LIKE 'E2E Lychee Fair%'");

    // The owner adds it from the dashboard; with approval off (the default) it is live at once.
    const owner = await browser.newContext();
    await signIn(owner, "owner");
    const page = await owner.newPage();
    await page.goto("/vendors/dashboard/events?vendor=1");
    await page.getByRole("link", { name: "Add an event" }).click();
    await expect(page.getByText("Your event appears on the Events page as soon as you add it.")).toBeVisible();
    await page.getByLabel("Event name").fill(title);
    await page.getByLabel("Kind of event").selectOption("market");
    await page.getByLabel(/^Details/).fill("Fresh lychees from Natore and Rajshahi orchards, with tastings all afternoon.");
    await page.getByLabel(/^Starts/).fill(dhakaLocal(8, 14));
    await page.getByLabel(/^Ends/).fill(dhakaLocal(8, 18));
    await page.getByLabel(/^Venue or address/).fill("Shaheb Bazar Zero Point");
    // The first photo is the cover, so it is cropped to the share-card shape; this one is usable but small.
    await page.getByLabel("Choose event photos").setInputFiles(PHOTO);
    const crop = page.getByRole("dialog", { name: "Position your cover photo" });
    await expect(crop.getByText(/Will look a little soft when shared/)).toBeVisible();
    await crop.getByRole("button", { name: "Use this cover" }).click();
    await expect(crop).toBeHidden();
    await expect(page.getByRole("img", { name: "Chosen photo 1" })).toBeVisible();
    await page.getByRole("button", { name: "Add event" }).click();

    await expect(page.getByText("Event added and live.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Event photo 1" })).toBeVisible();

    // The saved cover can be cropped again; it is replaced in place.
    await page.getByRole("button", { name: "Crop" }).click();
    await crop.getByRole("button", { name: "Use this cover" }).click();
    await expect(page.getByText("Cover photo cropped.")).toBeVisible();
    const [event] = await sql<{ event_id: number; event_slug: string; event_status: string; event_image_url: string }>(
        "SELECT event_id, event_slug, event_status, event_image_url FROM events WHERE event_title = $1",
        [title]
    );
    expect(event.event_status).toBe("published");
    expect(event.event_image_url).toMatch(/^uploads\/event-/);

    // A customer finds it, says they're going, and sees it in My events.
    const customer = await browser.newContext();
    await signIn(customer, "customer");
    const customerPage = await customer.newPage();
    await customerPage.goto("/events?type=market");
    await customerPage.getByRole("link", { name: title }).click();
    await expect(customerPage.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(customerPage.getByText("0 going · 0 interested")).toBeVisible();
    await customerPage.getByRole("button", { name: "Going" }).click();
    await expect(customerPage.getByRole("button", { name: "Going" })).toHaveAttribute("aria-pressed", "true");
    await expect(customerPage.getByText("1 going · 0 interested")).toBeVisible();

    await customerPage.goto("/account/events");
    await expect(customerPage.getByRole("link", { name: title })).toBeVisible();
    await expect(customerPage.getByText("You're going")).toBeVisible();

    // The owner writes to everyone going; the customer finds it in Messages.
    await page.reload();
    await page.getByLabel("Message", { exact: true }).fill("Bring a bag: we're giving away samples.");
    await page.getByRole("button", { name: "Send to everyone going" }).click();
    await expect(page.getByText("Sent to 1 person. Replies arrive in Messages.")).toBeVisible();

    await customerPage.goto("/account/messages");
    await expect(customerPage.getByText(`Event: ${title}`)).toBeVisible();
    await expect(customerPage.getByText(`About ${title}: Bring a bag: we're giving away samples.`)).toBeVisible();

    await owner.close();
    await customer.close();
    await sql("DELETE FROM events WHERE event_id = $1", [event.event_id]);
});

test("with event approval switched on, a new event waits for an admin", async ({ browser }) => {
    const title = `E2E Approval Mela ${Date.now() % 100000}`;
    await sql("UPDATE platform_settings SET setting_value = 'true' WHERE setting_key = 'require_event_approval'");
    try {
        const owner = await browser.newContext();
        await signIn(owner, "owner");
        const page = await owner.newPage();
        await page.goto("/vendors/dashboard/events/new?vendor=1");
        await page.getByLabel("Event name").fill(title);
        await page.getByLabel(/^Starts/).fill(dhakaLocal(10, 11));
        await page.getByLabel(/^Venue or address/).fill("Rajshahi Chamber of Commerce");
        await page.getByRole("button", { name: "Add event" }).click();
        await expect(page.getByText("Event added. It appears publicly once an administrator approves it.")).toBeVisible();
        const [event] = await sql<{ event_id: number; event_slug: string }>("SELECT event_id, event_slug FROM events WHERE event_title = $1", [title]);
        expect((await page.request.get(`/events/${event.event_slug}`)).status(), "not public before approval").toBe(404);
        await owner.close();

        const admin = await browser.newContext();
        await signIn(admin, "admin");
        const adminPage = await admin.newPage();
        await adminPage.goto("/admin?tab=events");
        const card = adminPage.getByRole("article", { name: title });
        await expect(card).toBeVisible();
        await card.getByRole("button", { name: /Approve/ }).click();
        await expect(card).toBeHidden();
        await admin.close();

        expect((await sql<{ event_status: string }>("SELECT event_status FROM events WHERE event_id = $1", [event.event_id]))[0].event_status).toBe("published");
        await sql("DELETE FROM events WHERE event_id = $1", [event.event_id]);
    } finally {
        await sql("UPDATE platform_settings SET setting_value = 'false' WHERE setting_key = 'require_event_approval'");
    }
});

test("a photo too small for a cover can't be used as one", async ({ page, context }) => {
    // A 1 x 1 PNG.
    const tiny = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await signIn(context, "owner");
    await page.goto("/vendors/dashboard/events/new?vendor=1");
    await page.getByLabel("Choose event photos").setInputFiles({ name: "tiny.png", mimeType: "image/png", buffer: tiny });
    const crop = page.getByRole("dialog", { name: "Position your cover photo" });
    await expect(crop.getByText(/Too small to use as a cover/)).toBeVisible();
    await expect(crop.getByRole("button", { name: "Use this cover" })).toBeDisabled();
    await crop.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("img", { name: "Chosen photo 1" })).toBeHidden();
});

test("shared events get a full-size card with the cover photo, in the page's language", async ({ page, request }) => {
    await page.goto("/events/mango-season-tasting-day?lang=bn");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toMatch(/\/og\/event\/mango-season-tasting-day\?lang=bn&v=/);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "আমের মৌসুম স্বাদ উৎসব");

    const card = await request.get(new URL(image!).pathname + new URL(image!).search);
    expect(card.status()).toBe(200);
    expect(card.headers()["content-type"]).toBe("image/jpeg");
    // WhatsApp skips preview images much over 300 KB.
    expect((await card.body()).length).toBeLessThan(300_000);

    await page.goto("/events?lang=bn");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "রাজশাহীর ইভেন্ট");
});

test("the form says what to fix", async ({ page, context }) => {
    await signIn(context, "owner");
    await page.goto("/vendors/dashboard/events/new?vendor=1");
    await page.getByRole("button", { name: "Add event" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Check the highlighted details." })).toBeVisible();
    await expect(page.getByText("Give the event a name.")).toBeVisible();
    await expect(page.getByText("Choose when the event starts.")).toBeVisible();
    await expect(page.getByText("Say where the event is.")).toBeVisible();

    await page.getByText("Online", { exact: true }).click();
    await expect(page.getByLabel(/^Link to join/)).toBeVisible();
    await expect(page.getByLabel(/^Venue or address/)).toBeHidden();
});

test("the events page shows covers, filters by kind, and fits a phone @phone", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByRole("heading", { level: 1, name: "Events in Rajshahi" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mango Season Tasting Day" })).toBeVisible();
    await expectNoSideScroll(page);

    await page.getByRole("navigation", { name: "Filter events" }).getByRole("link", { name: "Festival" }).click();
    await expect(page).toHaveURL(/type=festival/);
    await expect(page.getByRole("link", { name: "Padma River Festival" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mango Season Tasting Day" })).toBeHidden();
});

test("an event page has the organiser, calendar links, and a log-in prompt for visitors @phone", async ({ page, request }) => {
    await page.goto("/events/mango-season-tasting-day");
    await expect(page.getByRole("heading", { level: 1, name: "Mango Season Tasting Day" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rajshahi Mango Traders" })).toBeVisible();
    await expect(page.getByRole("link", { name: /log in to say you're interested or going/i })).toHaveAttribute(
        "href",
        "/login?next=%2Fevents%2Fmango-season-tasting-day"
    );
    await expect(page.getByRole("link", { name: "Google Calendar" })).toHaveAttribute("href", /calendar\.google\.com/);
    const ics = await page.getByRole("link", { name: /\.ics/ }).getAttribute("href");
    const file = await request.get(ics!);
    expect(file.headers()["content-type"]).toContain("text/calendar");
    expect(await file.text()).toContain("SUMMARY:Mango Season Tasting Day");
    await expectNoSideScroll(page);
});

test("a cancelled event stays up with a notice, and answers can't be added", async ({ page, context }) => {
    const [event] = await sql<{ event_id: number }>("SELECT event_id FROM events WHERE event_slug = 'rajshahi-book-fair'");
    const customer = await userIdOf("customer");
    await sql("UPDATE events SET event_status = 'cancelled' WHERE event_id = $1", [event.event_id]);
    try {
        await signIn(context, "customer");
        await page.goto("/events/rajshahi-book-fair");
        await expect(page.getByRole("status").filter({ hasText: "This event has been cancelled." })).toBeVisible();
        await expect(page.getByRole("button", { name: "Going" })).toBeDisabled();
        await expect(page.getByRole("link", { name: "Google Calendar" })).toBeHidden();
        expect(await sql("SELECT 1 FROM event_responses WHERE event_id = $1 AND user_id = $2", [event.event_id, customer])).toHaveLength(0);
    } finally {
        await sql("UPDATE events SET event_status = 'published' WHERE event_id = $1", [event.event_id]);
    }
});
