# Shahebbazar Database Audit
071026 completed by ari
## 1. Purpose

This document tracks the audit and consolidation of the Shahebbazar PostgreSQL database.

Shahebbazar is a group project, so this document must be updated after every significant database change, test, result, or technical decision. The goal is to ensure that every team member can understand the current database state and reproduce the development environment on another computer.

This document must never contain:

- PostgreSQL passwords
- Session secrets
- Analytics salts
- API keys
- Production credentials
- Genuine user identification information

Local secrets must remain in `backend/.env`, which must not be committed to Git.

---

## 2. Audit goals

The current database is constructed from multiple historical schema and seed files.

The audit aims to produce:

1. One consolidated baseline schema.
2. One consolidated development seed.
3. A repeatable database reset process.
4. A database verification script.
5. Archived legacy schema and seed files.
6. Clear setup and maintenance documentation.
7. A known-good database baseline for continuing authentication and RBAC implementation.

The first consolidation pass must preserve existing application behaviour.

It must not redesign the database or change:

- Authentication behaviour
- RBAC behaviour
- API response structures
- Existing database identifiers
- Seeded user accounts
- Vendor and listing slugs
- OTP stub behaviour
- NID verification stub behaviour

---

## 3. Target outcome

The intended database structure is:

```text
database/
├── baseline/
│   ├── schema.sql
│   └── seed.sql
├── legacy/
│   ├── schema.v2.sql
│   ├── schema.v2.1.sql
│   ├── ...
│   └── seed.v2.6.sql
├── snapshots/
│   └── current-schema.sql
└── README.md

backend/scripts/
├── load-db.js
└── verify-db.js
```

### Directory responsibilities

#### `database/baseline/`

Contains the final consolidated database files:

```text
schema.sql
seed.sql
```

These files will eventually become the normal way to create a new development database.

#### `database/legacy/`

Contains the historical versioned schema and seed files after the consolidated baseline has been tested successfully.

The existing files must not be moved into this directory yet because the current loader still depends on their present locations.

#### `database/snapshots/`

Contains generated database snapshots used for comparison and auditing.

The snapshot is not the authoritative source schema. It is a record of the known-good database state at the time of export.

#### `database/README.md`

Will contain database-specific setup, reset, seed, migration, and troubleshooting instructions for the project team.

#### `backend/scripts/load-db.js`

Will remain responsible for creating, resetting, and loading the project database.

During the transition, the loader should support both:

- The existing legacy file sequence
- The new consolidated baseline

#### `backend/scripts/verify-db.js`

Will verify that required tables, views, columns, and seeded records exist after loading the database.

---

## 4. Known-good starting point

**Date recorded:** 7 October 2026

The local database was reset using the existing project database loader.

After the reset:

- The homepage loaded successfully.
- Seeded homepage content appeared.
- The My Account navigation worked.
- The backend connected to PostgreSQL successfully.
- The frontend connected to the backend API successfully.
- The startup database verification no longer reported missing objects.
- The previous schema mismatch errors were resolved.
- Existing pages appeared to operate normally.

This reset database is the known-good reference for the consolidation process.

The currently working database must remain recoverable until the consolidated baseline passes equivalent testing.

---

## 5. Initial problems discovered

### 5.1 Missing frontend dependencies

The frontend initially failed to compile because the following packages were not installed:

```text
lucide-react
@icons-pack/react-simple-icons
```

The project dependencies were restored using npm.

### 5.2 Missing backend environment configuration

The backend initially produced the following PostgreSQL authentication error:

```text
SASL: SCRAM-SERVER-FIRST-MESSAGE:
client password must be a string
```

The issue occurred because the database password environment variable was unavailable.

A local `backend/.env` file was added with the required PostgreSQL connection variables.

### 5.3 Incorrect PostgreSQL port

The backend initially attempted to connect on port:

```text
5433
```

The local PostgreSQL server was found to be running on:

```text
5432
```

The `PGPORT` value in `backend/.env` was updated to `5432`.

### 5.4 Database schema mismatch

After the connection was corrected, the backend reported that required database objects were missing.

Examples included:

```text
locations
quote_requests
v_search_trends_daily
v_moderation_queue
vendor_opening_hours
events
saved_businesses
v_business_cards
vendor_facts
vendor_payment_methods
vendor_search_impressions
vendor_photos
vendor_social_links
reviews.review_reply
vendors.vendor_nid_reference
vendors.vendor_nid_status
vendors.vendor_nid_submitted_at
vendors.vendor_nid_verified_at
vendors.vendor_nid_verified_by
```

