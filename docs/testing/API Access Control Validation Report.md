# API Access Control Validation Report

## Scope

Server-side login, role and ownership checks on every signed-in API route not covered by KAN-260, plus a tidy-up tool for stored image paths. Feeds the KAN-253 role and feature matrix.

## Problems found

| Area | Before |
| --- | --- |
| Admin (`/api/admin/...`: approvals, categories, reports, review moderation, search trends) | Open to anyone. Every action was recorded in the audit log against "the first admin account", whoever made it. |
| Payment methods (`/api/vendors/:id/payment-methods`) | Anyone could read or replace any business's payment methods. |
| Owner details (`/api/vendors/:id/owner`) | Anyone could read the owner's phone and email, or change their name and email. |
| Reviews (`/api/vendors/:id/reviews`, `.../reply`) | Anyone could read a business's review list or post a reply as the business. |
| Messages and alerts (`/api/vendors/:id/conversations`, `.../alerts`) | Anyone could read a business's private conversations, reply as the business, or clear its alerts. |
| Frontend | Admin pages and the payment methods page called the API without the session cookie, so they would stop working as soon as the API checked it. |
| Stored images | The development database pointed at 19 image files that no longer exist (broken images on public pages), and the upload folder held 7 files nothing used. |

## Changes

- **One admin gate** in `backend/index.js`: every `/api/admin` route, in any router, needs a signed-in admin. New admin routes are covered without extra code.
- **Guard sets** in `backend/lib/middleware/auth.js`, used by the routes:
  - owner or admin: managing a business (payment methods, owner details, reading reviews; listings and images already used this)
  - owner only: acting as the business (messages, inquiries, alerts, review replies), so an admin can never speak for a business
- **Audit trail**: approvals, category changes, report resolutions and review moderation record the signed-in admin. The "first admin" and "first customer" stand-ins were removed.
- **Messages**: a conversation is checked to belong to the business before it is opened, so opening another business's conversation no longer marks its messages read.
- **Frontend**: admin pages and actions, and the payment methods page and save, now use `authenticatedApiGet` / `authenticatedApiSend`, which forward the session. The unused helpers that called these routes without it were removed from `lib/api.ts`.
- **`npm run uploads:check`** (`backend/scripts/check-uploads.js`): reports stored image paths whose file is missing and files nothing uses. With `-- --fix` it removes those references in one transaction (a listing that loses its main photo gets the next one) and moves unused files to `uploads/.unreferenced/<date-time>/` instead of deleting them. Run on the development database: 19 references removed, 7 files moved, then a clean report.

## Access rules

| Routes | Signed out | Customer | Another vendor | Owner | Admin |
| --- | --- | --- | --- | --- | --- |
| Public browsing | yes | yes | yes | yes | yes |
| Customer area | 401 | yes | 403 | 403 | 403 |
| Managing a business | 401 | 403 | 403 | yes | yes |
| Acting as the business | 401 | 403 | 403 | yes | 403 |
| Administration | 401 | 403 | 403 | 403 | yes |

## Automated API tests

`npm test` loads a throwaway `<PGDATABASE>_test` database, starts the real API and signs in through the normal OTP flow as each role. The set-up is shared by all test files (`backend/test/support/harness.js`).

Result: **202 tests, 202 passed** (149 in the new `access.test.js`, 49 listing tests from KAN-260, 4 for `uploads:check`).

| Area | What is checked |
| --- | --- |
| Role matrix | 30 routes: every one gives 401 signed out; customers, other vendors, owners and admins get 403 wherever the table says so; an unknown `/api/admin/...` path is also refused. |
| Allowed access | Owner and admin can open every business page they should; admin can open every admin page. |
| Refused requests change nothing | Payment methods, owner name, messages, categories and review status are checked in the database after refused attempts. |
| Correct actor | A second admin account approves a listing, adds a category, hides a review and resolves a report; each is recorded against that admin, not the first one. The owner's message is stored as sent by the owner. |
| Messages | The owner cannot open another business's conversation through their own business, and its messages stay unread. |
| Public routes | Home, categories, search, a business page, its payment methods, the vendor list and events still work signed out. |
| `uploads:check` | Reports without changing anything; `--fix` removes missing references, promotes the next listing photo, clears a missing cover, moves an unused file aside where it is not served, and the next run is clean. |

