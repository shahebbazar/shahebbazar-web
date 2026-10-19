# KAN-283 Marketing Stage 1 Validation Report

## Jira task

KAN-283: [Sprint 2] Marketing Stage 1: Subscription foundation and sponsored-placement expiry (sub-task of KAN-243)

## What was built

| Area | Change |
| --- | --- |
| Database | `marketing_packages`, `vendor_marketing_subscriptions` and `marketing_usage_events`, with status, date and allowance checks and an index that allows at most one waiting or running pass per business. Added to the baseline and as `database/migrations/001_marketing_passes.sql` for existing databases (safe to run twice). |
| Passes | 7, 30 and 90-day passes at the proposed BDT 299, 999 and 2,499, with email-campaign (1, 4, 12) and AI-draft (10, 40, 120) allowances. Prices are data, so a change after the client meeting is one row. |
| Sponsored expiry | `v_business_cards` treats a business as featured only while `vendor_featured_until` is in the future, so sponsored placement on the home and search pages ends by itself when a pass ends. Fixes "featured listings never expire". |
| Seeded featured businesses | Each one is given a running pass that ends when its placement does, so the admin page explains every sponsored business. |
| Entitlement service | `backend/services/marketing/entitlements.js` is the only place that decides what a business may do: effective status (a running pass past its end date counts as expired), allowance used and left, plain-language reasons, and `useEntitlement`, which locks the pass so two requests cannot both spend the last allowance. After a pass ends, one free email a week remains (client decision 14, configurable). |
| Admin | **Admin → Marketing** (`/admin/marketing`): the three passes, a form to give an approved business a pass, and for each pass Extend 7 or 30 days, Set end date, End now, Suspend, Resume and Cancel. Every change runs in a transaction, is written to `audit_logs` against the signed-in admin, and refreshes the cached home and search pages. |
| Business owner | `GET /api/vendors/:vendorId/marketing` returns the pass, days and allowance left, for the owner or an admin. Hidden until `MARKETING_WORKSPACE_ENABLED=true`; the Marketing page itself is Stage 3. |

## Acceptance criteria (delivery plan, Stage 1)

| Criterion | Result | Evidence |
| --- | --- | --- |
| An admin can activate a 30-day pass, and the vendor then appears in Sponsored results within one page load | Met | Test "the business is now in the Sponsored slot…"; the admin action refreshes cached pages |
| Setting the end date in the past removes the vendor from Sponsored results and the home-page featured row | Met | Tests "an end date in the past…" and "sponsored placement ends on its own when the date passes" |
| Pending, suspended, cancelled and expired passes cannot start paid actions, with a plain-language reason | Met | Tests for each state; expired allows only the free weekly email |
| A vendor cannot read or use another business's pass | Met | Access matrix: another vendor and a customer get 403 on `/vendors/:id/marketing` |
| `npm run db:reset` loads cleanly and `/api/health` reports the new tables | Met | The test database is built with `db:load` before every run; the tables are in `verifySchema.js` and `verify-baseline.sql`; `db:verify` passes on the development database after the migration |

## Automated tests

`npm test`: **254 tests, 254 passed**: 21 new in `backend/test/marketing.test.js`, plus 18 new rows in the access matrix (signed out, customer, another vendor, owner and admin against the three admin pass routes and the owner's pass route).

| Area | What is checked |
| --- | --- |
| Seed | The three passes and prices; every seeded featured business has a running pass ending with its placement; the home page still has featured businesses |
| Activation | Recorded against the signed-in admin; 30 days and full allowances; the business becomes Sponsored and is not repeated in the ordinary results; a second pass is refused while one runs; only approved businesses; two simultaneous activations give one pass |
| Changes | Extend moves the end date and the sponsored end date together; suspend removes placement and blocks paid actions and resume restores both; End now and a past end date end placement at once while keeping history; an expired pass cannot be extended, suspended or ended again; cancel ends placement for good and cannot be resumed; a new pass can follow an expired one |
| Entitlements | No pass, pending, suspended, cancelled and expired each refused with their reason; allowance counts down and stops at the limit; one free email a week after expiry |
| Validation | Bad ids, unknown actions, missing fields, out-of-range days and an end date before the start are refused |

### Do the tests catch regressions?

| Injected fault | Result |
| --- | --- |
| Sponsored placement not updated when a pass changes | 5 tests failed |
| Allowance never runs out | 2 failed |
| View ignores the end date (placement never expires) | 1 failed |
| Activation without locking the business | 0 failed: the test's two requests did not overlap in time. The database's one-running-pass index still prevents a second pass, and a clash now returns 409 instead of 500. |

Every file was restored and the suite passed again.

## Migration on the development database

`001_marketing_passes.sql` was applied twice to the development database: the second run changed nothing (3 passes, 7 running passes for the 7 featured businesses, no duplicates), and `npm run db:verify` passed.

## Static checks

- `npm run typecheck`: passed
- `npm run lint`: passed

## Browser test

To be run once the web development server is restarted (after a branch switch it was serving 404 for every page except the home page; not caused by this change).

## Known limitations

- **Cap on passes per category and area** (client decision 6, recommended two) is not enforced yet; it waits for the client's decision.
- **Payment** is recorded outside the site; SSLCommerz sandbox checkout is a later Should have.
- **Owner's Marketing page** comes in Stage 3 (KAN-285); Stage 1 provides the data and the access rules.