The homepage API also failed with:

```text
column p.category_name_bn does not exist
```

This confirmed that the local database structure did not match the current backend queries.

The issue was resolved by resetting the local development database using the existing loader.

---

## 6. Local PostgreSQL environment

The local development environment currently uses:

```text
PostgreSQL version: 15
PostgreSQL server version: 15.19
PostgreSQL port: 5432
PostgreSQL host: 127.0.0.1
Database name: shahebbazar
Database user: postgres
```

The PostgreSQL installation directory is:

```text
C:\Program Files\PostgreSQL\15
```

The PostgreSQL command-line tool directory is:

```text
C:\Program Files\PostgreSQL\15\bin
```

The local database credentials are stored in:

```text
backend/.env
```

The `.env` file must not be committed.

The repository `.gitignore` should include:

```gitignore
.env
backend/.env
```

---

## 7. PostgreSQL command-line tool discovery

PowerShell did not initially recognise the `pg_dump` command because the PostgreSQL `bin` directory was not included in the current PATH.

The PostgreSQL installation directory was identified using:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" -Directory
```

Result:

```text
C:\Program Files\PostgreSQL\15
```

The `pg_dump.exe` executable was located using:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" `
  -Filter pg_dump.exe `
  -Recurse
```

Two copies were found:

```text
C:\Program Files\PostgreSQL\15\bin\pg_dump.exe
C:\Program Files\PostgreSQL\15\pgAdmin 4\runtime\pg_dump.exe
```

The primary PostgreSQL installation copy was selected:

```text
C:\Program Files\PostgreSQL\15\bin\pg_dump.exe
```

No permanent PATH changes have been made.

---

## 8. Optional PostgreSQL PATH configuration

Adding PostgreSQL to PATH is optional.

Project scripts and documentation must not assume that all team members use PostgreSQL 15 or that PostgreSQL is installed in the same directory.

### 8.1 Temporary PATH configuration

For a PowerShell session using PostgreSQL 15:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\15\bin"
```

Verify the result:

```powershell
pg_dump --version
psql --version
```

This change applies only to the current PowerShell session.

### 8.2 Dynamic PowerShell PATH configuration

The following command attempts to find the newest PostgreSQL version installed under the standard Windows location:

```powershell
$pgBin = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1 |
  ForEach-Object {
    Join-Path $_.FullName "bin"
  }

$env:Path = "$pgBin;$env:Path"

pg_dump --version
```

This is a developer convenience only.

### 8.3 Portable alternative

Team members can avoid modifying PATH by running PostgreSQL tools with their full executable paths.

Example:

```powershell
& "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" --version
```

This is currently the preferred documented approach because it makes the selected PostgreSQL installation explicit.

---

## 9. Database snapshot

### 9.1 Snapshot directory

The snapshot directory was created from the repository root:

```powershell
New-Item -ItemType Directory -Force database\snapshots
```

Created directory:

```text
database/snapshots/
```

### 9.2 Schema snapshot command

The known-good local database schema was exported with:

```powershell
& "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" `
  -h 127.0.0.1 `
  -p 5432 `
  -U postgres `
  -d shahebbazar `
  --schema-only `
  --no-owner `
  --no-privileges `
  -f "database\snapshots\current-schema.sql"
```

The command produced:

```text
database/snapshots/current-schema.sql
```

### 9.3 Snapshot verification

The generated file was checked with:

```powershell
Get-Item database\snapshots\current-schema.sql |
  Select-Object FullName, Length, LastWriteTime
```

Recorded result:

```text
Full path:
C:\Users\arifa\Desktop\COS40005shahebBazar\
shahebbazar-web\database\snapshots\current-schema.sql

File size:
67,230 bytes

Generated:
7 October 2026 at 5:53:48 PM
```

The beginning of the snapshot was inspected with:

```powershell
Get-Content database\snapshots\current-schema.sql -TotalCount 20
```

The snapshot reports:

```text
Dumped from database version 15.19
Dumped by pg_dump version 15.19
Client encoding: UTF8
```

The file begins with PostgreSQL dump settings:

```sql
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
```

The snapshot also includes a generated `\restrict` command near the beginning.

The snapshot has not been manually edited.

### 9.4 Snapshot status

**Status:** Completed

The snapshot currently represents the known-good schema produced by the existing versioned loading sequence.

It is an audit and comparison reference.

It is not yet the final consolidated baseline schema.

---

## 10. Snapshot secret check

Before committing generated database files, search for accidental secrets:

```powershell
Select-String `
  -Path database\snapshots\current-schema.sql `
  -Pattern "password|PGPASSWORD|ANALYTICS_SALT" `
  -CaseSensitive:$false
```

