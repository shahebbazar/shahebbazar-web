# KAN-294 My Details Validation Report

## Jira task

KAN-294: [Sprint 2] Add Customer 'My Details' Page, containing account details (under KAN-241).

## Why

Customers had no way to see or change their details after registering. In particular, a customer who skipped the optional email at sign-up could never add one, which email offers (KAN-284) depend on.

## What was built

| Area | Change |
| --- | --- |
| My details page | New **My account → My details** (`/account/details`). A checklist shows what the account has and what is missing (full name, verified mobile number, optional email). The form changes the name and adds, changes or removes the email address. The mobile number is shown but not edited, because it is the sign-in. |
| API | `PUT /api/me/profile` with `{ name, email }`: name 2 to 120 characters, email optional and checked, stored in lower case; each invalid field is reported and nothing is saved; an email already used by another account gets 409. Only the signed-in customer's own details change. Uses the existing `account.use` feature. |
| Account overview | An **Edit my details** link, and an **Add an email address** card while the email is missing. |
| Account tabs on phones | The tab row used to scroll sideways, cutting off "My reviews". On phones the tabs now wrap as buttons so every tab is visible; from tablet width up they stay an underlined tab row. |

## Automated tests

`npm test` (customer and access suites): **193 passed**. New in `backend/test/customer.test.js`, "my details (KAN-294)":

- adding an email and tidying the name (spaces trimmed, email in lower case)
- each invalid field reported, nothing saved
- an email used by another account refused
- an empty email removes it; a phone number in the request is ignored
- only the signed-in customer's details change

`backend/test/access.test.js`: signed out gets 401 on `PUT /api/me/profile`.

## Browser test

Run against the development servers, signed in as the demo customer, on 20 October 2026: **12 of 12 checks passed**.

- The overview suggests adding an email address; the tabs include My details.
- My details lists the name, verified mobile and missing email; the form shows the current name and an empty email; the mobile number is shown as not editable.
- An invalid email is refused with a message; a valid one is saved and the checklist updates; emptying it removes it.
- At phone width (390 px) the page fits and every account tab is visible. No browser console errors.

## Static checks

- `npm run lint`: passed
- `npm run typecheck`: passed
- `next build`: runs in CI on the pull request

## Known limitations

- Email addresses are not verified by a link yet. That should be added before live email offers are sent (KAN-286).
- Changing the mobile number needs a new verification code, so it is not offered here.
