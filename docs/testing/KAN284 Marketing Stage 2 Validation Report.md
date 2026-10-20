# KAN-284 Marketing Stage 2 Validation Report

## Jira task

KAN-284: [Sprint 2] Marketing Stage 2: Consent and unsubscribe (sub-task of KAN-243). The SMS module for login codes (KAN-278, D17) is a separate piece of work.

## What was built

| Area | Change |
| --- | --- |
| Database | `marketing_consents`: one row per customer, business and channel (email or SMS), with where consent was given (save prompt or account page) and, when withdrawn, when and how (account page, unsubscribe link, or removing the saved business). Withdrawn rows are kept as the record; giving consent again adds a new row. At most one active consent per customer, business and channel. Added to the baseline and as `database/migrations/002_marketing_consents.sql` (safe to run twice). |
| Consent service | `backend/services/marketing/consent.js` is the only place that gives or withdraws consent and builds a business's audience. `audienceFor(vendorId, channel)` returns only customers with active consent, an active account and an address for the channel. |
| Save prompt | After a customer saves a business (business page or any business card), an optional "Get offers from …?" panel offers SMS and email. Both start unticked, and "No thanks" or closing it gives no consent. Email is disabled when the account has no email address. English and Bangla. |
| Account | **My account → Saved businesses** shows SMS and email choices under each business, saved at once. The overview shows how many businesses send the customer offers. Removing a saved business stops its offers. |
| Email address | Builds on My details (KAN-294, merged separately). Removing the account's email stops email offers from every business; the same happens when a business owner removes their email in Settings. Where email offers are unavailable because there is no email address, the offers prompt ("Add one in My details"), the saved page and each saved business's greyed-out email box link to My details. |
| Unsubscribe link | `/unsubscribe/<token>`: a signed link per customer, business and channel. Opening it only shows what it would stop, because mail scanners open links; **Stop offers** stops it at once without signing in. The API also accepts one-click unsubscribe (`POST /api/unsubscribe/:token`, RFC 8058). Links don't expire, so old emails keep working. Tampered or made-up links are refused. English and Bangla. |
| Access | `GET /api/me/consents` and `PUT /api/me/consents/:vendorId` use the existing `account.use` feature (customers and vendors) and are in the access-matrix tests. |
| Seed | The demo customer (+8801722000001) has an email address and gets SMS offers from Shaheb Bazar Silk House; their other saved business, Green Life Pharmacy, has no consent. |

## Acceptance criteria (delivery plan, Stage 2)

| Criterion | Result | Evidence |
| --- | --- | --- |
| Saving a business never creates consent by itself | Met | Test "saving a business never gives consent by itself"; browser check "saving alone gave no consent" |
| An unsubscribe takes effect immediately and is honoured by the next send | Met | Test "confirming stops that channel at once…": the audience is empty straight after; browser check "confirming withdrew the consent" |
| A campaign audience contains only customers with active consent for that business and channel | Met | Tests under "the audience a business may send to": other channels, suspended accounts, email without an address and withdrawn consent are all left out |
| Draft privacy and terms wording sent to the client for approval by Tue 27 Oct | Drafted | `docs/legal/offers-privacy-terms-draft.md`, ready to send |

The SMS acceptance criteria in the delivery plan (login codes, quiet hours) belong to D17 (KAN-278) and Phase C.

## Automated tests

`npm test`: **447 tests, 447 passed**. That's 24 new in `backend/test/consent.test.js`, plus 2 new access-matrix rows (signed out gets 401 on both consent routes). The My details tests are in `customer.test.js` (KAN-294).

| Area | What is checked |
| --- | --- |
| Seed | The demo customer's one consent, and the offers count on the account page |
| Giving consent | Saving gives none; the prompt records channels and source; repeating changes nothing; email needs an address (nothing saved otherwise); bad channels, duplicates, sources and ids refused; only approved businesses; sign-in required |
| Audience | Only active consent for the channel; the address is the phone or email; suspended accounts and email consent without an address left out |
| Withdrawing | One channel from the account page, keeping the record; giving it again adds a new row; removing the saved business stops all its offers; one customer never affects another |
| Email address | A customer adds an email in My details and can then choose email offers; removing it stops email offers but keeps SMS; a business owner removing theirs in Settings does the same |
| Unsubscribe link | Opening shows the business and changes nothing; confirming stops that channel only, without signing in; repeat use is harmless; an old link still works after opting in again; tampered or made-up links refused and nothing changed |

## Browser test

Run against the development servers, signed in as the demo customer, on 20 October 2026: **17 of 17 checks passed**.

- The prompt appears after saving, names the business, starts unticked, and disables email when the account has none.
- Ticking SMS records consent from the save prompt; the saved page shows it ticked; the account overview counts it.
- Without an email, each saved business links to My details next to the greyed-out email box, and no business's offer choices are covered by another card.
- The unsubscribe page asks first and changes nothing on opening; **Stop offers** withdraws consent and confirms it; the Bangla page shows "already stopped"; a made-up link is refused politely.
- At phone width (390 px) the prompt fits the screen. No browser console errors.

With My details (KAN-294), same set-up: **14 of 14 checks passed**. After adding an email, the offers prompt lets you choose email; removing the email says email offers stopped, and stops them; without an email, the prompt links to My details.

## Static checks

- `npm run lint`: passed
- `npm run typecheck`: passed
- `next build`: runs in CI on the pull request

## Known limitations

- **Email addresses are not verified.** Before live email sending (Stage 4), the address should be confirmed by a link, so offers can't be sent to an address someone mistyped or doesn't own.
- **Privacy and terms wording** is drafted but not yet on the site; it goes live once the client approves it. Until then `MARKETING_EMAIL_ENABLED` stays off in production (delivery plan, section 8).
- **Sending** comes in Stage 4 (KAN-286), which must build its audience with `audienceFor` and put `unsubscribeUrl(...)` in every message.