Any matches must be reviewed before committing.

The snapshot must not contain:

- Actual PostgreSQL passwords
- Environment variable values
- API secrets
- Analytics salts
- Genuine NID values
- Production credentials

Schema definitions containing column names such as `user_password_hash` are expected and are not automatically secrets.

---

## 11. Current schema-loading sequence

The current loader applies the database files in the following order:

```text
schema.v2.sql
schema.v2.1.sql
seed.v2.sql
seed.v2.1.sql
schema.v2.2.sql
seed.v2.2.sql
schema.v2.3.sql
seed.v2.3.sql
schema.v2.4.sql
seed.v2.4.sql
schema.v2.5.sql
schema.v2.6.sql
seed.v2.6.sql
schema.v2.7.sql
```

Schema and seed operations are interleaved.

This is significant because later schema files may contain data transformations that rely on records inserted by earlier seed files.

For example:

1. Earlier seed files create vendors with cover images.
2. A later schema version creates `vendor_photos`.
3. The later schema version copies existing vendor cover images into `vendor_photos`.

The consolidated database must reproduce the final state explicitly.

The project must not generate the baseline by simply:

1. Concatenating every schema file.
2. Concatenating every seed file.
3. Running all schemas before all seeds.

That approach could lose data created by migration-time backfills.

---

## 12. Confirmed Phase 1 database decisions

### 12.1 User roles

The database supports these roles:

```text
customer
vendor
admin
```

These values must remain unchanged during the first consolidation pass.

### 12.2 Phone authentication

Phone numbers remain the primary account identifiers.

Live OTP and SMS delivery are deferred for Phase 1.

The database may retain OTP and session structures, but the baseline must not require integration with a live SMS provider.

### 12.3 NID verification

The NID verification workflow is currently mock-stubbed.

The following behaviour must remain:

```text
vendor_nid_status default: pending
```

The first consolidation pass must not introduce a `not_submitted` status.

Existing status values must remain:

```text
pending
verified
rejected
```

### 12.4 Payments

Phase 1 supports:

- RFQ submissions
- Quote responses
- Offline payment terms
- Cash payments
- Cash on delivery
- Declared vendor payment methods

Automated payment gateway checkout is not part of the current consolidation.

### 12.5 Messaging and notifications

Phase 1 retains:

- Buyer-to-vendor conversations
- Messages
- In-app notifications
- Notification queue structures

Live SMS and email delivery integrations must not block the baseline.

### 12.6 Reviews and social features

The baseline must retain:

- Reviews
- Ratings
- Review replies
- Vendor social links
- Saved businesses
- Vendor photos
- Listing photos

---

## 13. Phase 1 database features to retain

The consolidated baseline must preserve support for:

- Customers
- Vendors
- Administrators
- User sessions
- OTP records
- Phone verification state
- Mock NID verification
- Business profiles
- Business ownership
- Categories
- Category hierarchy
- Locations
- Location hierarchy
- Product and service listings
- Listing prices
- Minimum order quantities
- Listing photos
- Vendor photos
- Vendor opening hours
- Vendor facts
- Vendor payment methods
- Vendor social links
- Business reviews
- Review replies
- Saved businesses
- Conversations
- Messages
- Notifications
- RFQ requests
- Quote responses
- Events
- Moderation reports
- Search logs
- Vendor profile views
- Vendor search impressions
- Audit logs
- Administrative views
- Public business-card views

---

## 14. Consolidation rules

The first baseline implementation must not change:

- Existing table names
- Existing column names
- Existing primary keys
- Existing foreign-key relationships
- Existing view names
- Existing role values
- Existing status values
- Existing seed phone numbers
- Existing seed email addresses
- Existing vendor slugs
- Existing listing slugs
- Existing event slugs
- Existing RFQ public references
- Existing route queries
- Existing API response structures
- Authentication behaviour
- RBAC behaviour
- NID stub behaviour
- OTP stub behaviour
- Existing frontend asset paths

The first baseline is an organisational change, not a redesign.

Potential integrity improvements must be recorded separately and implemented only after the consolidated baseline is proven equivalent to the legacy build.

---

## 15. Baseline schema requirements

The consolidated schema will be created at:

```text
database/baseline/schema.sql
```

The consolidated schema must describe the final database state directly.

Historical patterns such as the following should not remain where they can be represented directly in the final table definition:

