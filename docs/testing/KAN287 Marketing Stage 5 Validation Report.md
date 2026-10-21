# KAN-287 Marketing Stage 5 Validation Report

## Jira task

KAN-287, Stage 5 of the vendor marketing package (D9, reduced): Facebook and WhatsApp posting kit and marketing results. The owner posts a campaign on Facebook and WhatsApp themselves, marks it as posted, and sees what their marketing did.

## What was built

| Area | Change |
| --- | --- |
| Posting kit | Shaheb Bazar isn't connected to Facebook or WhatsApp, so each is labelled **You post this** (replacing Stage 4's "Preview only"). Under each one (`ShareKit.tsx`): **Copy text**; **Open in WhatsApp**, WhatsApp's own `wa.me` link with the message filled in, to send to customers or post to Status; **Open Facebook**, Facebook's share box with the business page, which shows the page's existing preview card (Open Graph), and the owner pastes the text; **Open the photo** if the photo is kept. No social account or connection is needed. The tools appear once the wording is saved with nothing left to fill in ("Save your changes first, so what you post is the saved version"); the drafts already end with hashtags (the business, #Rajshahi, #ShahebBazar). |
| Mark as posted | After posting, the owner presses **Mark as posted**, with an optional link to the post. Links must be Facebook (`facebook.com`, `fb.com`, `fb.watch`) or WhatsApp (`whatsapp.com`, `wa.me`) addresses; `https://` is added if left off. It records the channel, the link and the version posted, who marked it and when, audited as `campaign.post`. The link can be changed, and a mistaken mark undone (`campaign.unpost`). A campaign can be marked before or after it is emailed; marking doesn't send or lock anything. A posted campaign, like a sent one, is kept as a record and can't be deleted. Admins see what was posted. |
| Results | **Results** on the Marketing page (`MarketingResultsPanel.tsx`), for 7, 30 or 90 days against the period before: sponsored views, search appearances, visits from shared links (Facebook, WhatsApp and other sites), emails sent and failed, new email subscribers and unsubscribes, Facebook and WhatsApp posts, and the latest campaigns sent or posted. Open to every plan, so results stay after a pass ends. Email opens and clicks aren't tracked (cut from the MVP). |
| Campaign visits | Links to the business page in campaign emails (the View our page button, product cards and the address in the message) and in the Facebook and WhatsApp posting tools (copied text, the WhatsApp message, Facebook's share box) carry the channel and campaign: `?from=email&c=12`. The saved wording is unchanged; the marks are added when a link is sent, copied or opened. The profile beacon reports the visit with them and removes them from the address. The API keeps the campaign only if it belongs to the business visited. `vendor_profile_views` gains `view_campaign_id` and the `email`, `facebook` and `whatsapp` sources (`database/migrations/007_campaign_visits.sql`). The editor shows visits from the email in the Sent box and from each channel under its posting tools. |
| Results layout | **Visits from your marketing** (every visit from the sources below, against the period before) beside **Seen in search**; **Where visits came from** with a bar for each source (Sponsored results, Email, Facebook, WhatsApp, Other sites) and what each means; Email (sent, new subscribers, unsubscribes, customers who get emails now) and posts; the latest campaigns with their visits. A business without a pass sees that Sponsored needs one rather than a 0. A tip shows when there's nothing yet. |
| Sponsored views | Sponsored views were never recorded: the API accepted `view_source = 'sponsored'` but the site didn't send it. Sponsored cards (home page) and rows (search and category pages) now link with `?from=sponsored`; the profile beacon reports a sponsored view and removes the mark from the address, so a reload or a copied link isn't counted as sponsored again. The API counts a view as sponsored only while the business is featured; otherwise it is recorded as direct. |
| Renew banner | When the pass has ended: "Your Marketing pass ended …", out of Sponsored results, 1 email campaign a week, campaigns and results kept, with a link to contact Shahebbazar to renew. The same banner shows when a pass ends within 7 days. New paid actions were already locked apart from the free allowance (Stage 4). |
| Replies | Campaign emails have a **Reply on Shaheb Bazar** button (Bangla: সাহেব বাজারে উত্তর দিন), also in the editor's preview, so replies land in the business's Messages rather than an email inbox. It opens `/message/<business>`: a signed-in customer goes straight to a new message to the business; a signed-out one logs in first and is brought back (`/login?next=`, paths on this site only). The business page's Message buttons use the same route, so they no longer lose where the visitor was going. The email header shows the business's logo again (or its first letter), as in the preview. |
| Email design | Redesigned to look like a modern marketing email, still email-safe and phone-first: a brand stripe, the logo header, a hidden preview line (what inboxes show after the subject), product cards with photo, name, price and **View** (shown when the email's photos are on), the offer's coupon in a dashed box while it works, the **Reply** button, then **View our page**, **Call 01711-000005** and **Get directions** (Google Maps) when the business has a phone and address, and a footer with the business's address. English and Bangla. The editor's preview shows the same parts. Checked at 375px and 1024px. |
| Campaign list | Shows "posted on Facebook and WhatsApp"; a posted campaign has no delete button. |
| Database | `database/migrations/006_marketing_posts.sql` (safe to run twice; also in the baseline): `marketing_campaign_posts`, one row per campaign and channel. Drops `marketing_campaigns.campaign_posted_url`, which was never used. |
| Demo data | Featured businesses get about one in five of their seeded views as sponsored views, so the results have figures to show. |

## Acceptance criteria (delivery plan, Stage 5)

| Criterion | Result | Evidence |
| --- | --- | --- |
| Social content works without any social account connection | Met | The kit uses only public links (`wa.me`, Facebook's share box) and the clipboard. Browser test: the WhatsApp link carries the message, the Facebook link carries the business page, marking works with and without a link |
| Results remain visible after the pass expires; new paid actions are locked apart from the small free allowance, and a renew banner shows | Met | API test: after an admin ends the pass, the results still load with the emails sent and the plan is "ended". The allowance rules are Stage 4's (1 email a week after a pass ends). The banner shows for an ended pass or one ending within 7 days |
| Per-channel captions with hashtags, copy buttons, the existing Open Graph share card | Met | Captions and hashtags come from the Stage 3 templates; Copy text per channel; Facebook's share box uses the business page's Open Graph card |
| "Mark as posted" with an optional post link, stored on the campaign | Met | API tests: placeholders block it, link checked per channel, version recorded, audited, changed, undone, shown in the list |
| Marketing results: sponsored views, search appearances, email sends and unsubscribes | Met | API tests compare each figure with the period before; sponsored views are now recorded (API and browser tests) |

## Automated tests

- **API** (`npm test`): 535 passing, with 15 new:
  - `backend/test/posts.test.js` (14):
    - post links: accepted forms and refused ones (other sites, the wrong channel, `javascript:`, too long)
    - placeholders block marking
    - marking records the link and version and is audited, without sending
    - marking without a link, and changing the link
    - a bad link and an unknown channel are refused
    - shown in the list; a posted campaign can't be deleted
    - undo
    - marking after the email went
    - access: only owners and managers mark; admins, customers, other businesses and signed-out visitors are refused
    - results against the period before, for 7 and 30 days
    - emails, unsubscribes, posts and the latest campaigns
    - results still shown after a pass ends
    - who can see the results
  - `backend/test/analytics.test.js` (1): a sponsored view of a business that isn't featured is recorded as direct. The existing sponsored test now uses a featured business.
- **Browser** (`npm run test:browser`): 55 passing, with 2 new:
  - posting on Facebook and WhatsApp (desktop and phone): the WhatsApp and Facebook links, the photo, marking WhatsApp without a link, a non-Facebook link refused, the Facebook link kept and shown, no delete once posted, undo, then the campaign list and Results show the post and the period links work. No sideways scrolling.
  - a visit from the Sponsored results: the link carries `?from=sponsored`, and the business page's address no longer does.

  The sending test now checks Facebook and WhatsApp are labelled "You post this", that the posting tools wait while there are unsaved changes, and that the Results count the emails.

## Static checks

- `npm run lint`: passed
- Typecheck (`tsc --noEmit`): passed
- `next build`: passed (the browser tests build the site)
- Screens checked at 375px and 1280px: the posting kit and Results fit without sideways scrolling; on a phone the latest campaigns show the title above the details.

## Known limitations

- Posting is by hand: Shaheb Bazar doesn't post to Facebook or WhatsApp, and "posted" counts are what the owner marked. Connecting the Facebook Page and WhatsApp Business APIs was out of scope for the MVP.
- Facebook's share box takes the page link only; the owner pastes the text (Facebook doesn't allow pre-filled text). WhatsApp can't attach the photo through a link, so the owner adds it.
- Campaign visits are counted when the link carries its marks. A post written by hand, or a link someone copies from the address bar after the marks are removed, counts under Other sites or as a direct visit. Forwarded WhatsApp messages keep the marks, so their visits still count for the campaign.
- Visits are counted by the page's beacon, which needs JavaScript; visitors who block it, and the browser tests' headless browser (filtered as a bot), aren't counted.
- Sponsored views count visits from a Sponsored card or row; someone who sees the card and visits later by search is counted as search.
- Email opens and clicks aren't tracked (cut from the MVP).
- A customer who presses Reply in their mail app instead of the button still emails the business's own address, or `offers@shahebbazar.com` (unread) if the business has none. Turning email replies into messages needs the email provider's inbound email, planned once the provider is chosen.
- The results compare whole days in the database's time zone, the same as the dashboard.