### Do the tests catch regressions?

Each fault was injected, the suite run, and the file restored:

| Injected fault | Result |
| --- | --- |
| Admin gate removed from `index.js` | 52 tests failed |
| Admins allowed to reply as a business | 1 failed |
| Payment methods save left unguarded | 4 failed |
| Category changes recorded against the first admin instead of the signed-in one | 1 failed |

## Browser test

A scripted Chrome session ran against the development stack with real sessions for an admin, the owner of Rajshahi Mango Traders, another vendor and a customer. Result: **21 checks, 21 passed.**

1. As admin, Approvals, Categories, Reports, Reviews and Search trends all load with their data.
2. As admin, clicking **Approve** on a new listing approves it, and the audit log records that admin.
3. As owner, the Payment Methods page loads and **Save payment methods** succeeds with the same methods.
4. As owner, Dashboard, Messages, Inquiries, Reviews, Settings and My Business all load.
5. Another vendor opening this business's payment methods page gets "not found".
6. A vendor opening `/admin` is sent to their dashboard; a customer is sent to their account.
7. 13 public business pages show no broken images after the uploads tidy-up.
8. No browser console errors on the admin and owner pages.

The test listing, its audit entry and the test sessions were removed afterwards.

## Static checks

- `npm run typecheck`: passed
- `npm run lint`: passed

## Follow-ups fixed in the same branch

Three gaps found during this work were fixed before merging.

| Gap | Fix |
| --- | --- |
| `POST /api/vendors` created a business owner account for any phone number without verifying it. | Removed. Businesses register through `POST /api/auth/register/vendor`, which needs a `register` code sent to that phone, like customer sign-up. The account is marked verified, the business starts pending, and the owner is signed in. The registration form now has a code step. Code checking and session creation moved to `backend/lib/verification.js`, shared with customer sign-up. |
| The payment methods form saved methods in its own fixed order, so saving reordered the public profile. | The form keeps the saved order and adds newly ticked methods at the end. |
| Admins were redirected away from the provider pages, so they could not see a business's dashboard although the API allows it. | Admins can open any business's pages from "Open the business's pages" on the Approvals cards. An admin banner shows on every page; Messages is hidden from the navigation and the messages and inquiries pages show a privacy notice; reviews are shown without the reply box. `/vendors/dashboard` without a business sends an admin back to `/admin`. |

### Tests

- `npm test`: **215 tests, 215 passed**, including 13 new registration tests (`backend/test/registration.test.js`): no code, wrong code (counted towards the limit), another phone's code and another purpose's code are refused and create nothing; the right code creates a verified vendor, a pending business and a working session limited to that business; the code is marked used; a duplicate phone is refused; a duplicate name gets its own address; bad fields are rejected; customer sign-up still works.
- Injected fault: registration with the code check skipped. 6 registration tests failed; the file was restored.
- Browser, against the development stack: **18 checks, 18 passed**. Registering through the form asks for the code first, refuses a wrong one, and with the right one lands on the new business's dashboard as "Awaiting approval". Ticking and saving a payment method adds it last and keeps the rest in order; unticking restores the original order. As admin: dashboard, My Business, listings (with data), payment methods and settings open with the banner; Messages is not in the navigation; messages show the privacy notice; reviews have no reply box while the owner still has one; `/vendors/dashboard` returns the admin to `/admin`; Approvals cards link to the business's pages. The test account and business were removed afterwards.

## Known limitations

- **Admin access to approved businesses**: the admin link is on the Approvals cards, so an approved business is reached by opening `/vendors/dashboard?vendor=<id>`. A business search for admins would make this easier.
- **Changes made by admins in the provider pages** (profile, listings, payment methods, owner details) are not yet written to the audit log.
