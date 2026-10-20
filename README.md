# shahebbazar-web

COS40005 Group 23 · Shaheb Bazar

A local business directory and B2B/B2C discovery platform for Rajshahi,
Bangladesh. Customers find and contact local businesses; business owners manage
their profile, listings and messages; administrators approve and moderate.

**Stack:** Express 5 API · Next.js 16 (React 19, TypeScript, Tailwind 4) · PostgreSQL

---

## Contents

- [Quick start](#quick-start)
- [Setup in detail](#setup-in-detail)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Authentication and access control](#authentication-and-access-control)
- [API](#api)
- [Marketing passes](#marketing-passes)
- [Testing](#testing)
- [Conventions](#conventions)
- [Troubleshooting](#troubleshooting)
- [Known gaps](#known-gaps)

---

## Quick start

Needs Node.js 24 and Docker Desktop. From the repository root:

```powershell
npm install
npm run setup                                  # backend and frontend dependencies
Copy-Item backend\.env.example backend\.env    # macOS/Linux/Git Bash: cp backend/.env.example backend/.env
docker compose up -d --wait                    # PostgreSQL
npm run db:load                                # schema and seed data
npm run dev                                    # API on :4000, website on :3000
```

Open <http://localhost:3000> and sign in with a [seeded account](#seeded-accounts).
Sign-in codes appear in the terminal running `npm run dev`.

---

## Setup in detail

### 1. Prerequisites

- Git
- [Node.js 24](https://nodejs.org/en/download)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), which runs
  PostgreSQL from `docker-compose.yml`
- Optional: VS Code, [pgAdmin](https://www.pgadmin.org/download/)

<details>
<summary>Using an existing PostgreSQL installation instead of Docker</summary>

Install PostgreSQL 15 or later and skip `docker compose`. Set `PGUSER`,
`PGPASSWORD` and `PGPORT` in `backend/.env` to match your installation, then
run `npm run db:load`. The user needs permission to create databases
(`db:load` and `npm test` create them).

If port 5432 is already taken by another PostgreSQL, put `DB_PORT=5433` in a
`.env` file at the repository root to move the Docker one, and set `PGPORT=5433`
in `backend/.env`.

</details>

### 2. Backend configuration

`backend/.env` is not stored in Git. Create it from the template (see
[Quick start](#quick-start)). The template already matches the Docker database,
so nothing needs changing for local development.

The first `npm run dev` fills in what is still missing: it generates a unique
`OTP_HASH_SECRET` and turns on console delivery of sign-in codes
(`backend/scripts/ensure-local-auth-env.js`). Never commit `backend/.env`,
sign-in codes or session tokens.

| Variable | Purpose | Local value |
| --- | --- | --- |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | PostgreSQL connection | `localhost`, `5432`, `shahebbazar`, `postgres`, `postgres` |
| `PORT` | API port | `4000` |
| `CORS_ORIGIN` | Browser origins allowed to call the API, comma-separated | `http://localhost:3000` |
| `ANALYTICS_SALT` | Key for anonymous visitor hashes | any text |
| `MOCK_VERIFICATION_DELIVERY` | `console` prints sign-in codes in the API terminal (never in production) | `console` |
| `OTP_HASH_SECRET` | Secret used to hash sign-in codes | generated |
| `UPLOAD_DIR` | Where uploaded images are stored | unset (`backend/uploads`) |
| `TRUST_PROXY` | Set behind a reverse proxy so visitor IPs are correct | unset |
| `NOTIFY_DELAY_MINUTES` | Wait before an unread message triggers an SMS/email alert | unset (5) |
| `MARKETING_WORKSPACE_ENABLED` | `true` shows the business owner's Marketing pages and routes. Admin pass management is always on | `false` |
| `MARKETING_EXPIRED_EMAILS_PER_WEEK` | Free emails a business may still send after its pass ends | unset (1) |

The frontend runs locally with no configuration. For other environments, set
`API_BASE_URL` (server-side API calls), `NEXT_PUBLIC_API_BASE_URL` (browser API
calls), `NEXT_PUBLIC_ASSET_BASE_URL` (uploaded images) and `NEXT_PUBLIC_SITE_URL`
(links and link previews). `NEXT_PUBLIC_` values are fixed at `npm run build`.

### 3. Database

```bash
docker compose up -d --wait
npm run db:load
```

`db:load` builds the database from `database/baseline/schema.sql` and
`database/baseline/seed.sql`, copies seed images from `database/seed-assets/`
into the upload folder, and checks the result. It only loads an empty database.
To wipe and rebuild, run `npm run db:reset`.

When a pull request adds a file to `database/migrations/`, apply it to your existing
database instead of resetting: `psql -d shahebbazar -f database/migrations/<file>.sql`
(the files are safe to run twice).

| Command | Purpose |
| --- | --- |
| `docker compose ps` | Check the database container is healthy |
| `docker compose logs -f db` | Follow PostgreSQL logs |
| `docker compose stop` | Stop PostgreSQL, keep the data |
| `docker compose down -v` | Remove the container **and delete the data** |

How the database files are organised and how schema changes are made is in
[`database/README.md`](database/README.md). Files in `database/legacy/` are kept
for reference and never loaded.

### 4. Run

```bash
npm run dev
```

The API terminal lines start with `[api]` and should include:

```text
[api] API running on http://localhost:4000
[api] Database schema verified.
```

The website is at <http://localhost:3000> (`?lang=bn` for Bangla).
`Ctrl+C` stops both. The API restarts on code changes; uploads and
`node_modules` are ignored (`backend/nodemon.json`).

### Seeded accounts

Sign in at `/login` (customers and business owners) or `/admin/login`. Enter the
phone number, then the six-digit code printed in the API terminal:

```text
[mock verification] code: 123456
```

| Account | Phone | Notes |
| --- | --- | --- |
| Admin | `+8801711000001` | Platform Admin |
| Business owner | `+8801711000005` | Rajshahi Mango Traders |
| Business owner, two businesses | `+8801711000002` | Shaheb Bazar Silk House (approved) and Cloth Store (pending), so shows the business picker |
| Business owner | `+8801711000006` | Uttara Light Engineering; useful as "another vendor" |
| Customer | `+8801722000001` | Imran Chowdhury |
| Customer | `+8801722000002` | Farhana Yasmin |

Codes are limited to 3 requests per number in 10 minutes. To create new
accounts, use any unused number at `/register/customer` or `/vendors/register`.

---

## Scripts

Run from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install backend and frontend dependencies |
| `npm run dev` | Start the API (with auto-restart) and the website |
| `npm run dev:api` / `npm run dev:web` | Start only one of them |
| `npm run db:load` | Create and load an empty database: schema, seed data, seed images |
| `npm run db:reset` | Drop, recreate and reload the database (asks first) |
| `npm run db:verify` | Check the database has every required table, view and column |
| `npm run uploads:check` | Compare stored image paths with the upload folder. `-- --fix` removes references to missing files and moves unused files to `uploads/.unreferenced/` |
| `npm test` | API tests against a throwaway database (see [Testing](#testing)) |
| `npm run lint` | Frontend lint |
| `npm run typecheck` | Frontend TypeScript check |
| `npm run build` | Production build of the website |
| `npm start` | Start the API and the built website |
| `npm run docs:erd` | Regenerate `docs/ER-DIAGRAM.md` from the database |

---

## Project structure

| Path | Contents |
| --- | --- |
| `backend/` | Express API: `routes/`, shared code in `lib/`, `scripts/` for database and maintenance commands, `test/` |
| `frontend/shahebbazar/` | Next.js website: `app/` pages, `components/`, `lib/` (API helpers, types, translations) |
| `database/` | `baseline/` schema and seed, `checks/`, `snapshots/`, `legacy/` |
| `docs/` | File reference, ER diagram, requirements, OpenAPI spec, audits, `testing/` validation reports |

### Website areas

Route groups in brackets organise files without appearing in URLs. Each private
area's `layout.tsx` checks the session and sends visitors elsewhere if they
are signed out or in the wrong role.

| Folder | Who | Main pages |
| --- | --- | --- |
| `app/(public)/` | Everyone | `/`, `/search`, `/categories`, `/business/[slug]`, `/events`, `/login`, `/admin/login`, `/register/customer`, `/vendors/register`, legal pages |
| `app/(seeker)/` | Signed-in customers | `/account`, `/account/saved`, `/account/reviews`, `/account/messages`, `/report` |
| `app/(provider)/` | Business owners (and admins viewing a business) | `/vendors/dashboard` and its pages: business, listings, payment methods, reviews, messages, inquiries, settings |
| `app/(admin)/` | Admins | `/admin` approvals, reports, reviews, search trends, categories, marketing passes |

### How requests flow

In development the website (port 3000) and the API (port 4000) run separately.
Pages are rendered on the Next.js server, which calls the API, so public business
pages are crawlable. A few browser components call the API directly, such as
image uploads and analytics beacons.

The planned production layout (KAN-254) puts both behind one HTTPS origin, with
a reverse proxy sending `/api/*` and `/uploads/*` to Express and everything else
to Next.js.

---

## Authentication and access control

### Sign-in

Accounts are identified by phone number. There are no passwords.

1. The user picks a portal (customer, business owner or admin) and enters their phone.
2. The API checks an active account with that role exists, then stores an
   HMAC-SHA256 hash of a random six-digit code that expires in five minutes.
3. The code is delivered. During Phase 1 it is printed in the API terminal
   instead of sent by SMS, as agreed with the client.
4. The user enters the code. The API marks it used, creates a session, and sets
   an HTTP-only `shaheb_session` cookie. Only a hash of the session token is stored.
5. The website sends the user to their area: `/account`, `/vendors/dashboard` or `/admin`.

Protections: Australian and Bangladeshi number normalisation; 5 wrong guesses per
code; 3 code requests per number and purpose per 10 minutes; request IP
recorded; codes are never stored or returned in plain text.

**Registration** works the same way with purpose `register`: customers at
`/register/customer`, businesses at `/vendors/register`. The account is created
only after the code is confirmed. A new business starts as pending and stays out
of public listings until an admin approves it, but its owner can edit it straight away.

Logout deletes the session and expires the cookie.

### Who can do what

The API enforces these rules whatever the website shows. The middleware is in
`backend/lib/middleware/auth.js`, and `npm test` checks every route against
every role.

| Routes | Signed out | Customer | Another vendor | Owner | Admin |
| --- | --- | --- | --- | --- | --- |
| Public browsing (`/api/home`, `/api/businesses/...`, `/api/categories`, `/api/events`) | yes | yes | yes | yes | yes |
| Customer area (`/api/me/...`, reports, writing reviews) | 401 | yes | 403 | 403 | 403 |
| Managing a business: profile, images, listings, payment methods, owner details, dashboard, reading reviews, Marketing pass status | 401 | 403 | 403 | yes | yes |
| Acting as the business: messages, inquiries, alerts, review replies | 401 | 403 | 403 | yes | 403 |
| Administration (`/api/admin/...`) | 401 | 403 | 403 | 403 | yes |

- **Ownership** comes from the database, never from the URL. A business id in the
  path is accepted only if `vendors.user_id` is the signed-in user.
- **Owners with several businesses** get a picker on `/vendors/dashboard`; with
  one business they go straight to it.
- **Admins viewing a business:** "Open the business's pages" on the Approvals
  cards opens the business's dashboard with an admin banner. Messages,
  inquiries and review replies stay hidden because they belong to the owner.
- **Audit log:** admin decisions, category changes, report resolutions,
  review moderation and Marketing pass changes are recorded in `audit_logs`
  against the signed-in admin.

The website's area redirects:

| Visitor | Customer pages | Business pages | Admin pages |
| --- | --- | --- | --- |
| Signed out | `/login` | `/login` | `/admin/login` |
| Customer | allowed | `/account` | `/account` |
| Business owner | `/vendors/dashboard` | allowed | `/vendors/dashboard` |
| Admin | `/admin` | allowed, in admin view | allowed |

---

## API

Browse every endpoint with request and response examples at
<http://localhost:4000/api/docs> while the API is running. The spec is
[`docs/openapi.yaml`](docs/openapi.yaml), which can be imported into Postman.

Public endpoints return approved records only. Start with these:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API, database and schema status; check this first when something fails |
| GET | `/api/home` | Categories, featured businesses, events and popular searches |
| GET | `/api/businesses` | Search: results, sponsored results, pagination and filters |
| GET | `/api/businesses/:slug` | A public business profile |
| POST | `/api/auth/request-verification` | Send a sign-in or registration code |
| POST | `/api/auth/verify` | Sign in with the code; sets the session cookie |
| POST | `/api/auth/register/customer`, `/api/auth/register/vendor` | Create an account with a `register` code |
| GET | `/api/auth/me` | The signed-in account |

Sponsored results come back separately from ordinary results and must be shown
with a visible "Sponsored" label.

Uploaded images are stored as `uploads/<file>` paths and served by the API at
`/uploads/<file>`. Listings take up to 8 JPG, PNG or WEBP photos of up to 5 MB each.

---

## Marketing passes

The vendor marketing package (KAN-242/243) is being built in six stages
(KAN-283 to KAN-288); see the delivery plan. Stage 1 is in place:

- Three passes (7, 30 and 90 days; proposed BDT 299, 999 and 2,499) in
  `marketing_packages`, each with email-campaign, AI-draft and SMS allowances.
- Admins give a business a pass on **Admin → Marketing** (`/admin/marketing`), and
  can extend, end, suspend, resume or cancel it. Payment is recorded outside the
  site until SSLCommerz is added.
- A running pass puts the business in the Sponsored slot on the home and search
  pages. Placement ends by itself when the pass ends (`v_business_cards` only treats
  a business as featured until `vendor_featured_until`).
- `backend/services/marketing/entitlements.js` is the only place that decides what a
  business may do with its pass (`checkEntitlement`, `useEntitlement`). Later stages
  call it before every paid action.

---

## Testing

```bash
npm test
```

This creates a throwaway `<PGDATABASE>_test` database from the baseline, starts
the real API against it, signs in through the normal code flow as each role,
runs the tests, and drops the database. Your development data is not touched.

About 415 tests across 13 suites. Every API route is called by at least one test.

| Suite | Covers |
| --- | --- |
| `backend/test/unit.test.js` | Pure helpers, no database: phone and web-address rules, opening hours, ID parsing, search-text normalising, and the role matrix (every `requireFeature` names a real feature; `docs/ACCESS-MATRIX.md` matches `lib/access.js`) |
| `backend/test/public.test.js` | Home page, categories, search (filters, sorting, paging, Sponsored slot, only approved businesses), business pages, payment methods, events, sitemap, API docs, health |
| `backend/test/auth.test.js` | Sign-in codes (portals, rate limit, wrong-code lockout, expiry, single use), sessions (cookie flags, hashed tokens, expiry, suspension, logout), customer registration rules |
| `backend/test/registration.test.js` | Customer and business registration with codes |
| `backend/test/access.test.js` | Every signed-in route against every role; refused requests change nothing; admin actions audited against the right admin |
| `backend/test/customer.test.js` | Account summary, saved businesses, reviews (one per business, moderation), reports, messages and alerts |
| `backend/test/vendor.test.js` | Business profile rules, payment methods, business photos and logo (files removed when no longer used), dashboard |
| `backend/test/members.test.js` | Businesses run by several people: managers, team changes, shared messages, separate alerts |
| `backend/test/listings.test.js` | Listings and photos from upload to the public page; upload validation |
| `backend/test/admin.test.js` | Approvals, categories, resolving each kind of report, review moderation, search trends |
| `backend/test/analytics.test.js` | Search and view beacons: repeat visits and bots not counted, appearances for approved businesses only |
| `backend/test/uploads.test.js` | `npm run uploads:check` |
| `backend/test/marketing.test.js` | Marketing passes: activation and management, sponsored placement ending with the pass, allowances |

CI runs the same suite on every pull request, so a new feature should come with
tests in the suite that matches it (or a new one). **How to write one:**
[docs/TESTING.md](docs/TESTING.md).

Before opening a pull request, also run `npm run lint`, `npm run typecheck` and
`npm run build`. Manual and browser test evidence goes in `docs/testing/`, one
report per Jira task.

---

## Conventions

### Database

- Tables: plural `snake_case`. Columns: `snake_case` prefixed with the table, e.g. `vendor_created_at`.
- Foreign keys: `<table>_id`, e.g. `vendor_id`, `category_id`.
- Schema changes follow `database/README.md`.

### Frontend

- Pages are Server Components. Add `"use client"` only for browser state or interactivity.
- Fetch page data on the server, not in `useEffect`.
- Signed-in data: `authenticatedApiGet()` in pages and `authenticatedApiSend()` in
  Server Actions (`lib/auth-server.ts`). Both forward the session cookie. The
  helpers in `lib/api.ts` are for public data only.
- Browser `fetch` calls to private API routes need `credentials: "include"`.
- Shared response types live in `lib/types.ts`; translated text in `lib/i18n.ts`.

### Styling

Use Tailwind utilities with the tokens in `app/globals.css`, such as
`bg-brand-600`, `text-muted`, `border-line`, `bg-surface` and `shadow-card`.
The tokens switch automatically for dark mode, so avoid raw hex colours.

Write Tailwind class names out in full. Built strings such as
`` `bg-${colour}-50` `` are not generated.

Icons: `lucide-react` for interface icons, `@icons-pack/react-simple-icons` for
brand marks such as Facebook or WhatsApp.

### Branches and commits

`main` is protected: nobody pushes to it directly, and every change arrives through a
pull request that has passed CI. CI is the gate, so no approval is needed to merge.

1. Update your copy of `main` and branch from it: `git switch main`, `git pull`,
   `git switch -c <name>/<type>-<task>` (for example `ari/fix-listing-photo-upload`).
2. Start commit messages with the Jira key, for example `KAN-260 Fix listing photo upload`.
3. Before pushing, run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build`.
4. Push and open a pull request into `main`. Fill in the template.
5. **CI** (`.github/workflows/ci.yml`) runs the API tests against PostgreSQL, then lint,
   typecheck and the production build. Both checks must pass before the PR can merge.
6. If `main` has moved on, update the branch (`git pull origin main`) so the checks run
   against the latest code. Turn on **auto-merge** and the PR merges itself when CI passes.
7. Tag a teammate on the PR. They review after it merges, and any problem becomes a
   follow-up PR. Because CI is the only gate, add tests with every change.

Never commit `.env` files, sign-in codes, session tokens or files from `backend/uploads/`.

---

## Troubleshooting

Check <http://localhost:4000/api/health> first. It reports the database and the
schema separately.

| Symptom | Fix |
| --- | --- |
| PostgreSQL refuses the connection | `docker compose up -d --wait`, then `docker compose ps` |
| Password authentication failed | `PGPASSWORD` in `backend/.env` must match the database (`postgres` for Docker) |
| Database does not exist | `npm run db:load` |
| API returns `500`, or health reports missing objects | The database is incomplete or old. Run `npm run db:reset`. |
| Home page has no data | Check the API and database are running, then `/api/health` |
| Page shows old data after changing the seed | Home data is cached for 5 minutes. Delete `frontend/shahebbazar/.next` and restart. |
| `EADDRINUSE` | Another process holds the port: `npx kill-port 4000` (or `3000`), then restart |
| Code request returns `500` | `OTP_HASH_SECRET` is missing. Restart with `npm run dev`, which generates it. |
| No code appears in the terminal | `MOCK_VERIFICATION_DELIVERY=console` must be set and `NODE_ENV` must not be `production` |
| Code request returns `429` | 3 requests per 10 minutes per number. Wait, or use another number. |
| Page redirects to `/login` while signed in, or `/api/auth/me` returns `401` | The session expired or the cookie is missing. Sign in again. |
| A private page shows no data or "not found" | The page or component calls the API without the session. Use the authenticated helpers or `credentials: "include"`. |
| `403` on a business page | The signed-in account does not own that business |
| Broken images | `npm run uploads:check`, then `npm run uploads:check -- --fix` |
| `npm test` cannot create the test database | The `PGUSER` needs permission to create databases |
| `'nodemon' is not recognized` | `npm run setup` |

---

## Known gaps

- **SMS delivery** is mocked for Phase 1. Codes print in the API terminal. An
  SMS provider must be connected before launch.
- **Seed images:** seeded businesses and listings have no photos and show
  placeholders until development images are chosen (`database/README.md`).
- **One role per account:** a customer cannot also register a business with the
  same phone number yet (KAN-249).
- **Admin edits in the business pages** (profile, listings, payment methods) are
  not yet written to the audit log. Approved businesses have no admin link yet;
  open `/vendors/dashboard?vendor=<id>` directly.
- **Business form feedback:** some invalid fields (categories, description,
  location, contact details) are not clearly highlighted in the form.
- **Deployment** (KAN-254): no production configuration yet. CI checks every pull request (`.github/workflows/ci.yml`).
- **Language** uses `?lang=bn`; `/en` and `/bn` URL prefixes are a future improvement.
- **Maps** are illustrations, not a live map.
- **Bookings and promotions** are later-phase features.