```sql
CREATE TABLE vendors (...);

ALTER TABLE vendors
ADD COLUMN vendor_website VARCHAR(255);

ALTER TABLE vendors
ADD COLUMN vendor_nid_reference VARCHAR(50);
```

Instead, the consolidated baseline should define all final columns in the original `CREATE TABLE` statement.

The final baseline schema must include:

- All tables
- All columns
- All primary keys
- All foreign keys
- All unique constraints
- All check constraints
- All indexes
- All partial indexes
- All views
- Required PostgreSQL extensions
- Comments that remain relevant to the final schema

The consolidated baseline should avoid unnecessary historical operations such as:

```sql
ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...
```

These statements may remain only if there is a clear final-state reason for them.

---

## 16. Baseline seed requirements

The consolidated seed will be created at:

```text
database/baseline/seed.sql
```

The seed must target an empty database created from the consolidated baseline schema.

The seed must be arranged in dependency order.

Recommended order:

```text
1. Locations
2. Categories
3. Users
4. Vendors
5. Vendor categories
6. Vendor facts
7. Vendor payment methods
8. Vendor social links
9. Vendor opening hours
10. Vendor photos
11. Listings
12. Listing photos
13. Events
14. Reviews
15. Quote requests
16. Quote responses
17. Conversations
18. Messages
19. Saved businesses
20. Notifications
21. Reports
22. Search logs
23. Vendor profile views
24. Vendor search impressions
```

The consolidated seed must explicitly include final data that was previously generated through migration-time backfills.

For example, vendor photo rows must be inserted explicitly rather than depending on an earlier cover-image migration.

---

## 17. Legacy file policy

The existing schema and seed files must remain in their current location until the baseline has passed verification.

Files must not be moved to `database/legacy/` until:

1. The legacy loader still builds successfully.
2. The consolidated schema builds successfully.
3. The consolidated seed loads successfully.
4. Database verification passes.
5. Record counts have been compared.
6. Current frontend pages have been tested.
7. Current API routes have been tested.
8. Authentication and account pages still operate.
9. The team has reviewed the consolidation.

After verification, the historical files may be moved into:

```text
database/legacy/
```

The legacy files should remain available for audit history during the project.

---

## 18. Transitional loader strategy

The current loader should not be replaced immediately.

A transitional approach should support two loading modes.

### Legacy mode

Uses the current versioned file order.

Example:

```powershell
npm run db:reset
```

### Baseline test mode

Uses only:

```text
database/baseline/schema.sql
database/baseline/seed.sql
```

Suggested direct command:

```powershell
node backend/scripts/load-db.js --reset --yes --baseline
```

The final command and package script names must be confirmed after implementation.

The baseline mode must be tested on a disposable local database before replacing the existing default process.

---

## 19. Verification requirements

The consolidated baseline is considered successful only when it produces a database equivalent to the known-good legacy build.

