# End-to-end testing: reporting and fixing issues

For the testing push before the demo. Feature freeze: Wed 28 Oct, 6pm. Fixes due: Thu 30 Oct. Demo: Mon 2 Nov.

## 1. Where to test

- **Site:** the AWS test site (the link is pinned in the group chat). Everyone tests the same version.
- **Sign in:** use the demo accounts. The demo sign-in code is sent privately; don't post it in the group chat or in Jira.
- **Test emails:** campaign emails go to the test inbox at `<test site>/mail`, not to real inboxes.
- **Check each screen in:** desktop and phone, English and Bangla, light and dark mode.

| Account | Mobile | Use it for |
| --- | --- | --- |
| Customer | +8801722000001 | Customer journey |
| Customer (no email) | +8801722000002 | Customer journey, My details |
| Business owner (Rajshahi Mango Traders) | +8801711000005 | Business owner, Marketing, Events |
| Another business owner | +8801711000006 | Checking businesses can't see each other's data |
| Admin | +8801711000001 | Admin |

## 2. Test areas

Claim one in the group chat, test it in depth, then spend some time on the others.

1. **Customer journey:** sign up and log in, search and filters, business pages, save, review, message a business, My details, delete account
2. **Business owner:** register a business, Edit Business (phone numbers, photos, cover crop), listings and photos, dashboard, messages, team members
3. **Marketing:** new campaign, the one-message editor, email preview (light and dark), send to the test inbox, Facebook, WhatsApp and X sharing, results
4. **Events:** create an event, admin approval, the event page, "going", sharing, linking to a campaign
5. **Admin:** approvals queue, settings, categories, reports, moderation, marketing passes
6. **Sharing and Bangla:** share links on Facebook and WhatsApp (check the preview card), the whole site in Bangla, dark mode, phone layout

## 3. Before you log an issue

1. **Can you make it happen again?** Try twice. If it only happened once, still log it, and say so.
2. **Search Jira first** (label `e2e`). If it's already there, add your screenshot and device as a comment rather than a new ticket.
3. **One problem per ticket.** Three problems on one page are three tickets.

## 4. How to log an issue in Jira

**Issue type:** Bug (for something broken) or Task (for a usability or wording change).

**Title:** `[Area] What goes wrong, where`
For example: `[Marketing] Send button stays greyed out after saving on phone`

**Labels:** `e2e`, plus one area label: `area-customer`, `area-business`, `area-marketing`, `area-events`, `area-admin`, `area-sharing`. Add `bug` or `usability`.

**Priority** (see section 5): Blocker, High, Medium or Low.

**Description:** copy this and fill it in:

```text
Account used: (e.g. Business owner, +8801711000005)
Device / browser: (e.g. iPhone 13, Safari; or Windows, Chrome)
Language and theme: (English or Bangla; light or dark)
Page / link: (paste the address from the browser)

Steps:
1.
2.
3.

What happened:

What I expected:

How often: (every time / sometimes / once)

Screenshots / screen recording: (attach)
Error details (if any): (see section 6)
```

## 5. Priority

| Priority | Meaning | Example | Fix by |
| --- | --- | --- | --- |
| **Blocker** | Someone can't finish a main task, or data is lost or shown to the wrong person | Can't log in; a business sees another business's messages | Same day |
| **High** | A main feature is broken or misleading, but there's a way around it | Campaign email shows the wrong price; photo upload fails on phone | Wed 28 Oct |
| **Medium** | Works, but confusing, slow or looks broken | Button text cut off in Bangla; layout overlaps on a small phone | Thu 30 Oct |
| **Low** | Small polish | Spacing, wording, a slightly wrong colour | If there's time |

If you're not sure, choose Medium. It gets checked at triage.

## 6. Collecting error details (2 minutes, makes fixing much faster)

On a computer, in Chrome or Edge:

1. Press **F12** (or right-click and choose **Inspect**) to open the developer tools.
2. **Console** tab: screenshot any red errors.
3. **Network** tab: do the action again. Any row in red (status 400 or 500) is a failed request. Click it, then screenshot the **Headers** (address and status) and **Response** tabs.
4. Note the **time** it happened, so the server log can be checked.

On a phone, a screenshot or screen recording and the time are enough.

**Never paste** passwords, sign-in codes, cookies or API keys into Jira, even from the Network tab.

## 7. Workflow

```text
To Do  ->  Triaged  ->  In Progress  ->  Fixed (in review)  ->  Verified  ->  Done
```

- **To Do:** just logged.
- **Triaged:** checked at the daily triage (priority confirmed, assigned to someone).
- **In Progress:** someone is fixing it. The branch is named `<name>/fix-<short-description>`, for example `ari/fix-send-button-phone`, and the commit and PR start with the ticket number.
- **Fixed (in review):** the PR is open or merged, and the fix is on the test site.
- **Verified:** **the person who reported it** checks the fix on the test site, on the same device. If it's still broken, move it back to In Progress with a comment.
- **Done:** verified.

## 8. Daily triage (15 minutes)

Each evening until Thu 30 Oct:

1. Go through new `e2e` tickets: confirm the priority, merge duplicates, assign each one.
2. Blockers and Highs first.
3. After Wed 28 Oct, 6pm: **fixes only**. Anything that's really a new feature gets the label `after-demo` and waits.

## 9. Definition of fixed

- It works with the steps in the ticket, on the device and in the language reported.
- Nothing nearby broke (check the rest of that page).
- The automatic tests still pass (CI on the PR).
- Where it makes sense, a test is added so it can't quietly come back.
- The reporter has verified it on the test site.
