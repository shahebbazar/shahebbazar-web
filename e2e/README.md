# Browser tests

These click through the real site in a browser, like a user would: the built website and the API
running against a throwaway database (`shahebbazar_e2e`). They catch what the API tests can't,
such as a broken page, a button that does nothing, something covered up on a phone screen, or an
error in the browser console. CI runs them on every pull request (the **Browser tests** check).

## Run them

```bash
docker compose up -d --wait     # the database must be running
npm run test:browser:setup      # once: installs Playwright and its browser
npm run test:browser            # loads the database, builds the site, runs every test (about 2 minutes)
```

They use their own ports (site 3200, API 4200), database and build folder (`.next-e2e`), so your
development servers and data are untouched, and they can run while `npm run dev` is running.

For a quicker rerun when only tests changed, skip the build: `E2E_SKIP_BUILD=1 npm run test:browser`
(PowerShell: `$env:E2E_SKIP_BUILD=1; npm run test:browser`, then `Remove-Item Env:E2E_SKIP_BUILD`).
To see what happened after a failure: `npm --prefix e2e run report` (screenshots and a step-by-step
trace of each failed test). The API's own log is in `e2e/test-results/api.log`.

## What is covered

| File | Covers |
| --- | --- |
| `tests/public.spec.ts` | Home, search and Sponsored, filters applying on change, a business page, Bangla, every footer link, FAQ, not-found page, a bad unsubscribe link |
| `tests/auth.spec.ts` | Signing in with a code as a customer and a business owner, signing out, a wrong code, private pages when signed out |
| `tests/customer.spec.ts` | Saving a business and the offers prompt, email offers and My details, unsubscribing, account tabs on a phone |
| `tests/business.spec.ts` | The owner's dashboard, adding a product (waits for approval), every dashboard page |
| `tests/admin.spec.ts` | Approving from the queue (audited), the approval switch and its confirmation, ending a pass (Cancel), every admin page, customers kept out |

Every test runs on a desktop browser. Tests tagged `@phone` in their name also run on a phone-sized
screen. **Every test fails if the browser logs an error**; a test that expects one (for example the
404 of the not-found page) declares it with `allowConsoleError`.

## Writing one

```ts
import { test, expect, signIn, sql } from "../fixtures";

test("an owner sees their reviews", async ({ page, context }) => {
    await signIn(context, "owner");                  // seeded account, no code needed
    await page.goto("/vendors/dashboard/reviews?vendor=1");
    await expect(page.getByRole("heading", { name: /Reviews/ }).first()).toBeVisible();
});
```

- Find things the way a user would: `getByRole`, `getByLabel`, `getByText`. Avoid CSS classes.
- Tests share one database and run one at a time, so put back anything you change (`sql(...)`
  helps), or use data the test creates itself.
- Sign-in through the page is tested once in `auth.spec.ts`; other tests use `signIn(context, who)`.