At minimum, compare the following counts:

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM vendors;
SELECT COUNT(*) FROM locations;
SELECT COUNT(*) FROM categories;
SELECT COUNT(*) FROM vendor_categories;
SELECT COUNT(*) FROM vendor_listings;
SELECT COUNT(*) FROM listing_photos;
SELECT COUNT(*) FROM vendor_photos;
SELECT COUNT(*) FROM vendor_social_links;
SELECT COUNT(*) FROM vendor_payment_methods;
SELECT COUNT(*) FROM vendor_opening_hours;
SELECT COUNT(*) FROM vendor_facts;
SELECT COUNT(*) FROM events;
SELECT COUNT(*) FROM reviews;
SELECT COUNT(*) FROM quote_requests;
SELECT COUNT(*) FROM quote_responses;
SELECT COUNT(*) FROM conversations;
SELECT COUNT(*) FROM messages;
SELECT COUNT(*) FROM saved_businesses;
SELECT COUNT(*) FROM notifications;
SELECT COUNT(*) FROM reports;
SELECT COUNT(*) FROM search_logs;
SELECT COUNT(*) FROM vendor_profile_views;
SELECT COUNT(*) FROM vendor_search_impressions;
SELECT COUNT(*) FROM v_business_cards;
SELECT COUNT(*) FROM v_moderation_queue;
```

Equivalent counts alone are not sufficient. Important records and relationships must also be checked.

---

## 20. Application flows to verify

After the consolidated database loads, manually test:

- Homepage
- Homepage categories
- Homepage featured businesses
- Homepage events
- Business search
- Category search
- Business profile
- Business listings
- Business photos
- Opening hours
- Reviews
- Review replies
- Social links
- Saved businesses
- My Account
- Customer profile
- Vendor profile
- Vendor dashboard
- Admin dashboard
- Admin moderation
- Messaging
- Notifications
- RFQ creation
- Quote responses
- Mock OTP state
- Mock NID verification state
- Analytics charts
- Search trends
- Vendor profile-view history
- Search impressions

The backend must also start without reporting missing database objects.

---

## 21. Current audit status

### Completed

- Restored missing frontend dependencies.
- Added a working backend `.env`.
- Confirmed that PostgreSQL credentials load correctly.
- Identified that PostgreSQL runs on port 5432.
- Corrected the backend PostgreSQL port configuration.
- Confirmed the backend connects to PostgreSQL.
- Identified the previous database schema mismatch.
- Reset the local database using the current loader.
- Confirmed the homepage loads.
- Confirmed seeded homepage content appears.
- Confirmed My Account loads.
- Confirmed startup verification passes.
- Located PostgreSQL 15 command-line tools.
- Created `database/snapshots/`.
- Exported `database/snapshots/current-schema.sql`.
- Verified the schema snapshot exists.
- Verified the schema snapshot has a non-zero file size.
- Confirmed PostgreSQL server version 15.19.
- Confirmed `pg_dump` version 15.19.
- Began documenting the database audit.

### Not yet completed

- Snapshot secret scan
- Creation of `database/baseline/`
- Creation of `database/legacy/`
- Consolidated `schema.sql`
- Consolidated `seed.sql`
- Baseline loader mode
- Database verification script
- Legacy and baseline count comparison
- Application testing against the baseline
- Moving historical files into `database/legacy/`
- Database-specific `README.md`
- Team review of the consolidated database

---

## 22. Next steps

### Step 1: Scan the snapshot for secrets

Run:

```powershell
Select-String `
  -Path database\snapshots\current-schema.sql `
  -Pattern "password|PGPASSWORD|ANALYTICS_SALT" `
  -CaseSensitive:$false
```

Review all matches before committing the snapshot.

### Step 2: Create baseline directories

Run:

```powershell
New-Item -ItemType Directory -Force database\baseline
New-Item -ItemType Directory -Force database\legacy
```

Do not move existing SQL files yet.

### Step 3: Commit the audit checkpoint

Run:

```powershell
git status
```

Review all changed and untracked files.

Then stage the audit files:

```powershell
git add database-audit.md
git add database/snapshots/current-schema.sql
```

Commit:

```powershell
git commit -m "Document database audit and capture working schema"
```

If unrelated files appear in `git status`, they should be reviewed separately before staging.

### Step 4: Construct the first baseline schema

Create:

```text
database/baseline/schema.sql
```

The initial baseline schema should be built from:

- The historical schema files
- The known-good schema snapshot
- The final expected application structure

The snapshot should be used for comparison, not copied blindly as the maintained baseline.

### Step 5: Construct the first baseline seed

Create:

```text
database/baseline/seed.sql
```

The seed must reproduce the final known-good sample data on an empty baseline database.

### Step 6: Add baseline test mode

Update the loader so the existing legacy mode remains available while the baseline is tested independently.

### Step 7: Compare and verify

Create disposable databases for legacy and baseline comparison.

Suggested names:

```text
shahebbazar_legacy_test
shahebbazar_baseline_test
```

The exact process will be documented before these test databases are created.

---

## 23. Progress log

### 7 October 2026

#### Environment and dependency work

- Restored missing frontend dependencies.
- Added the required local backend environment configuration.
- Confirmed that live secrets remain outside the repository.
- Corrected the configured PostgreSQL port from 5433 to 5432.

#### Database recovery

- Connected the backend to the local PostgreSQL service.
- Identified missing tables, views, and columns.
- Confirmed that the local database was out of sync with the current code.
- Reset the local database using the existing loader.
- Confirmed that the reset restored the application to a working state.

#### Application verification

- Confirmed that the homepage loads.
- Confirmed that seeded homepage content appears.
- Confirmed that My Account loads.
- Confirmed that startup schema verification passes.
- Confirmed that the previous homepage API error no longer occurs.

#### Snapshot work

- Located PostgreSQL 15 under:

```text
C:\Program Files\PostgreSQL\15
```

- Located the primary dump executable at:

```text
C:\Program Files\PostgreSQL\15\bin\pg_dump.exe
```

- Created:

```text
database/snapshots/
```

- Exported:

```text
database/snapshots/current-schema.sql
```

