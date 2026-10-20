# Writing tests

A pull request can't merge into `main` unless every test passes in CI, so new
features and bug fixes need tests too. Writing a test usually takes about 10 minutes.

## 1. Run the tests

```bash
docker compose up -d --wait                  # the database must be running
npm test                                     # every test, about 45 seconds
cd backend
node --test test/vendor.test.js              # one file only
```

The tests build their own throwaway database (`shahebbazar_test`) from
`database/baseline/`, start their own API on port 4100, and sign in as each role
through the normal code flow. Your development data is never touched.

## 2. Pick the file

Add your test to the file in `backend/test/` that matches your change:

| Your change | File |
| --- | --- |
| Public pages, search, business pages | `public.test.js` |
| Sign-in, codes, sessions | `auth.test.js` |
| Customer features (saved, reviews, messages, alerts) | `customer.test.js` |
| Business owner features (profile, photos, payments) | `vendor.test.js` |
| Listings and listing photos | `listings.test.js` |
| Businesses with managers | `members.test.js` |
| Admin pages | `admin.test.js` |
| Marketing passes | `marketing.test.js` |
| Who can use a route | `access.test.js` |
| A helper with no database | `unit.test.js` |

For a large new feature, start a new `<feature>.test.js` file. Use the pattern below,
and `npm test` picks it up automatically.

## 3. Copy this pattern

```js
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { call, query, startApi, stopApi } = require("./support/harness");

before(startApi);
after(stopApi);

describe("business payment methods", () => {
    it("the owner can save cash", async () => {
        const res = await call("PUT", "/vendors/1/payment-methods", {
            as: "owner",
            json: { methods: [{ payment_method: "cash" }] },
        });
        assert.equal(res.status, 200);

        // Check the database really changed, not just the status code.
        const rows = await query("SELECT payment_method FROM vendor_payment_methods WHERE vendor_id = 1");
        assert.equal(rows[0].payment_method, "cash");
    });
});
```

The tools in `test/support/harness.js`:

| Tool | What it does |
| --- | --- |
| `call(method, route, { as, json, form })` | Calls the real API (the route starts after `/api`) and returns `{ status, data }`. Use `json` for a JSON body and `form` for a `FormData` upload. |
| `as` | Who is calling: `"owner"`, `"otherVendor"`, `"customer"` or `"admin"`. Leave it out to call as a signed-out visitor. |
| `query(sql, params)` | Runs SQL on the test database and returns the rows. Use it to check what changed. |
| `JPEG`, `PNG` | Tiny valid images for upload tests. |

The seeded accounts behind `as`:

| `as` | Phone | Notes |
| --- | --- | --- |
| `owner` | +8801711000005 | Owns business 1, Rajshahi Mango Traders (`rajshahi-mango-traders`) |
| `otherVendor` | +8801711000006 | Owns business 6 |
| `customer` | +8801722000001 | |
| `admin` | +8801711000001 | |

All test files share one database and run one at a time. If your test changes
shared data, such as a business's status, put it back afterwards with
`try { ... } finally { ... }`, so other tests aren't affected.

## 4. What to test for every new route

- **It works for the right person:** check the status code **and** the database change.
- **Bad input is refused:** a 400 with an error message, and nothing saved.
- **The wrong people are refused:**
  - signed out gets 401
  - the wrong role gets 403
  - another business's owner gets 403 or 404

  For signed-in routes, add the route to the matching list at the top of
  `access.test.js` (`OWNER_OR_ADMIN`, `OWNER_ONLY`, `ADMIN_ONLY` or `CUSTOMER_ONLY`).
  It is then checked against every role automatically.

## 5. New permissions

If you protect a route with `requireFeature("...")`:

1. Add the feature to `FEATURES` in `backend/lib/access.js`.
2. Run `npm run docs:access` to update `docs/ACCESS-MATRIX.md`.

A test fails if the feature doesn't exist or the document is out of date.

## 6. Fixing a bug

Write a test that fails because of the bug **first**, then fix the bug and watch the
test pass. That test stops the bug coming back.

## Browser tests

API tests check the server. **Browser tests** (`e2e/`, Playwright) check what people actually see:
pages load, buttons work, nothing is covered up on a phone, and the browser logs no errors. Add
one when you change a page or a flow; see [e2e/README.md](../e2e/README.md) for how.

```bash
npm run test:browser:setup   # once
npm run test:browser
```

## Before opening a pull request

```bash
npm test
npm run test:browser
npm run lint
npm run typecheck
npm run build
```

CI runs the same checks. Evidence from manual and browser testing goes in
`docs/testing/`, one report per Jira task.
