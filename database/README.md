# Database

PostgreSQL schema and sample data for Shahebbazar. The database is built from
one consolidated baseline; nothing else is loaded.

## Folders

| Path | Purpose |
| --- | --- |
| `baseline/schema.sql` | The complete schema: every table, view, index and constraint. The single source of truth. |
| `baseline/seed.sql` | Sample data for development and demonstrations: locations, categories, businesses, listings, accounts, reviews and events. |
| `seed-assets/` | Images the seed references as `uploads/<file>`. `db:load` copies them into the upload folder. |
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

> **Known gap (to revisit):** `seed-assets/` does not exist yet. The five
> listing photos and five business covers in `baseline/seed.sql` still point at
> `uploads/1788…jpg` files that were personal test uploads and were removed
> from the repository, so those seeded records show broken images. To fix:
> choose suitable photos for `katan-silk-saree`, `jute-shopping-bag`,
> `khirsapat-mango`, `ms-grill-fabrication`, `puthia-temple-day-tour` and the
> covers of `rajshahi-medical-centre`, `padma-view-restaurant`,
> `grand-river-view-hotel`, `rajshahi-craft-outlet` and `digitax-accounting`;
> add them to `seed-assets/` with descriptive names; and update the paths in
> `baseline/seed.sql`.

## Changing the schema

Until the migration process is in place, a schema change is made by editing
`baseline/schema.sql` (and `baseline/seed.sql` if sample data is affected),
adding any new object to `checks/verify-baseline.sql` and
`backend/lib/verifySchema.js`, and rebuilding with `npm run db:reset`.

Conventions:

- Table names are plural `snake_case`; columns are table-prefixed
  (`vendor_name`, `listing_title`); foreign keys are `<table>_id`.
- Status columns use `CHECK` constraints rather than `ENUM` types, so adding a
  value is a one-line change.
- Every foreign key declares its `ON DELETE` behaviour.

Once the site is deployed, changes to a live database will be made with
numbered migration files that are applied once each, with the baseline updated
in the same pull request so new and existing databases stay identical.