- Confirmed a snapshot size of:

```text
67,230 bytes
```

- Confirmed the snapshot was generated from PostgreSQL 15.19 using `pg_dump` 15.19.

#### Documentation

- Created and expanded `database-audit.md`.
- Recorded the known-good starting point.
- Recorded the current loader sequence.
- Recorded Phase 1 constraints.
- Recorded the planned baseline and legacy structure.
- Recorded remaining audit work.

---

## 24. Team maintenance rules

Every team member working on the database should:

1. Read this document before modifying database files.
2. Update the progress log after meaningful database work.
3. Record commands used for schema or seed changes.
4. Record the result of database reset tests.
5. Avoid committing local credentials.
6. Avoid modifying an old schema version after it has been shared.
7. Avoid moving legacy files until the baseline is verified.
8. Keep database changes separate from unrelated frontend work where practical.
9. Note any route, service, or frontend component affected by a schema change.
10. Confirm that `npm run db:reset` still works before merging database changes.

---

## 25. Current conclusion

The existing database can currently be recreated successfully using the historical versioned schema and seed sequence.

The current database is functional, but its setup is difficult to understand and maintain because database changes are distributed across multiple interleaved files.

The audit has established a known-good database state and captured its schema.

The next objective is to produce:

```text
database/baseline/schema.sql
database/baseline/seed.sql
```

These files must recreate the same working development database before the existing versioned files are archived or the default loader is changed.

## 26. Consolidation implementation update

### 7 October 2026

- Created a baseline schema from the known-good PostgreSQL schema snapshot.
- Removed only the `psql`-specific `\restrict` and `\unrestrict` guard commands from the maintained baseline.
- Created a consolidated development seed and added the historical vendor-cover to vendor-photo backfill explicitly.
- Added a safe baseline loader mode that defaults to a disposable `_baseline_test` database.
- Preserved the legacy versioned loading sequence as the loader default.
- Added automated checks for required tables, views, columns, role coverage and public business-card data.
- Normalised generated files to UTF-8 without a byte-order mark.

Status: the patch has passed static file, encoding and JavaScript syntax checks. It still requires execution against the local PostgreSQL 15 development server before merge.


## 27. Baseline Website Smoke Test

### 7 October 2026

The website was tested against the consolidated baseline database:

```text
shahebbazar_baseline_test
```

The backend environment was temporarily configured with:

```env
PGDATABASE=shahebbazar_baseline_test
```

The consolidated database loaded successfully before testing.

### Database validation

- Baseline schema encoding: PASS
- Baseline seed encoding: PASS
- Schema load: PASS
- Seed load: PASS
- Automated database verification: PASS
- Required tables and views: PASS
- Required review-reply columns: PASS
- Required NID stub columns: PASS
- Customer, vendor, and admin role coverage: PASS
- Public business-card data: PASS

### Baseline data summary

```text
Businesses:       13
Listings:         40
Categories:       42
Events:            4
Moderation queue:  3
```

### Application smoke-test results

- API startup verification: PASS
- `/api/home`: PASS
- English homepage: PASS
- Bangla homepage: PASS
- English text rendering: PASS
- Bangla browser rendering: PASS
- Featured businesses: PASS
- Business search: PASS
- Category browsing: PASS
- Business profile pages: PASS
- Business listings: PASS
- Business images and photos: PASS
- My Account page: PASS
- Events: PASS
- Reviews and ratings: PASS
- Review replies: PASS
- Saved businesses: NOT TESTED
- Messaging: NOT TESTED
- Vendor dashboard: NOT TESTED
- Admin moderation: NOT TESTED
- NID stub workflow: NOT TESTED
- Social links: NOT IMPLEMENTED

### Search testing

Business search was tested against the consolidated baseline.

Results:

- Search page loaded successfully.
- Search requests completed without HTTP 500 errors.
- Search results were returned from the baseline database.
- Category-based discovery operated correctly.
- No missing table, view, or column errors were observed.

Status: PASS

### Account-page testing

The My Account page was tested against the consolidated baseline.

Results:

- The account page loaded successfully.
- The account page did not produce a database error.
- No missing authentication or session database objects were reported.
- No HTTP 500 error was observed.

Status: PASS

### Business-page testing

Business profile pages were tested against the consolidated baseline.

Results:

- Business profiles loaded successfully.
- Business details were returned correctly.
- Listings appeared correctly.
- Business images and photos appeared correctly.
- Reviews and ratings appeared correctly.
- Review replies appeared correctly.
- English content rendered correctly.
- Bangla content rendered correctly.
- No missing business-related database objects were reported.

