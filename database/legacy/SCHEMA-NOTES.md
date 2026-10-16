# Schema v2 — what changed and why

`schema.v2.sql` + `seed.v2.sql` replace `schema.sql` + `sampleinput.sql`.

The originals are left in place and untouched. Nothing here is a matter of
taste: every change below traces to a specific line in the client's
**Scope Confirmation & Project Execution Guidelines** email (Ishtiak Ahmad
Anan, 4 September 2026), or to a constraint the old schema could not
express. Where a change is a judgement call, it says so.

Both files were executed against PostgreSQL and load clean:
18 tables, 3 views, 10 sample Rajshahi merchants, 18 listings, 3 RFQs.

---

## How to run

```
CREATE DATABASE shahebbazar;      -- fresh database, do not load over the old one
\i database/schema.v2.sql
\i database/seed.v2.sql
```

Or in pgAdmin: open each file in the Query Tool and run, schema first.
The commented sanity-check query at the bottom of `seed.v2.sql` prints
row counts.

---

## 1. Changes the client's email requires

| # | Change | Client's words |
| --- | --- | --- |
| 1 | `users` is now the single identity table with `user_role IN ('customer','vendor','admin')` | §2A: "Build three distinct account roles into the database and authorization logic: Customer, Vendor/Business Owner, and Platform Admin" |
| 2 | `users.user_phone` is `NOT NULL UNIQUE`; `user_email` is nullable | §2A: "phone-based authentication as the primary identifier (via OTP/SMS), with email kept optional" |
| 3 | New `otp_codes`, `sessions` | Same line — OTP needs somewhere to live |
| 4 | New `quote_requests`, `quote_responses` | §1 Phase 1: "Direct RFQ (Request for Quote) system, product inquiry buttons, and offline/cash-on-delivery payment terms" |
| 5 | **No payment gateway tables** | §1 explicitly postpones bKash / Nagad / SSLCommerz to Phase 2 |
| 6 | New `conversations`, `messages`, `notifications` | §2D: "lightweight messaging channel… when a seller is offline, send an SMS or email notification" |
| 7 | `vendor_status` / `listing_status` approval gates, `reports`, `reviews`, `audit_logs`, `v_moderation_queue` | §2E: "approving and verifying new business listings", "moderating inappropriate customer reviews or fake profiles" |
| 8 | New `search_logs`, `vendor_profile_views`, `v_search_trends_daily`, `v_active_users_daily` | §2E: "viewing daily/weekly search trends and active user counts" |
| 9 | `vendor_slug`, `listing_slug`, `category_slug`, `location_slug` | §2C: listings "must be crawlable by search engines" — crawlable pages need stable URL segments, not `?id=4` |
| 10 | `listing_photos.photo_alt_text`, one primary photo per listing | §2C JSON-LD needs a designated image; `alt` is also the OpenGraph/accessibility requirement |
| 11 | `vendor_business_type IN ('b2b','b2c','both')`, `listing_min_order_qty`, `listing_price_max` | The email frames the platform as "B2B/B2C discovery" — B2B sellers quote a band and a minimum order, not one price |

## 2. Changes fixing a defect in the old schema

**`vendors.vendor_password VARCHAR(255)`, inserted raw.**
`routes/vendors.js` wrote the password as plain text. The same file's
`users` table already used `user_password_hash`, so this was an
inconsistency rather than a misunderstanding. It is also contradicted by
the research report we have already submitted, which commits to APP 11 and
"TLS and hashed passwords". v2 has no password column on `vendors` at all;
`users.user_password_hash` is nullable because OTP accounts have no
password.

**`vendor_listings.category TEXT`.**
Free text meant "Silk", "silk" and "SILK " were three different categories
and no filter could be trusted. Now `category_id` referencing the
`categories` table that already existed but was never wired up.

**`vendors.vendor_city VARCHAR(255)`.**
The client asked twice for expansion beyond Rajshahi. A city string makes
that a data-cleaning job. Replaced by `location_id` into a self-referencing
`locations` hierarchy (country › division › district › city › area) with a
materialised `location_path`, so "everything under Rajshahi" is a prefix
match. The seed includes a Sylhet row with no merchants purely to prove
the hierarchy holds.

**Unprefixed columns on `vendor_listings`** (`title`, `description`,
`price`, `category`). Our own README states the convention as
"column names → table-prefixed snake_case". These are now
`listing_title`, `listing_description`, `listing_price`, `category_id`.

**No `ON DELETE` behaviour and no indexes.** Every foreign key now declares
one, and the columns the app filters on are indexed. `pg_trgm` GIN indexes
on `vendor_name` and `listing_title` support fuzzy search; trigram is the
right tool here rather than `to_tsvector`, because PostgreSQL ships no
Bengali text-search dictionary.

## 3. Judgement calls — flag these if you disagree

- **CHECK constraints instead of `ENUM` types** for status columns. Adding
  a value to an ENUM needs `ALTER TYPE`; a CHECK is a one-line migration.
- **`reports` is polymorphic** (`report_target_type` + `report_target_id`,
  no FK). This keeps the moderation queue as one list and one screen. The
  cost is that the database cannot enforce the target exists — the API has
  to.
- **`v_search_trends_daily` drops buckets under 5 events.** One district,
  one rare medical query and one identifiable person is a re-identification
  risk, and the client asked for analytics with "no personal data exposed".
  Change the `HAVING` if the team disagrees, but change it deliberately.
- **Guest RFQs allowed** (`quote_requests.user_id` nullable, contact fields
  required). Forcing registration before a buyer can ask a price will cost
  enquiries. Easy to reverse.

---

## 4. Code that needs updating

The existing routes still work in shape; the column names moved. This is
roughly an hour.

`backend/routes/vendors.js`
- `POST /` — drop `vendor_password` from the insert entirely. Registration
  now creates a `users` row (phone, name, role `vendor`) and then a
  `vendors` row referencing it. Until OTP is built, insert the user with
  `user_phone_verified_at = NULL`.
- `vendor_city` → resolve to `location_id` via `locations`.
- Add `vendor_slug` (slugify `vendor_name`, append `-2` on collision).
- `GET /` — filter `WHERE vendor_status = 'approved'` for the public list.
  `SELECT *` on a table that now holds moderation fields will leak
  rejection reasons to the public.

`backend/routes/vendorListings.js`
- `title` → `listing_title`, `description` → `listing_description`,
  `price` → `listing_price`, `category` → `category_id`.
- `INSERT … RETURNING listing_id` is unchanged.
- Photo insert should set `photo_alt_text` and `photo_is_primary` on the
  first photo; a second `photo_is_primary` on the same listing now raises a
  unique-violation by design.
- `photo_url` currently stores `file.path`, an OS-specific path with a
  backslash on Windows. Store a URL path (`uploads/<filename>`) — the seed
  assumes that form.

`frontend/shahebbazar/app/vendors/register/page.jsx`
- Remove the password field; the client asked for phone OTP.

---

## 5. Not in this schema, deliberately

- **Payment gateway tables** — Phase 2 per the client.
- **Full-text search configuration** — trigram indexes are in; ranking is
  application logic, not schema.
- **Soft deletes** — `user_status = 'deleted'` covers users; everything
  else is a hard delete with `ON DELETE CASCADE`.
- **ER diagram** — a required deliverable, not yet drawn. It can be
  generated from this schema with pgAdmin's ERD tool or dbdiagram.io.
