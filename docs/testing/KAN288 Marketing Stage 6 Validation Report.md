# KAN-288 Marketing Stage 6 Validation Report

## Jira task

KAN-288: [Sprint 2] Marketing Stage 6: Validation and MVP release (sub-task of KAN-243). Re-check the whole vendor marketing package against the acceptance criteria of Stages 1–5 on the final build, and release it to the test site for the client.

## Build checked

Branch `ari/fix-language-switch` at `94ebd79` (KAN-309, KAN-310 and KAN-311 on top of `main` at `2ff0d8c`), on 26 Oct 2026. This is the build that goes to the test site, including the KAN-310 changes to the campaign editor and email.

| Check | Result |
| --- | --- |
| API tests (`npm test`) | 630 passing, 0 failing (103 suites) |
| Browser tests (`npm run test:browser`) | 84 passing, 0 failing (desktop and phone) |
| Typecheck (`tsc --noEmit`) | Passed |
| Lint (`npm run lint`) | Passed |

Marketing tests in those runs:

- API: `marketing.test.js` (21), `consent.test.js` (24), `campaigns.test.js` (32), `sending.test.js` (18), `sendingFailure.test.js` (1), `posts.test.js` (18), `analytics.test.js` (10), and the marketing rows of `access.test.js`.
- Browser (`e2e/tests/marketing.spec.ts`):
  - the workspace shows the pass and its limits;
  - an owner writes and fixes an offer campaign, and parts still to fill in block sending;
  - one message makes all three channels, and one channel can be changed on its own and put back (desktop and phone);
  - a Bangla campaign is written in Bangla (desktop and phone);
  - deleting a campaign asks first, and a draft can be deleted from the list;
  - an admin can read a campaign but not change it;
  - a business without a pass sees the free plan and can still write a campaign;
  - an offer with a coupon shows the code and its last day;
  - each channel's photos can be switched off, which saves a new version;
  - a campaign is previewed and sent by email once, to customers who chose email offers;
  - the owner posts on Facebook and WhatsApp, marks it as posted, and it shows in the results (desktop and phone);
  - an event campaign can be about one of the business's events.

## Acceptance criteria re-checked on the final build

### Stage 1: Subscription foundation (KAN-283)

| Criterion | Result | Evidence |
| --- | --- | --- |
| An admin activates a 30-day pass and the business shows in Sponsored results within one page load | Met | `marketing.test.js`; the admin action refreshes cached pages |
| An end date in the past removes the business from Sponsored results and the home-page featured row | Met | `marketing.test.js`: "an end date in the past…", "sponsored placement ends on its own…" |
| Pending, suspended, cancelled and expired passes can't start paid actions, with a plain reason | Met | `marketing.test.js`, one test per state; an expired pass keeps only the free weekly email |
| A business can't read or use another business's pass | Met | `access.test.js`: another business and a customer get 403 |
| The database loads cleanly and the health check reports the tables | Met | The test database is rebuilt with `db:load` before every run; `setupDatabase.test.js` checks the migrations |

### Stage 2: Consent and unsubscribe (KAN-284)

| Criterion | Result | Evidence |
| --- | --- | --- |
| Saving a business never creates consent by itself | Met | `consent.test.js`: "saving a business never gives consent by itself" |
| An unsubscribe takes effect at once and the next send honours it | Met | `consent.test.js`: the audience is empty straight after confirming |
| A campaign's audience holds only customers with active consent for that business and channel | Met | `consent.test.js`, "the audience a business may send to" |
| Privacy and terms wording sent to the client for approval | Open | Draft in `docs/legal/offers-privacy-terms-draft.md`; client approval still to be recorded |

### Stage 3: Campaign workspace and templates (KAN-285)

| Criterion | Result | Evidence |
| --- | --- | --- |
| Only owned businesses and approved listings can be chosen | Met | `campaigns.test.js`: another business's, pending and unknown listings are refused |
| A business with a complete profile reaches a first draft in five screens or fewer, without retyping its details | Met | Three screens: Marketing, New campaign, the drafts. Since KAN-310 the owner edits one message rather than three |
| Drafts never invent prices, discounts, stock or contact details, and anything missing is flagged | Met | `campaigns.test.js`; browser test "parts still to fill in block sending" |
| Approved versions are locked, and editing creates a new version | Met | `campaigns.test.js`; browser test "each channel's photos can be switched off, which saves a new version" |

### Stage 4: Email sending (KAN-286)

| Criterion | Result | Evidence |
| --- | --- | --- |
| Only approved campaigns are sent, and a second send of the same campaign is blocked | Met | `sending.test.js`; browser test "…sent by email…, once" |
| A provider failure leaves the campaign unsent and doesn't use up the allowance | Met | `sendingFailure.test.js`: an SMTP server that refuses connections gives 502 with no send recorded |
| A test campaign is sent with a working one-click unsubscribe | Met (local SMTP test inbox) | `sending.test.js`. The KAN-310 email (dark header and footer, heading, share buttons, dark-mode styles) is checked in `sending.test.js` |

### Stage 5: Posting kit and results (KAN-287)

| Criterion | Result | Evidence |
| --- | --- | --- |
| Social posts work without connecting any social account | Met | The share row (KAN-310) uses only public share links (`wa.me`, Facebook's share box, X's post page) and the clipboard; browser test "the owner posts on Facebook and WhatsApp…" |
| Results stay visible after the pass ends; new paid actions are locked apart from the free allowance; a renew banner shows | Met | `posts.test.js`: "results still shown after a pass ends" |
| Captions per channel with hashtags, copy buttons, and the Open Graph share card | Met | One message makes the Facebook post with hashtags (KAN-310); Copy text; share cards from KAN-308 |
| "Mark as posted" with an optional post link, stored on the campaign | Met | `posts.test.js`; browser test (desktop and phone) |
| Results show sponsored views, search appearances, email sends and unsubscribes | Met | `posts.test.js` and `analytics.test.js` |

## Release

| Step | Status |
| --- | --- |
| All checks pass on the release build | Done (above) |
| PR for KAN-309, KAN-310 and KAN-311 merged to `main` | To do |
| Deployed to the AWS test site, with migrations 010 and 011 listed in `schema_migrations` | To do after the merge |
| Full flow clicked through on the test site, English and Bangla, phone and desktop | To do after the deploy |
| Demo to the client (Sadi) and feedback recorded | To do: before the feature freeze, Wed 28 Oct 6pm |

## Known limits (out of scope for the MVP, agreed in KAN-243)

- Shaheb Bazar doesn't post to Facebook, WhatsApp or X itself. The owner posts using the share row.
- Email opens and clicks aren't tracked. Visits from campaign links are tracked for email, Facebook and WhatsApp, but not X.
- Passes are activated by an admin. There is no online payment.
- Login codes aren't sent by SMS in production yet (KAN-278).