Status: PASS

### Category testing

Category browsing was tested against the consolidated baseline.

Results:

- Categories loaded successfully.
- Category names appeared in English.
- Category names appeared in Bangla.
- Category navigation operated successfully.
- No missing category columns or relations were reported.

Status: PASS

### Event testing

Events were tested against the consolidated baseline.

Results:

- Event data loaded successfully.
- Four seeded events were available.
- Event content rendered without database errors.
- No missing event table or column errors were reported.

Status: PASS

### Social links

Vendor social links remain represented in the database schema through:

```text
vendor_social_links
```

The current website does not yet implement the social-link user interface.

Status: NOT IMPLEMENTED

This result is not considered a baseline database failure. Social-link functionality should be tested after the relevant frontend or profile-page implementation is completed.

### Language rendering note

The Windows PowerShell terminal displayed Bengali database values incorrectly because of terminal rendering or decoding behaviour.

The website browser rendered the Bangla interface and Bengali database content correctly.

The successful browser result confirms that the consolidated database content is usable by the application.

### Console result

During the website smoke test:

- No required-database-object warning appeared.
- No missing table error appeared.
- No missing view error appeared.
- No missing column error appeared.
- No database connection error appeared.
- No homepage HTTP 500 error appeared.
- No account-page HTTP 500 error appeared.
- No business-page HTTP 500 error appeared.

### Current consolidation status

The first database consolidation pass is operational.

The consolidated files:

```text
database/baseline/schema.sql
database/baseline/seed.sql
```

can successfully:

1. Create the disposable baseline database.
2. Populate the baseline database.
3. Pass automated database verification.
4. Support the English website.
5. Support the Bangla website.
6. Support search.
7. Support account-page access.
8. Support business-profile pages.
9. Support category browsing.
10. Support event content.

The original development database remains available separately as:

```text
shahebbazar
```

The consolidated trial database remains available as:

```text
shahebbazar_baseline_test
```

### Remaining consolidation work

Before making the consolidated baseline the default database-loading method:

- Restore and retest the original `shahebbazar` database connection.
- Build a separate `shahebbazar_legacy_test` database.
- Run automated verification against the legacy test database.
- Compare baseline and legacy record counts.
- Test saved businesses.
- Test messaging when the relevant authentication flow is available.
- Test the vendor dashboard.
- Test admin moderation.
- Test the mock NID workflow.
- Implement and test vendor social links.
- Review the consolidation with the project team.
- Keep the original versioned SQL files until team review is complete.

### Baseline smoke-test conclusion

The consolidated baseline passed the current database and application smoke tests.

No schema incompatibility was identified during the tested English and Bangla website flows.

The baseline is suitable for continued comparison testing and development, but the original historical SQL files should remain available until the legacy comparison and team review are complete.

## 28. Legacy and Baseline Comparison

### 7 October 2026

A separate legacy test database was created to compare the historical versioned loading process with the new consolidated baseline.

The databases used were:

```text
shahebbazar_legacy_test
shahebbazar_baseline_test
```

The normal development database remained:

```text
shahebbazar
```

### Legacy build result

The legacy database was rebuilt using the historical schema and seed sequence:

```text
schema.v2.sql
schema.v2.1.sql
seed.v2.sql
seed.v2.1.sql
schema.v2.2.sql
seed.v2.2.sql
schema.v2.3.sql
seed.v2.3.sql
schema.v2.4.sql
seed.v2.4.sql
schema.v2.5.sql
schema.v2.6.sql
seed.v2.6.sql
schema.v2.7.sql
```

Result:

- Legacy database creation: PASS
- Historical schema loading: PASS
- Historical seed loading: PASS
- Legacy loader summary: PASS
- Legacy automated verification: PASS
- Database errors: NONE

The legacy loader completed with:

```text
Businesses:       13
Listings:         40
Categories:       42
Events:            4
Moderation queue:  3
```

### Baseline build result

The consolidated database was rebuilt using:

```text
database/baseline/schema.sql
database/baseline/seed.sql
```

Result:

- Baseline database creation: PASS
- Consolidated schema loading: PASS
- Consolidated seed loading: PASS
- Baseline loader summary: PASS
- Baseline automated verification: PASS
- Database errors: NONE

The baseline loader completed with:

```text
Businesses:       13
Listings:         40
Categories:       42
Events:            4
Moderation queue:  3
```

### Core record-count comparison

The following core records were compared directly between the legacy and baseline databases.

