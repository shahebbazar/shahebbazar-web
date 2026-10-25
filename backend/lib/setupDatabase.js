// Sets up the database from the API itself, for servers where nobody can run commands inside the
// containers (the client's server, docs/DEPLOY-CLIENT.md). Turned on with DB_AUTO_SETUP=true; off by
// default, so local development and the test server are unchanged.
//
// - An empty database gets the baseline schema and seed (database/baseline), and the seed photos are
//   copied into the upload folder, as `npm run db:load` does. The current migration files are recorded
//   as applied, because the baseline already includes them.
// - Every start then applies migration files not yet recorded, in name order, and records each one.
//   Migrations are written to be safe to run more than once, so a database loaded before this
//   record existed simply runs them once more.
//
// Recorded in schema_migrations. An advisory lock stops two starts setting up at the same time.

const fs = require("fs");
const path = require("path");

const DATABASE_DIR = path.join(__dirname, "..", "..", "database");
const BASELINE_FILES = ["baseline/schema.sql", "baseline/seed.sql"];
const MIGRATIONS_DIR = path.join(DATABASE_DIR, "migrations");
const SEED_ASSETS_DIR = path.join(DATABASE_DIR, "seed-assets");
const LOCK_ID = 4_2026_1025; // any fixed number; only this setup uses it

const readSql = (file) => fs.readFileSync(file, "utf8").replace(/^﻿/, "");

function migrationFiles(dir = MIGRATIONS_DIR) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
}

/** Copies seed images into the upload folder, leaving any file that already exists untouched. */
function copySeedAssets(uploadDir) {
    if (!fs.existsSync(SEED_ASSETS_DIR)) return 0;
    fs.mkdirSync(uploadDir, { recursive: true });
    let copied = 0;
    for (const name of fs.readdirSync(SEED_ASSETS_DIR)) {
        const target = path.join(uploadDir, name);
        if (fs.existsSync(target)) continue;
        fs.copyFileSync(path.join(SEED_ASSETS_DIR, name), target);
        copied += 1;
    }
    return copied;
}

async function ensureMigrationTable(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
        migration_file text PRIMARY KEY,
        migration_applied_at timestamptz NOT NULL DEFAULT now()
    )`);
}

/** Records every current migration file as applied: a freshly loaded baseline already includes them. */
async function recordBaselineMigrations(client, dir = MIGRATIONS_DIR) {
    await ensureMigrationTable(client);
    for (const file of migrationFiles(dir)) {
        await client.query("INSERT INTO public.schema_migrations (migration_file) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
    }
}

/**
 * Loads an empty database and applies new migrations. `client` is a connected pg client.
 * Returns what it did: { loaded, applied: [file names] }.
 */
async function setupDatabase(client, { uploadDir, migrationsDir = MIGRATIONS_DIR, log = console.log } = {}) {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    try {
        let loaded = false;
        const empty = (await client.query("SELECT to_regclass('public.users') IS NULL AS empty")).rows[0].empty;
        if (empty) {
            for (const file of BASELINE_FILES) {
                await client.query(readSql(path.join(DATABASE_DIR, file)));
                log(`Database setup: applied ${file}`);
            }
            await recordBaselineMigrations(client, migrationsDir);
            if (uploadDir) log(`Database setup: copied ${copySeedAssets(uploadDir)} seed images`);
            loaded = true;
        }

        await ensureMigrationTable(client);
        const done = new Set((await client.query("SELECT migration_file FROM public.schema_migrations")).rows.map((r) => r.migration_file));
        const applied = [];
        for (const file of migrationFiles(migrationsDir)) {
            if (done.has(file)) continue;
            await client.query(readSql(path.join(migrationsDir, file)));
            await client.query("INSERT INTO public.schema_migrations (migration_file) VALUES ($1)", [file]);
            log(`Database setup: applied migration ${file}`);
            applied.push(file);
        }
        return { loaded, applied };
    } catch (err) {
        // A failed file can leave its own transaction open; close it so the lock can be released.
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    }
}

module.exports = { setupDatabase, recordBaselineMigrations, copySeedAssets, BASELINE_FILES, DATABASE_DIR };
