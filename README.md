# shahebbazar-web

COS40005 — Group 23 · Shaheb Bazar

A local business directory and B2B/B2C discovery platform for Rajshahi,
Bangladesh. Express API + Next.js frontend + PostgreSQL.

---

## Architecture

```text
                          ┌─ /        ──:3000──> Next.js (SSR frontend)
Browser ──HTTPS:443──> Caddy                          │ server-side fetch
                          └─ /api/*   ──:4000──> Express API ──:5432──> PostgreSQL
```

Two processes run behind one origin. Next.js pages fetch public and protected
data from Express on the server where appropriate, supporting crawlable public
business pages and authenticated private account areas.

| Path | Purpose |
| --- | --- |
| `backend/` | Express API, port 4000 |
| `frontend/shahebbazar/` | Next.js 16 + TypeScript + Tailwind 4 |
| `database/` | PostgreSQL schema, seed data and database notes |

### Role-based frontend areas

Route groups organise files without adding their folder names to URLs.

```text
app/
  layout.tsx                 Root layout, fonts and metadata
  (public)/                  Public browsing and authentication
    page.tsx                 /
    login/                   /login
    admin/login/             /admin/login
    vendors/register/        /vendors/register
  (seeker)/                  Authenticated customer area
    layout.tsx               Customer authentication gate
    account/                 /account
  (provider)/                Authenticated business-owner area
    layout.tsx               Vendor authentication gate
    vendors/dashboard/       /vendors/dashboard
  (admin)/                   Authenticated administrator area
    layout.tsx               Administrator authentication gate
    admin/                   /admin

components/
  shared/                    Shared site UI
  public/                    Public browsing UI
  seeker/                    Customer account UI
  provider/                  Business-owner UI
  admin/                     Administrator UI
```

Public discovery pages remain readable while signed out. Customer, provider and
administrator layouts resolve the active server-side session and redirect users
who are signed out or attempting to access an area assigned to another role.
Backend authentication, role and ownership middleware remains authoritative.

Registration stays in `(public)` because an account is not yet authenticated as
a provider while registration is being completed.

---

## Authentication and RBAC

Shahebbazar uses phone-based OTP verification, server-side sessions and
role-based access control.

| Role | Protected area | Login destination |
| --- | --- | --- |
| `customer` | Customer account | `/account` |
| `vendor` | Business-owner dashboard | `/vendors/dashboard` |
| `admin` | Administrator dashboard | `/admin` |

Customer and business-owner login is available at `/login`. Administrator login
is available separately at `/admin/login`.

### Dynamic login flow

```text
User selects the relevant login portal
        ↓
Backend normalises the phone number and finds the active account
        ↓
Backend confirms the stored role matches the selected portal
        ↓
A hashed six-digit OTP is stored with a five-minute expiry
        ↓
Development delivery prints the raw code in the API terminal
        ↓
Successful verification consumes the OTP and creates a session
        ↓
The browser receives the HTTP-only shaheb_session cookie
        ↓
The frontend redirects according to the stored account role
```

The selected portal does not assign a role. The backend compares the expected
role with the role already stored for the account in PostgreSQL.

### Sessions and protected routes

Successful verification creates a row in the `sessions` table. Only a hash of
the session token is stored. The browser receives the raw token in an HTTP-only
`shaheb_session` cookie.

Authentication middleware:

1. Reads and hashes the supplied session token.
2. Resolves an active, unexpired database session.
3. Loads the associated active user.
4. Adds the user and session to the Express request.
5. Applies the role and ownership checks required by the route.

Expected frontend access behaviour:

```text
Signed out + customer/provider page → /login
Signed out + administrator page     → /admin/login
Customer + provider/admin page      → /account
Vendor + customer/admin page        → /vendors/dashboard
Admin + customer/provider page      → /admin
```

Private customer routes use `req.user.user_id` rather than a seeded customer
identity. Protected Server Component reads use `authenticatedApiGet()`, while
protected Server Actions use `authenticatedApiSend()`.

### Server-side access rules

Every rule below is enforced by the API, whatever the frontend shows. The
middleware is in `backend/lib/middleware/auth.js`; `npm test` checks each
route against each role (`backend/test/access.test.js`).

| Routes | Signed out | Customer | Another vendor | Owner | Admin |
| --- | --- | --- | --- | --- | --- |
| Public browsing (`/api/home`, `/api/businesses/...`, `/api/categories`, `/api/events`) | yes | yes | yes | yes | yes |
| Customer area (`/api/me/...`, `POST /api/reports`, writing reviews) | 401 | yes | 403 | 403 | 403 |
| Managing a business: dashboard, summary, profile, logo and photos, listings and listing photos, payment methods, owner details, reading reviews (`/api/vendors/:vendorId/...`, `/api/listings/:listingId/...`) | 401 | 403 | 403 | yes | yes |
| Acting as the business: messages, inquiries, alerts, review replies | 401 | 403 | 403 | yes | 403 |
| Registering (`/api/auth/register/customer`, `/api/auth/register/vendor`) | with a phone code | | | | |
| Administration (`/api/admin/...`, applied once in `index.js`, so new admin routes are covered automatically) | 401 | 403 | 403 | 403 | yes |

