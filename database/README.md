# Database

PostgreSQL schema and sample data for Shahebbazar. The database is built from
one consolidated baseline; nothing else is loaded.

## Folders

| Path | Purpose |
| --- | --- |
| `baseline/schema.sql` | The complete schema: every table, view, index and constraint. The single source of truth. |
| `baseline/seed.sql` | Sample data for development and demonstrations: locations, categories, businesses, listings, accounts, reviews and events. |
| `baseline/reference.sql` | The live site's data instead of `seed.sql` (`DB_SEED=reference`, docs/DEPLOY-CLIENT.md): locations, categories, marketing passes and approval settings only. A new category or location goes in both files; `backend/test/referenceSeed.test.js` checks they agree. |
| `seed-assets/` | Images the seed references as `uploads/<file>`. `db:load` copies them into the upload folder. |
| `migrations/` | Numbered changes for databases that already exist, e.g. `001_marketing_passes.sql`. Each is also in the baseline, so a fresh load does not need them. |
| `checks/verify-baseline.sql` | Returns a row for every missing table, view, column or required sample data. No rows means the database is complete. |
| `snapshots/current-schema.sql` | A `pg_dump --schema-only` of a freshly loaded database, for reviewing schema differences. |
| `legacy/` | The historical versioned files (`schema.v2*.sql`, `seed.v2*.sql`), the original `schema.sql` and `sampleinput.sql`, and the v2 design notes in `SCHEMA-NOTES.md`. Kept for reference only; never loaded. |

## Commands

Run these from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run db:load` | Creates the database if needed, loads `baseline/schema.sql` then `baseline/seed.sql`, copies the seed images and runs the verification check. Refuses to load into a database that already has tables. |
| `npm run db:reset` | Drops and rebuilds the database after confirmation. Add `-- --yes` to skip the prompt. |
| `npm run db:verify` | Runs `checks/verify-baseline.sql` against the configured database. |
| `npm run docs:erd` | Regenerates the ER diagrams in `docs/erd/` from the live database. |

Both loader commands accept `--database=<name>` to target a different database,
for example a disposable copy for testing.

## Seed images

The seed stores photo paths such as `uploads/<file>.jpg`. Seed images belong in
`seed-assets/` under the same names; `db:load` copies them into
`backend/uploads/` (or `UPLOAD_DIR` when set), skipping any file that already
exists. Runtime uploads in `backend/uploads/` are not tracked in Git.

Seed images are for development and demonstrations only, so licensing is not a
concern, but each one must suit the business or listing it illustrates.

> **Seed photos (development placeholders).** `seed-assets/` holds stock photos that
> `db:load` copies into the upload folder; quality and licensing don't matter.
> - **Businesses** (`seed-business-<slug>.jpg`) are each business's first photo and cover. To add
>   one, save the file and add the slug to the "Business photos" list in `baseline/seed.sql`.
>   Still without one: `shaheb-bazar-cloth-store` (pending).
> - **Logos** (`seed-logo-<slug>.jpg`) are a business's logo. To add one, save the file and add the
>   slug to the "Business logos" list in `baseline/seed.sql`. Only `rajshahi-mango-traders` (the demo
>   business owner, 01711-000005) has one so far.
> - **Listings** (`seed-listing-*.jpg`) are each listing's main photo, mapped in the "Listing
>   photos" block at the end of `baseline/seed.sql`; one file can serve several listings. Eight
>   listings have one so far.
>
> Run `npm run db:reset` after adding photos.

## Changing the schema

A schema change is made in two places in the same pull request:

1. A numbered file in `migrations/` that brings an existing database up to date.
   Write it so it is safe to run twice (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
2. The same objects in `baseline/schema.sql` (and `baseline/seed.sql` for sample
   data), so a fresh `npm run db:load` matches a migrated database.

Then add any new table or view to `checks/verify-baseline.sql` and
`backend/lib/verifySchema.js`.

Until the migration runner exists (KAN-279), apply a migration to your own
database with `psql -d shahebbazar -f database/migrations/<file>.sql`, or rebuild
with `npm run db:reset` (which loses local test data).

| Migration | Adds |
| --- | --- |
| `001_marketing_passes.sql` | Marketing passes (KAN-283): `marketing_packages`, `vendor_marketing_subscriptions`, `marketing_usage_events`, the three passes, a pass for each business that was already featured, and sponsored placement that ends with `vendor_featured_until`. |

Conventions:

- Table names are plural `snake_case`; columns are table-prefixed
  (`vendor_name`, `listing_title`); foreign keys are `<table>_id`.
- Status columns use `CHECK` constraints rather than `ENUM` types, so adding a
  value is a one-line change.
- Every foreign key declares its `ON DELETE` behaviour.

Once the site is deployed, changes to a live database will be made with
numbered migration files that are applied once each, with the baseline updated
in the same pull request so new and existing databases stay identical.
