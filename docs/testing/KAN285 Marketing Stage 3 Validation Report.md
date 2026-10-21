# KAN-285 Marketing Stage 3 Validation Report

## Jira task

KAN-285: [Sprint 2] Marketing Stage 3: Campaign workspace and templates (sub-task of KAN-243).

## What was built

| Area | Change |
| --- | --- |
| Database | `marketing_campaigns` (the brief, the frozen snapshot it was written from, status, approved version) and `marketing_campaign_versions` (every saved wording of email, Facebook and WhatsApp together; never changed). In the baseline and as `database/migrations/004_marketing_campaigns.sql` (safe to run twice). |
| Templates | `backend/services/marketing/templates.js` writes the drafts in English or Bangla from the snapshot and brief only, shaped by the goal (new stock: what has arrived; offer: the deal and how long it runs; event: an invitation with when and where; reminder: customer favourites): the business's name, address, phone and page, the chosen products with their real prices, and the owner's own offer text. A product without a price shows none. Anything a goal needs but is missing (an offer for an "Offer" campaign, an address for "Visit", a phone for "Call") becomes a `[[placeholder]]`, which blocks approval. |
| Coupons | An offer can carry a coupon code (3 to 20 letters, numbers or dashes; **Make one for me** suggests one from the first product, for example KHIRSAPAT25). The coupon is valid for the offer's dates and stops working after the last day, so a coupon needs a last day that hasn't passed. The drafts add "Use code X when you visit or order, until <last day>." The editor and the campaign list show it as **Starts …**, **Valid until …** or **Expired …**, worked out from today in Bangladesh. The same code can be used again on a later offer. Nothing has to be counted by hand. |
| Snapshot | Business and product details are copied in when the campaign is created, so later edits to a product never change a campaign silently. |
| Marketing page | **Marketing** in the owner's dashboard (replacing the greyed-out "Promotions"): pass and allowance left, a readiness checklist with a link to fix each item, the campaign list (with a delete button on each draft or approved campaign, which asks first), and **New campaign**. |
| New campaign | One page: what it's for, 1 to 3 approved products (with photo and price), optional offer and dates, call to action, English or Bangla, optional name. |
| Editor | Each channel's text beside its preview (email with product photos, Facebook with the business photo, WhatsApp bubble), placeholders highlighted yellow, and parts taken from the saved business and product details (names, prices, address, phone, page, coupon) highlighted blue, an **Include photos** switch for each channel (on by default; email shows the product photos, Facebook and WhatsApp the first product photo or else the business cover; saved with the wording, so switching makes a new version), with a note: if one is wrong, update it in Products & Services or My Business and start a new campaign, because this one keeps the details it was made with. **Before approving** (what blocks approval) apart from **Good to know** (for example a product with no photo). Save makes a new version; **Approve** asks first and locks the latest version (audited as `campaign.approve`); editing an approved campaign makes a new version that needs approving again. Delete asks first. Version history. Admins see it read-only. |
| Free plan | Decided 21 October 2026 (to confirm with the client): every approved business can write campaigns, with or without a pass. The Marketing page explains the plan: **Free plan** (1 email campaign a month), **pass ended** (1 a week, as before), or the running pass with its allowances, and for free and ended plans what a pass adds (Sponsored placement, more emails, AI help) with a contact link. Only a pass an admin suspended blocks drafting. Counting the free email and an admin setting for it come with sending in Stage 4; a Marketing analytics page, open to free businesses too, comes with Stage 5. |
| Access | `business.marketing` (owners, managers, admins) to read; new `business.marketing.manage` (owners and managers) to change. On by default; `MARKETING_WORKSPACE_ENABLED=false` hides everything. Starting a campaign needs an approved business with an approved product; drafting spends no allowance (sending, Stage 4, will). |

## Acceptance criteria (delivery plan, Stage 3)

| Criterion | Result | Evidence |
| --- | --- | --- |
| Only owned businesses and approved listings can be selected | Met | API tests: another business's, pending and unknown listings refused; the form lists only approved products |
| A vendor with a complete profile reaches a first draft in five screens or fewer without retyping business details | Met | Three screens: Marketing → New campaign → the drafts. Business details come from the profile |
| Drafts never invent prices, discounts, stock or contact details; anything missing is flagged | Met | Tests: no price shown for a product without one, with a note; a missing offer is a placeholder that blocks approval; the snapshot is used unchanged |
| Approved versions are locked; editing creates a new version | Met | Tests: version 2 approved stays unchanged after editing makes version 3; only the latest version can be approved |

## Automated tests

- **API** (`npm test`): 504 passing, with 28 new in `backend/test/campaigns.test.js`:
  - the workspace, and a business with no usable pass told why
  - drafts naming the business and products with real prices
  - no invented price
  - Bangla drafts with Bangla digits, and the area not repeated
  - the frozen snapshot
  - every brief check
  - placeholders blocking approval
  - new versions on save
  - only the latest version approvable
  - approval audited
  - editing after approval
  - wording limits
  - deleting, sent campaigns kept
  - access for admins, other vendors, customers and signed-out visitors
  - free, ended and suspended plans
  - each goal writing a differently shaped draft, and event placeholders
  - coupon codes: offers only, format, a last day needed and not already passed, in the drafts with the last day, reusable later
  - photos on in every channel by default, switched off for one channel and saved as a new version
  - coupon status: upcoming before the start day, valid through the last day, expired after

  The workspace is also in the access matrix.
- **Browser** (`npm run test:browser`): 48 passing, with 13 new in `e2e/tests/marketing.spec.ts` (desktop and phone):
  - the workspace
  - writing an offer campaign, seeing the highlighted placeholder and disabled Approve, filling it in, saving as version 2, approving through the confirmation and seeing it locked
  - a Bangla campaign
  - deleting through the confirmation, from the editor and from the campaign list (cancel keeps it)
  - an admin seeing it read-only
  - a business without a pass on the free plan
  - switching off the WhatsApp photo: the preview drops it, Save makes version 2, and it stays off after reloading
  - an offer with a coupon: the code in the drafts, saved details marked blue with the note, and the coupon shown as valid until its last day in the editor and the campaign list

## Found and fixed while testing

- Campaign dates came back one day early on a server ahead of UTC (for example a laptop in Australia): the date was turned into UTC before being read. It is now read as the local date.
- In Bangla drafts the area was added twice ("…Road, Rajshahi, সাহেব বাজার"); it is now added only when the address doesn't name it.
- The "Before approving" box stayed after the offer was filled in, because informational notes were mixed with blocking ones. They are now separate.
- The "Saved as version 2" message disappeared straight away, because the editor restarted when the page refreshed its data. It now keeps its state.
- The Taka sign looked wrong in the fixed-width editing font, so the editor uses the normal font.

## Static checks

- `npm run lint`: passed
- `npm run typecheck`: passed
- `next build`: passed (the browser tests build the site)

## Known limitations

- How many customers used a coupon isn't recorded: customers pay the business directly, and counting at the till was dropped as too much work for owners.
- A campaign uses each product's main photo only (or its first photo). Future revision: copy all of a product's photos into the campaign and let the owner pick which ones each channel uses, saved with the version.
- Sending comes in Stage 4 (KAN-286), and the share kit and results in Stage 5 (KAN-287).
- AI drafting is a Should have (D14); versions already record `template`, `manual` or `ai`.
- The workspace is on by default. A `backend/.env` copied from the old example still has `MARKETING_WORKSPACE_ENABLED=false`; delete that line or set it to `true`.