Admin decisions, category changes, report resolutions and review moderation are
recorded in `audit_logs` against the signed-in admin.

Admins can open any business's provider pages ("Open the business's pages" on the
Approvals cards) to check or correct its details, listings and payment methods. The
pages show an admin banner, and messages, inquiries and review replies stay hidden
because they belong to the owner.

### Vendor ownership

Vendor access is not granted solely from a `vendorId` supplied in the URL. The
backend verifies that the requested business belongs to the authenticated user:

```text
vendors.vendor_id = requested vendor ID
AND
vendors.user_id = authenticated user ID
```

A vendor account connected to one business is redirected directly to that
business dashboard. An account connected to multiple businesses receives a
selector containing only its owned businesses.

### Logout and session-aware navigation

Logout deletes the active database session and expires the `shaheb_session`
cookie. The active header displays the signed-in account state and returns to
login/register controls after logout. `localStorage` is not the authentication
source of truth.

---

## Setup

### 1. Install prerequisites

- Git
- VS Code
- [Node.js 24.x](https://nodejs.org/en/download)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

Docker runs PostgreSQL using `docker-compose.yml` at the repository root.
[pgAdmin](https://www.pgadmin.org/download/) is optional.

<details>
<summary>Using an existing PostgreSQL installation</summary>

Install PostgreSQL 15 or later and skip the Docker startup command. Set
`PGUSER`, `PGPASSWORD` and `PGPORT` in `backend/.env` to match the local
installation, then run `npm run db:load`.

</details>

### 2. Install dependencies

From the repository root:

```bash
npm install
npm run setup
```

`npm install` installs the root development tooling. `npm run setup` installs
the backend and frontend dependencies.

### 3. Configure the backend

The real backend environment file is not stored in Git. Create it from the safe
template.

Windows PowerShell:

```powershell
Copy-Item backend\.env.example backend\.env
```

macOS, Linux or Git Bash:

```bash
cp backend/.env.example backend/.env
```

Example local configuration:

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=shahebbazar
PGUSER=postgres
PGPASSWORD=YOUR_POSTGRES_PASSWORD

PORT=4000
ANALYTICS_SALT=shahebbazar-local-dev
CORS_ORIGIN=http://localhost:3000

# Phase 1 mock phone verification
MOCK_VERIFICATION_DELIVERY=console
OTP_HASH_SECRET=GENERATE_A_UNIQUE_LOCAL_SECRET
```

Generate a local OTP hashing secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `OTP_HASH_SECRET`. Never commit `backend/.env`,
the generated secret, raw verification codes or session tokens.

### 4. Start and load the database

```bash
docker compose up -d --wait
npm run db:load
```

`db:load` builds the database from `database/baseline/schema.sql` and
`database/baseline/seed.sql`, copies any seed images from `database/seed-assets/` into `backend/uploads/`
and verifies the result. It only loads an empty database; to wipe and rebuild
an existing one, run `npm run db:reset` and follow the prompt. Run
`npm run db:verify` at any time to check a database is complete.

| Command | Purpose |
| --- | --- |
| `docker compose up -d` | Start PostgreSQL |
| `docker compose ps` | Check container health |
| `docker compose logs -f db` | Follow PostgreSQL logs |
| `docker compose stop` | Stop PostgreSQL and keep data |
| `docker compose down` | Remove the container and keep the named volume |
| `docker compose down -v` | Remove the container and delete local database data |

For how the database files are organised and how schema changes are made, see
`database/README.md`. The historical versioned files in `database/legacy/` are
kept for reference only and are never loaded.

### 5. Run the application

```bash
npm run dev
```

Expected startup:

```text
[api] Authentication routes loaded.
[api] API running on http://localhost:4000
[api] Database schema verified.
[web] Ready on http://localhost:3000
```

Open `http://localhost:3000`. Use `?lang=bn` for the current Bangla-language
version. Press `Ctrl+C` to stop both processes.

The backend uses the project-local Nodemon dependency and
`backend/nodemon.json`. Nodemon watches relevant backend source files and
ignores `node_modules` and uploaded files, preventing unnecessary restarts
during dependency or upload changes.

---

## Scripts

Run these from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js frontend and Nodemon-managed Express API |
| `npm run dev:api` | Start only the Express API with Nodemon |
| `npm run dev:web` | Start only the Next.js frontend |
| `npm run db:load` | Create the database if required and load the baseline schema, seed data and seed images |
| `npm run db:reset` | Drop, recreate and reload the database after confirmation |
| `npm run db:verify` | Check the database has every required table, view and column |
| `npm run uploads:check` | Compare stored image paths with the upload folder; add `-- --fix` to remove references to missing files and move unused files to `uploads/.unreferenced/` |
| `npm test` | Run the backend API tests (access rules, listings and photos, `uploads:check`) against a throwaway `<PGDATABASE>_test` database |
| `npm run build` | Build the frontend for production |
| `npm start` | Start both production processes after a frontend build |
| `npm run lint` | Run frontend lint checks |
| `npm run typecheck` | Run frontend TypeScript checks |
| `npm run setup` | Install backend and frontend dependencies |

Each subproject can also run separately:

```bash
cd backend && npm run dev
cd frontend/shahebbazar && npm run dev
```

---

## Phase 1 phone verification

Phone number is the primary account identifier. Live SMS delivery is deferred
for Phase 1 due to provider costs, so development uses a client-approved console
mock.

```text
Client submits phone number, purpose and expected role
        ↓
Backend validates the phone and matching account role
        ↓
Backend generates a secure six-digit code
        ↓
Only an HMAC-SHA256 hash is stored
        ↓
The code expires after five minutes
        ↓
Mock delivery prints the code in the local API terminal
```

The raw code is not stored in PostgreSQL or returned by the API.

Example request:

```http
POST /api/auth/request-verification
Content-Type: application/json
```

```json
{
  "phone": "+8801700000100",
  "purpose": "login",
  "expectedRole": "customer"
}
```

Supported purposes:

```text
login
register
recover
verify
```

Development-only terminal output:

```text
[mock verification] phone: <normalised phone>
[mock verification] purpose: <purpose>
[mock verification] code: <six-digit code>
```

Do not include mock codes in commits, screenshots, Jira evidence or project
documentation.

Implemented verification controls include:

- Australian and Bangladesh phone-number normalisation
- Phone-format and verification-purpose validation
- Role matching for customer, vendor and administrator login portals
- Secure six-digit code generation and HMAC-SHA256 hashing
- Five-minute expiry and attempt limiting
- Request limiting by phone number and purpose
- Request-IP recording
- One-time OTP consumption
- Database-backed session creation
- Console-only mock delivery outside production

Code confirmation, customer registration, session creation, dynamic role
redirection, protected role layouts and logout are implemented. Only live SMS
delivery is mocked for Phase 1.

---

## API

Public discovery endpoints return approved records only. Private routes require
an active session and the required role or ownership relationship.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API, database and schema health |
| GET | `/api/home` | Categories, featured businesses, events and popular searches |
| GET | `/api/categories` | Category tree |
| GET | `/api/businesses` | Search results, sponsored results, pagination and facets |
| GET | `/api/businesses/:slug` | Approved public business profile |
| GET | `/api/auth/me` | Safe details for the authenticated account |
| POST | `/api/auth/request-verification` | Validate account/role and create a hashed OTP |
| POST | `/api/auth/verify` | Consume the OTP, create a session and set the session cookie |
| POST | `/api/auth/register/customer` | Create a verified customer account |
| POST | `/api/auth/register/vendor` | Create a verified business owner account and pending business, after a `register` code |
| POST | `/api/auth/logout` | Delete the active session and expire the cookie |
| GET | `/api/vendor-account/businesses` | Businesses owned by the authenticated vendor account |
| GET / POST | `/api/vendors/:vendorId/listings` | The owner's listings with their photos / create a listing (owner or admin) |
| PUT / DELETE | `/api/listings/:listingId` | Update or delete a listing (owner or admin) |
| POST | `/api/listings/:listingId/photos` | Upload up to 8 JPG/PNG/WEBP photos, 5 MB each (owner or admin) |
| PUT | `/api/listings/:listingId/photos/:photoId/primary` | Make a photo the listing's main photo (owner or admin) |
| DELETE | `/api/listings/:listingId/photos/:photoId` | Remove a listing photo; the next one becomes main (owner or admin) |

Sponsored results are returned separately from ordinary search results and must
render with a visible sponsored label.

---

## Conventions

### Database

- Table names: plural `snake_case`
- Column names: table-prefixed `snake_case`
- Foreign keys: `<table>_id`

Examples: `vendor_id`, `category_id`, `user_email`, `vendor_created_at`.

### Frontend

- Pages are Server Components by default.
- Add `"use client"` only for browser state or interactivity.
- Do not perform ordinary page data fetching in `useEffect`.
- Protected server reads use `authenticatedApiGet()`.
- Protected Server Actions use `authenticatedApiSend()`.
- Shared response types live in `frontend/shahebbazar/lib/types.ts`.
- Translated copy belongs in `lib/i18n.ts`.

### Styling

Use Tailwind utilities and the tokens declared in `app/globals.css`, including
`bg-brand-600`, `text-muted`, `border-line`, `bg-surface` and `shadow-card`.
Avoid raw hex values and unnecessary new CSS classes.

Tailwind class names must appear complete in source. Dynamic fragments such as
`` `bg-${colour}-50` `` are not generated reliably.

### Icons

| Library | Use |
| --- | --- |
| `lucide-react` | General interface icons |
| `@icons-pack/react-simple-icons` | Brand marks such as Facebook or WhatsApp |

Inline SVG remains appropriate for original illustrations rather than ordinary
interface icons.

### Branches

```text
main               protected, production-ready
develop            shared development
ari/feature-rbac   authentication and RBAC development
feature/<task>     other individual task branches
```

---

## Troubleshooting

Check `http://localhost:4000/api/health` first. It reports the database and
schema state separately.

| Symptom | Cause and fix |
| --- | --- |
| API endpoint returns `500` after startup | Check the `[api]` terminal. A partly loaded database is a common cause. Run `npm run db:reset`. |
| Home page renders with no data | Confirm the API and PostgreSQL are running, then check `/api/health`. |
| Data changed but the page remains stale | Remove `frontend/shahebbazar/.next` and restart the frontend. |
| `EADDRINUSE` or stale API responses | Run `npx kill-port 4000` or `npx kill-port 3000`, then restart. |
| PostgreSQL refuses the connection | Run `docker compose up -d` and check `docker compose ps`. |
| PostgreSQL password authentication fails | Make `PGPASSWORD` in `backend/.env` match the database configuration. |
| Database does not exist | Run `npm run db:load`. |
| OTP request returns `500` | Configure `OTP_HASH_SECRET` in `backend/.env` and restart the API. |
| OTP succeeds but no code appears | Confirm `MOCK_VERIFICATION_DELIVERY=console` and restart outside production mode. |
| OTP request returns `429` | Wait for the request window or use another synthetic test number. |
| `/api/auth/me` returns `401` | No valid active session was supplied. Log in again and confirm `shaheb_session` exists for `localhost`. |
| Login succeeds but a protected page returns `401` | The page may still use an unauthenticated API helper. Use `authenticatedApiGet()` or `authenticatedApiSend()`. |
| Customer data shows a seeded account | Replace the seeded identity helper with protected middleware and `req.user.user_id`. |
| Vendor dashboard returns `403` | The authenticated account does not own the requested business. Select an owned business. |
| Vendor dashboard repeatedly reloads | Remove unnecessary `router.refresh()` calls after login navigation. Use one `router.replace()` navigation. |
| API repeatedly restarts after startup | Confirm `backend/nodemon.json` ignores `node_modules/**` and `uploads/**`. |
| `'nodemon' is not recognized` | Run `npm install --prefix backend --save-dev nodemon`. |

---

## Known gaps

- **Live SMS delivery is deferred for Phase 1.** OTP generation, hashing,
  expiry, one-time consumption and session creation are implemented. Only the
  delivery mechanism is mocked.

- **Some provider subpages still require authenticated migration.** The
  provider layout, owned-business selector and main dashboard use session and
  ownership checks. Remaining provider reads, writes and uploads must use the
  authenticated helpers and backend ownership middleware.

- **Vendor profile validation needs clearer field-level feedback.** The backend
  returns validation details, but invalid categories, description, location or
  contact fields are not always obvious in the form.

- **The seed has no photos yet.** Seeded businesses and listings show
  placeholders until suitable development images are chosen; see
  `database/README.md`.

- **Business and listing image uploads require completion.** Image rendering
  and URL resolution are present, but seed businesses may have no logo, cover
  or listing-photo records. Multipart uploads still require full authenticated
  ownership handling and testing.

- **New businesses begin as pending.** They remain hidden from public discovery
  until approved but should remain editable by the authenticated owner.

- **Administrator login is implemented at `/admin/login`.** Signed-out access
  to `/admin` redirects there, while customer and vendor sessions are redirected
  to their own areas.

- **Language currently uses `?lang=bn`.** Locale-prefixed `/en` and `/bn`
  routes remain a future improvement.

- **Bookings and promotions are later-phase provider features.**

- **Maps are SVG illustrations rather than a live mapping integration.**

- **`/api/home` is cached for five minutes.** Restart the frontend or remove
  `frontend/shahebbazar/.next` after changing seed data if stale content remains.
