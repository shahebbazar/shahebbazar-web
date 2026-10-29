// The live site's reference data (DB_SEED=reference, database/baseline/reference.sql, KAN-279): an
// empty database gets locations, categories and marketing passes the same as the demo seed's, one
// admin for ADMIN_PHONE, and no demo businesses, accounts or photos.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Client } = require("pg");
const { setupDatabase } = require("../lib/setupDatabase");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const BASE = `${process.env.TEST_PGDATABASE || `${process.env.PGDATABASE || "shahebbazar"}_test`}_reference`;
const DATABASES = { demo: `${BASE}_demo`, reference: BASE, refused: `${BASE}_refused` };
const connection = (database) => new Client({
    host: process.env.PGHOST || "localhost",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD,
    port: Number(process.env.PGPORT) || 5432,
    database,
});
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "shahebbazar-reference-uploads-"));
const quiet = () => {};
const clients = {};

async function admin(sql) {
    const c = connection("postgres");
    await c.connect();
    try { await c.query(sql); } finally { await c.end(); }
}

before(async () => {
    for (const [name, database] of Object.entries(DATABASES)) {
        await admin(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
        await admin(`CREATE DATABASE "${database}"`);
        clients[name] = connection(database);
        await clients[name].connect();
    }
    await setupDatabase(clients.demo, { log: quiet });
});

after(async () => {
    for (const [name, database] of Object.entries(DATABASES)) {
        await clients[name]?.end();
        await admin(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    }
    fs.rmSync(uploadDir, { recursive: true, force: true });
});

const rows = async (name, sql) => (await clients[name].query(sql)).rows;
const count = async (name, table) => (await rows(name, `SELECT COUNT(*)::int AS n FROM ${table}`))[0].n;

// Compared by slug and values, since ids depend on insert order.
const CATEGORIES = `SELECT p.category_slug AS parent, c.category_slug, c.category_name, c.category_name_bn,
                           c.category_icon, c.category_sort_order, c.category_is_active
                    FROM categories c LEFT JOIN categories p ON p.category_id = c.category_parent_id
                    ORDER BY c.category_slug`;
const LOCATIONS = `SELECT p.location_slug AS parent, l.location_slug, l.location_name, l.location_name_bn,
                          l.location_type, l.location_path
                   FROM locations l LEFT JOIN locations p ON p.location_id = l.location_parent_id
                   ORDER BY l.location_slug`;
const PACKAGES = `SELECT package_name, package_duration_days, package_price_bdt, package_email_campaign_limit,
                         package_ai_action_limit, package_sms_limit, package_is_active, package_sort_order
                  FROM marketing_packages ORDER BY package_sort_order`;
const SETTINGS = "SELECT setting_key, setting_value FROM platform_settings ORDER BY setting_key";

describe("reference data for the live site", () => {
    it("refuses to load without a mobile number for the admin, and leaves the database empty", async () => {
        for (const adminPhone of [undefined, "", "0721775544"]) {
            await assert.rejects(setupDatabase(clients.refused, { seed: "reference", adminPhone, uploadDir, log: quiet }), /ADMIN_PHONE/);
        }
        assert.equal((await rows("refused", "SELECT to_regclass('public.users') IS NULL AS empty"))[0].empty, true);
        assert.equal((await rows("refused", "SELECT COUNT(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'"))[0].n, 0, "lock released");
    });

    it("refuses an unknown seed", async () => {
        await assert.rejects(setupDatabase(clients.refused, { seed: "live", log: quiet }), /DB_SEED/);
    });

    it("loads with one admin, signing in by the number given", async () => {
        const result = await setupDatabase(clients.reference, { seed: "reference", adminPhone: "01711-999999", uploadDir, log: quiet });
        assert.deepEqual(result, { loaded: true, applied: [] });
        assert.deepEqual(await rows("reference", "SELECT user_phone, user_role FROM users"), [{ user_phone: "+8801711999999", user_role: "admin" }]);
    });

    it("has the demo seed's locations, categories, marketing passes and approval settings", async () => {
        assert.deepEqual(await rows("reference", LOCATIONS), await rows("demo", LOCATIONS));
        assert.deepEqual(await rows("reference", CATEGORIES), await rows("demo", CATEGORIES));
        assert.deepEqual(await rows("reference", PACKAGES), await rows("demo", PACKAGES));
        assert.deepEqual(await rows("reference", SETTINGS), await rows("demo", SETTINGS));
        assert.ok((await rows("reference", SETTINGS)).every((s) => s.setting_value === false), "approval off");
    });

    it("has no demo businesses, content or photos", async () => {
        for (const table of ["vendors", "vendor_listings", "events", "reviews", "conversations", "search_logs",
            "vendor_profile_views", "marketing_consents", "vendor_marketing_subscriptions"]) {
            assert.equal(await count("reference", table), 0, `${table} is empty`);
        }
        assert.deepEqual(fs.readdirSync(uploadDir), [], "no seed photos copied");
    });

    it("records the migrations, so later starts change nothing", async () => {
        assert.deepEqual(
            await rows("reference", "SELECT migration_file FROM schema_migrations ORDER BY 1"),
            await rows("demo", "SELECT migration_file FROM schema_migrations ORDER BY 1"),
        );
        assert.deepEqual(await setupDatabase(clients.reference, { seed: "reference", adminPhone: "01711-999999", log: quiet }), { loaded: false, applied: [] });
    });
});
