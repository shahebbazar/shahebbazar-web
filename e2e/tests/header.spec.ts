// The header is the same for everyone (HeaderBar): search, the language switch and the account menu,
// on the public pages, the customer account, the business dashboard and admin.

import { test, expect, signIn, type Page } from "../fixtures";
import type { Who } from "../env";

const AREAS: { who: Who | null; path: string; account: RegExp }[] = [
    { who: null, path: "/", account: /^Log in$/ },
    { who: "customer", path: "/account", account: /Customer\. Switch account/ },
    { who: "owner", path: "/vendors/dashboard?vendor=1", account: /Business owner\. Switch account/ },
    { who: "admin", path: "/admin", account: /Administrator\. Account menu/ },
];

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

for (const { who, path, account } of AREAS) {
    test(`the header has search, the language switch and the account, for ${who ?? "a visitor"} @phone`, async ({ page, context }) => {
        if (who) await signIn(context, who);
        await page.goto(path);
        const header = page.getByRole("banner");

        if (isPhone(page)) {
            // Everything is in the menu drawer.
            await header.getByRole("button", { name: "Menu" }).click();
        }
        await expect(header.getByRole("searchbox").locator("visible=true")).toHaveCount(1);
        const languages = header.getByRole("navigation", { name: "Language" }).locator("visible=true");
        await expect(languages.getByRole("link", { name: "English" })).toBeVisible();
        await expect(languages.getByRole("link", { name: "বাংলা" })).toBeVisible();

        if (isPhone(page)) {
            await expect(header.getByRole(who ? "button" : "link", { name: who ? "Log out" : "Log in" })).toBeVisible();
        } else if (who) {
            await expect(header.getByLabel(account)).toBeVisible();
        } else {
            await expect(header.getByRole("link", { name: account })).toBeVisible();
        }
    });
}

test("the language switch works the same in the customer account", async ({ page, context }) => {
    await signIn(context, "customer");
    await page.goto("/account");
    await page.getByRole("banner").getByRole("navigation", { name: "Language" }).getByRole("link", { name: "বাংলা" }).click();
    await expect(page.getByRole("banner").getByRole("link", { name: "সাহেববাজার" })).toBeVisible();
    // Remembered across the account's own links, which carry no ?lang.
    await page.goto("/account/saved");
    await expect(page.getByRole("banner").getByRole("link", { name: "সাহেববাজার" })).toBeVisible();
});