| Item | Legacy | Baseline | Result |
|---|---:|---:|---|
| Business cards | 13 | 13 | MATCH |
| Categories | 42 | 42 | MATCH |
| Events | 4 | 4 | MATCH |
| Listings | 40 | 40 | MATCH |
| Moderation queue | 3 | 3 | MATCH |
| Users | 56 | 56 | MATCH |
| Vendor photos | 5 | 5 | MATCH |
| Vendors | 15 | 15 | MATCH |

Overall core record comparison:

```text
PASS
```

No count differences were identified across the eight compared database objects.

### Automated verification comparison

Automated verification was run against both test databases.

Results:

```text
shahebbazar_baseline_test: PASS
shahebbazar_legacy_test:   PASS
```

The verification covered:

- Required tables
- Required views
- Required review-reply columns
- Required vendor NID stub columns
- Customer role coverage
- Vendor role coverage
- Administrator role coverage
- Approved public business-card data

### Application verification

The website was tested against the consolidated baseline database.

Results:

- API startup verification: PASS
- English homepage: PASS
- Bangla homepage: PASS
- English browser rendering: PASS
- Bangla browser rendering: PASS
- Featured businesses: PASS
- Search: PASS
- Account page: PASS
- Business pages: PASS
- Business listings: PASS
- Business images and photos: PASS
- Categories: PASS
- Events: PASS
- Reviews and ratings: PASS
- Review replies: PASS
- Social-link database structure: PRESENT
- Social-link user interface: NOT IMPLEMENTED

Social links were not treated as a migration failure because the database table is present but the associated website interface has not yet been implemented.

### Search-path correction

During the first baseline trial, the schema loaded successfully but the seed could not resolve the `locations` relation.

The known-good schema snapshot clears the PostgreSQL session search path. The consolidated seed uses unqualified table names.

The following statement was added before the first seed transaction:

```sql
SET search_path TO public, pg_catalog;
```

After this correction:

- The baseline schema loaded successfully.
- The baseline seed loaded successfully.
- Automated verification passed.
- The website operated successfully against the baseline database.

### Comparison conclusion

The consolidated baseline reproduces the tested core structure and sample data of the historical loading sequence.

The following checks all passed:

1. Baseline database creation
2. Legacy database creation
3. Baseline schema loading
4. Baseline seed loading
5. Historical schema and seed loading
6. Baseline automated verification
7. Legacy automated verification
8. Core record-count comparison
9. English website smoke testing
10. Bangla website smoke testing
11. Search testing
12. Account-page testing
13. Business-page testing
14. Category testing
15. Event testing

No core schema or seeded-record regression was identified during the comparison.

### Migration status

The first database consolidation pass is complete and ready for Git review.

The consolidated baseline is suitable for team review and continued development.

The original versioned SQL files should remain available until the team approves the final cutover and confirms whether legacy loading support should be retained.

The normal development database remains:

```text
shahebbazar
```

The disposable comparison databases are:

```text
shahebbazar_baseline_test
shahebbazar_legacy_test
```

## Baseline cut-over (16 October 2026)

The team approved the consolidated baseline as the only way to build the database.

- `npm run db:load` and `npm run db:reset` now load only `database/baseline/schema.sql` and `database/baseline/seed.sql`. The `--baseline` flag, the legacy loading sequence and the `_test` database-name restriction were removed.
- `db:load` refuses to load into a database that already has tables; `db:reset` rebuilds it.
- After loading, the loader copies `database/seed-assets/` into the upload folder and runs `database/checks/verify-baseline.sql`. The same check is available as `npm run db:verify`.
- The duplicate `schema.v2*.sql` and `seed.v2*.sql` files in `database/` were removed; identical copies remain in `database/legacy/`. The original `schema.sql`, `sampleinput.sql` and `SCHEMA-NOTES.md` were moved to `database/legacy/`.
- `backend/lib/verifySchema.js` and `database/checks/verify-baseline.sql` now cover all 27 tables and 4 views.
- Seed images are still outstanding. The seed referenced five `uploads/1788…jpg` files that were personal test uploads, rightly removed from Git in commit `25d1e11`. Those references (10 listing photos and 5 business covers) were removed from `baseline/seed.sql` so pages show placeholders instead of broken images. Suitable development images need choosing and adding to `database/seed-assets/`; see `database/README.md`.
- Verified on a disposable database: load, refusal to reload, `db:verify`, reset and the API startup schema check all passed. The regenerated schema snapshot differs from the previous one only in how PostgreSQL prints `CHECK` constraints.
