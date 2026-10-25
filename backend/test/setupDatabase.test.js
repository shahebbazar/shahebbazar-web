// Database setup on start (DB_AUTO_SETUP, lib/setupDatabase.js), for the client's server where nobody
// can run commands in the containers: an empty database is loaded, later starts apply only new
// migrations, and a broken migration stops the start without being recorded.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Client } = require("pg");
const { setupDatabase } = require("../lib/setupDatabase");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const DB = `${process.env.TEST_PGDATABASE || `${process.env.PGDATABASE || "shahebbazar"}_test`}_setup`;
const connection = (database) => new Client({
    host: process.env.PGHOST || "localhost",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD,
    port: Number(process.env.PGPORT) || 5432,
    database,
});
const REAL_MIGRATIONS = path.join(__dirname, "..", "..", "database", "migrations");
const migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), "shahebbazar-migrations-"));
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "shahebbazar-setup-uploads-"));
const quiet = () => {};
let client;

async function admin(sql) {
    const c = connection("postgres");
    await c.connect();
    try { await c.query(sql); } finally { await c.end(); }
}

before(async () => {
    for (const file of fs.readdirSync(REAL_MIGRATIONS)) fs.copyFileSync(path.join(REAL_MIGRATIONS, file), path.join(migrationsDir, file));
    await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin(`CREATE DATABASE "${DB}"`);
    client = connection(DB);
    await client.connect();
});

after(async () => {
    await client?.end();
    await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    fs.rmSync(migrationsDir, { recursive: true, force: true });
    fs.rmSync(uploadDir, { recursive: true, force: true });
});

const recorded = async () => (await client.query("SELECT migration_file FROM schema_migrations ORDER BY 1")).rows.map((r) => r.migration_file);

describe("database setup on start", () => {
    it("loads an empty database, copies the seed photos and records the migrations it already includes", async () => {
        const result = await setupDatabase(client, { uploadDir, migrationsDir, log: quiet });
        assert.deepEqual(result, { loaded: true, applied: [] });
        assert.ok((await client.query("SELECT COUNT(*)::int AS n FROM users")).rows[0].n > 0, "demo data loaded");
        assert.deepEqual(await recorded(), fs.readdirSync(REAL_MIGRATIONS).filter((f) => f.endsWith(".sql")).sort());
        assert.ok(fs.readdirSync(uploadDir).length > 0, "seed photos copied");
    });

    it("changes nothing on the next start", async () => {
        assert.deepEqual(await setupDatabase(client, { uploadDir, migrationsDir, log: quiet }), { loaded: false, applied: [] });
    });

    it("applies a new migration once", async () => {
        fs.writeFileSync(path.join(migrationsDir, "900_setup_probe.sql"), "CREATE TABLE IF NOT EXISTS setup_probe (id integer);");
        assert.deepEqual(await setupDatabase(client, { uploadDir, migrationsDir, log: quiet }), { loaded: false, applied: ["900_setup_probe.sql"] });
        assert.equal((await client.query("SELECT to_regclass('public.setup_probe') IS NOT NULL AS ok")).rows[0].ok, true);
        assert.deepEqual(await setupDatabase(client, { uploadDir, migrationsDir, log: quiet }), { loaded: false, applied: [] });
    });

    it("stops on a broken migration without recording it, and leaves no lock or open transaction", async () => {
        fs.writeFileSync(path.join(migrationsDir, "901_broken.sql"), "BEGIN;\nSELECT * FROM no_such_table;\nCOMMIT;");
        await assert.rejects(setupDatabase(client, { uploadDir, migrationsDir, log: quiet }), /no_such_table/);
        assert.ok(!(await recorded()).includes("901_broken.sql"));
        assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'")).rows[0].n, 0, "lock released");

        // Fixed: the next start applies it.
        fs.writeFileSync(path.join(migrationsDir, "901_broken.sql"), "SELECT 1;");
        assert.deepEqual(await setupDatabase(client, { uploadDir, migrationsDir, log: quiet }), { loaded: false, applied: ["901_broken.sql"] });
    });
});
