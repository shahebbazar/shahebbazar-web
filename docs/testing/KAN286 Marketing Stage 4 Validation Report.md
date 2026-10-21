# KAN-286 Marketing Stage 4 Validation Report

## Jira task

KAN-286, Stage 4 of the vendor marketing package (D8): email sending. A business owner previews a campaign and sends it by email to the customers who chose to get its offers.

## What was built

| Area | Change |
| --- | --- |
| Email adapters | `backend/integrations/email/`: one interface, two adapters. **Console** (the default) prints each email to the API console, like the sign-in code mock. **SMTP** is used when `MARKETING_EMAIL_ENABLED=true` and `SMTP_HOST` is set, so it works with any provider: Mailpit locally, or the client's provider once its details arrive. Keys live only in `backend/.env`; `.env.example` has placeholders. |
| Test inbox | `docker compose up -d` also starts Mailpit, which catches every email at http://localhost:8025 and sends nothing on. |
| Send flow | `services/marketing/sending.js`: lock the campaign, check it hasn't been sent and its latest version has no `[[placeholders]]` left, build the audience from consents only (`audienceFor`), use the allowance, record that version as approved (by the owner, now) and mark it "sending"; then send one email per customer; then record every email in `marketing_sends` and mark the campaign sent, audited as `campaign.send` with the version number. If the email service accepts none of the emails, the allowance is given back and the campaign is put back as it was. |
| The email | `services/marketing/emailMessage.js`: the wording that was sent, product photos if the owner kept them, sender "<Business> via Shaheb Bazar" (confirmed by the client), replies to the business's own email if it has one, the customer's unsubscribe link in the footer (English or Bangla) and the one-click `List-Unsubscribe` / `List-Unsubscribe-Post` headers (RFC 8058), which mail apps show as an Unsubscribe button. |
| Allowance | One email campaign per send, whatever the number of customers: from the pass, or free. The free plan (no pass, a waiting pass or a cancelled one) gets the admin setting's emails per calendar month in Bangladesh time; a business whose pass ended gets 1 a week, as before. Free sends are counted together, so a business can't get both. Usage is now recorded per business (`marketing_usage_events.vendor_id`), so free-plan sends without a pass are counted. |
| Admin setting | **Settings → Marketing → Free email campaigns a month** (default 1, 0 to 20; 0 switches the free email off). Saved with a button and audited as `setting.update`. |
| Editor | No separate approval step (changed after testing on 21 October 2026: switching a photo off made a new version that needed approving again, which blocked sending). The owner previews the email, Facebook and WhatsApp text, then presses **Send to N customers** in the bar at the bottom; its confirmation ("It goes out now, exactly as in the email preview") approves the wording. Unsaved changes, such as a photo switched off, are saved first ("Save and send"). Parts still marked `[[like this]]` block sending (**Before sending**). The **Send by email** panel says how many customers it goes to, which allowance it uses ("Uses 1 of your pass's email campaigns (3 left after this)", "Uses your free email campaign for this month") and why it can't be sent if so. A sent campaign shows when it went and how many emails were accepted, can't be edited, deleted or sent again, and its version is marked **Sent**. Admins see it read-only. The approve API from Stage 3 still works but the editor no longer uses it. |
| Account switcher | One switcher for the whole site (`components/shared/AccountSwitcher.tsx`), used by the public header and the business dashboard. Its button shows where you are: your name and **Customer** on the public site, or the business and **Business owner** / **Manager** in the business dashboard. Its list has **Customer account** and each business you run (the current one highlighted), plus registering a business, so you can switch either way from anywhere. On phones the list is in the menu drawer. Customers see the same switcher with just their account; admins keep an Admin dashboard link. The old header buttons used `btn` classes that don't exist; Log in and Register are now proper buttons. |
| Facebook and WhatsApp | Marked **Preview only**, with a note that posting them from Shaheb Bazar comes in a later release; only the email is sent. A posting kit (copy text, open WhatsApp with the message, Facebook share box) was built and set aside for KAN-287. |
| Marketing page | The plan card shows how many customers get the business's offers by email, and on the free plan how many free email campaigns are left this month. |
| Database | `database/migrations/005_marketing_sends.sql` (safe to run twice; also in the baseline): `marketing_sends`, `campaign_sent_at` / `campaign_sent_by`, and `vendor_id` on `marketing_usage_events` (filled in from the pass for existing rows; the pass is now optional). |
| Demo data | Rajshahi Mango Traders has three email subscribers and one customer who unsubscribed, so a campaign can be sent in development and the demo shows unsubscribed customers being left out. Their addresses are `@example.com`, which can never receive mail. |

