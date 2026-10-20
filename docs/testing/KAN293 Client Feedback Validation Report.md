# KAN-293 Client Feedback (20 October 2026) Validation Report

## Jira task

KAN-293: [Sprint 2] Integrate 20/10/26 Sadi Meeting Feedback: remove NID, and approval on/off for new businesses and listings.

## Client decisions implemented

| Decision (meeting notes) | Implemented as |
| --- | --- |
| NID verification is not required at the moment; remove the placeholder | The NID field and "Identity verification" section are gone from business registration. The API no longer asks for or stores an NID; one sent by an old form is ignored. The `vendor_nid_*` columns stay in the schema in case verification returns. |
| Two modes in the admin portal: admin approval required, or not required | **Admin → Settings** has two switches: approve new businesses, and approve new products and services. Both start **on**, which is how the site has always worked. |

## What was built

| Area | Change |
| --- | --- |
| Database | `platform_settings` (key, JSON value, when and by whom it was last changed), seeded with both approval settings on. In the baseline and as `database/migrations/003_platform_settings.sql` (safe to run twice). |
| Settings module | `backend/lib/settings.js` declares each setting with its type, default, label and help text. A missing row means the default, so an older database behaves as before. |
| Admin | `/admin/settings`: on/off switches showing who changed each one last. Turning one off asks for confirmation. Every change is audited (`setting.update`, with before and after). The page notes anything still waiting. Approvals shows a notice while approval is off, and the page heading follows the setting. |
| With business approval off | A new business (registered by a new or existing account) is approved at once with `vendor_verified_at` set, and the automatic approval is audited (`vendor.auto_approve`). A draft or rejected business that is resubmitted is also approved at once. The message after registering says whether the business is public yet. |
| With listing approval off | A new product or service is approved at once and audited (`listing.auto_approve`). The dashboard message says it is public. |
| Not changed | Switching approval off does not approve anything already waiting. Admins can still reject or hide anything through Approvals, Reports and Reviews. |
| Wording | The registration page reads the public setting and says either "public as soon as you register" or "appears once our team approves it". About and FAQ no longer promise that every business is checked first. |
| Access | `admin.settings` (admins only) in `lib/access.js` and `docs/ACCESS-MATRIX.md`; both admin routes are in the access-matrix tests. |

## Automated tests

`npm test`: **470 tests, 470 passed**. The new `backend/test/settings.test.js` has 14:

- **Defaults:** both on, the admin page shows labels and what is waiting, and the public summary agrees.
- **Approval on:** a new business is pending and not public; a new listing is pending.
- **Changing a setting:** unknown keys and non-true/false values refused; only admins can read or change settings; the change is audited against the admin; waiting items are untouched.
- **Approval off:**
  - a new business is public at once, verified and audited
  - a resubmitted rejected business is approved
  - listing approval is separate, and once off, a new listing is approved and audited
  - editing keeps it approved
- **Back on:** new businesses and listings wait again.
- **NID:** registration works without one and stores none; an NID sent by an old form is ignored.

`registration.test.js` was updated: it no longer sends an NID or expects NID errors.

## Browser test

Run against the development servers on 20 October 2026: **12 of 12 checks passed**.

- **Settings page:**
  - Admin → Settings lists both switches, both starting on.
  - Turning business approval off saves it and records it in the audit log against the signed-in admin.
- **Approvals page:** it warns that new businesses go public without review; the warning disappears when approval is back on.
- **Registration form (signed out):** it has no NID field, and its wording follows the setting both ways.
- Settings fits a phone screen. No browser console errors.

## Confirmations

The browser's own confirm and prompt boxes were replaced in the admin area with an in-page dialog (`components/admin/ConfirmDialog.tsx`), styled like the rest of the site. It's used for turning approval off, the Marketing page's End now, Suspend and Cancel (which ask for an optional reason in the dialog), and report take-downs. Browser check: **14 of 14 passed**.

- Cancel, Escape or clicking outside changes nothing; confirming does.
- Turning approval back on and resuming a pass need no confirmation.
- A typed reason is saved with the suspension.
- The dialog fits a phone screen, and no browser box appeared anywhere.

## Static checks

- `npm run lint`: passed
- `npm run typecheck`: passed
- `next build`: runs in CI on the pull request

## Notes

- The client's notes say approval switching is "only required for later stages, not for initial". The switch is built now and **left on**, so behaviour is unchanged until an admin decides to turn it off.
- Existing databases need `database/migrations/003_platform_settings.sql` or `npm run db:reset`. Without it, the API's startup check reports the missing table.