## Acceptance criteria (delivery plan, Stage 4)

| Criterion | Result | Evidence |
| --- | --- | --- |
| Only approved campaigns can be sent; a second send of the same campaign is blocked | Met, with approval at the moment of sending | The owner's confirmation approves the version sent, recorded with who and when (decision 4: the vendor approves). API tests: a campaign with `[[placeholders]]` is refused; a draft is sent and its version recorded as approved by the owner; a sent campaign can't be sent again, edited or deleted. Browser test: after sending, the editor is locked |
| A provider failure leaves the campaign unsent and does not use up allowance | Met | `sendingFailure.test.js` starts the API with an SMTP server that refuses connections: 502, no `marketing_sends` rows, usage unchanged, campaign still approved and sendable |
| One test campaign is sent (to test inboxes through the client's provider, or recorded by the console adapter) with a working one-click unsubscribe | Met (console adapter and a local SMTP server) | API test: three emails recorded by the console adapter, the customer who unsubscribed left out; the link from an email unsubscribes that customer (audience 3 → 2). A campaign email sent through the SMTP adapter to a local SMTP server arrived with the sender name, reply-to, text and HTML parts and the `List-Unsubscribe` headers. The client's provider is not connected yet |

## Automated tests

- **API** (`npm test`): 519 passing, with 12 new in `backend/test/sending.test.js` and `backend/test/sendingFailure.test.js`:
  - a draft can't be sent
  - the editor is told the audience and allowance before sending
  - one email per subscribed customer, the unsubscribed one left out, one allowance used, recorded and audited
  - no second send, edit or delete after sending
  - the unsubscribe link in an email works
  - only owners and managers can send (admins, customers, other businesses and signed-out visitors refused)
  - no one to send to: refused, nothing used
  - the free plan: one email a month, refused after that, allowed again when the admin raises the setting; bad setting values refused
  - the email: sender, reply-to, one-click headers, escaping, links, photos only when kept, Bangla footer
  - provider down: nothing sent, no allowance used, can be sent again

  Updated: entitlement tests (a business without a running pass now gets the free email; paid AI and SMS stay locked), the settings defaults, and the consent tests (they now pick a business with no subscribers).
- **Browser** (`npm run test:browser`): 52 passing, with 3 new:
  - previewing and sending a campaign without an approval step: the panel's audience and allowance, switching a photo off turns the button into Save and send, Cancel sends nothing, Send now saves version 2 and emails the three subscribers, version 2 is recorded as approved, the editor locks and the list shows Sent
  - placeholders block sending until they are filled in
  - the admin sets the free plan's monthly emails; out-of-range values can't be saved
  - the account switcher shows the customer account on the public site and the business in the dashboard, and switches between them both ways (desktop and phone)

  The sending test also checks Facebook and WhatsApp are marked Preview only.

  The free plan test also checks the free emails left and the subscriber count.
- Tests always use the console adapter (`MARKETING_EMAIL_ENABLED=false` in the test harness and browser test set-up), so a developer's real email settings are never used by a test run.

## Static checks

- `npm run lint`: passed
- `npm run typecheck`: passed
- `next build`: passed (the browser tests build the site)
- `npm audit`: no advisories for `nodemailer` (10.0.16)
- Mailpit HTML Check (email app compatibility, from caniemail.com): 97% supported, up from 86% in the first version. The email uses tables and colour attributes instead of `<body>` styles, rounded corners and margins. A first fixed-width (600px) version broke on phones, so the card is fluid: full width on a phone, at most 600px elsewhere, held at 600px in Outlook on Windows by a table only Outlook reads. Rendered at 320px, 375px and 1024px with one and two photos: nothing overflows sideways, and long links wrap.

## Known limitations

- The client's email provider isn't connected yet; its SMTP details go in `backend/.env` when they arrive. Until then sends go to the console adapter, or to Mailpit locally.
- Delivery, bounce and open tracking need the provider's webhooks and are not built; `marketing_sends` records whether the provider accepted each email. Open tracking was cut from the MVP.
- Links and images in emails point at `PUBLIC_SITE_URL` and `PUBLIC_API_URL`; on a developer's computer that is localhost, so they only work there.
- Emails are sent one after another during the request, which suits the current audience sizes. Large lists would need a background queue.
- If the API stops in the middle of a send, the campaign stays "sending" and needs checking by hand.
- Customer email addresses are not verified yet (noted in Stage 2): a mistyped address gets offers it didn't ask for until the owner of that inbox unsubscribes.
