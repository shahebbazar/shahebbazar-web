#!/usr/bin/env node
// Database loader: builds a database from the consolidated baseline schema and seed.
// The historical versioned files in database/legacy/ are kept for reference only and are never loaded.
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Client } = require("pg");
const { verifyDatabase } = require("./verify-db");
const { BASELINE_FILES, DATABASE_DIR, copySeedAssets, recordBaselineMigrations } = require("../lib/setupDatabase");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Images the seed references by path are copied into the upload folder so seeded listings display.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "..", "uploads");

const args = process.argv.slice(2);
const wantsReset = args.includes("--reset");
const skipPrompt = args.includes("--yes") || args.includes("-y");
const databaseArg = args.find((arg) => arg.startsWith("--database="));
const dbName = databaseArg ? databaseArg.slice("--database=".length) : process.env.PGDATABASE || "shahebbazar";
const connection = {
  host: process.env.PGHOST || "localhost",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD,
  port: Number(process.env.PGPORT) || 5432,
};

function validateDatabaseName(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid database name: ${name}`);
}
function quoteIdentifier(name) {
  validateDatabaseName(name);
  return `"${name.replaceAll('"', '""')}"`;
}
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim().toLowerCase());
  }));
}
async function withAdminClient(fn) {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function main() {
  validateDatabaseName(dbName);
  for (const file of BASELINE_FILES) {
    const fullPath = path.join(DATABASE_DIR, file);
    if (!fs.existsSync(fullPath)) throw new Error(`Missing SQL file: ${fullPath}`);
  }
  if (wantsReset && !skipPrompt) {
    const answer = await ask(`This drops database "${dbName}". Continue? (yes/no) `);
    if (!["yes", "y"].includes(answer)) return console.log("Cancelled. No changes made.");
  }
  await withAdminClient(async (admin) => {
    if (wantsReset) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [dbName]
      );
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
      console.log(`Dropped database ${dbName}`);
    }
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!exists.rowCount) {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
      console.log(`Created database ${dbName}`);
    }
  });
  const client = new Client({ ...connection, database: dbName });
  await client.connect();
  try {
    // The baseline is a full schema dump, so it can only be applied to an empty database.
    const loaded = await client.query("SELECT to_regclass('public.users') IS NOT NULL AS loaded");
    if (loaded.rows[0].loaded) {
      console.log(`Database "${dbName}" is already loaded. Run "npm run db:reset" to rebuild it.`);
      return;
    }
    for (const file of BASELINE_FILES) {
      const sql = fs.readFileSync(path.join(DATABASE_DIR, file), "utf8").replace(/^﻿/, "");
      await client.query(sql);
      console.log(`  applied ${file}`);
    }
    // The baseline already includes every migration file there is now.
    await recordBaselineMigrations(client);
    const copied = copySeedAssets(UPLOAD_DIR);
    console.log(`  copied ${copied} seed image${copied === 1 ? "" : "s"} to ${UPLOAD_DIR}`);

    const problems = await verifyDatabase(client);
    if (problems.length) {
      console.error("\nDatabase verification failed:");
      console.table(problems);
      process.exitCode = 1;
      return;
    }

    const summary = await client.query(`
      SELECT 'businesses' AS item, COUNT(*)::int AS n FROM v_business_cards
      UNION ALL SELECT 'listings', COUNT(*)::int FROM vendor_listings
      UNION ALL SELECT 'categories', COUNT(*)::int FROM categories
      UNION ALL SELECT 'events', COUNT(*)::int FROM events
      UNION ALL SELECT 'moderation queue', COUNT(*)::int FROM v_moderation_queue
    `);
    console.log(`\nComplete (${dbName}). Verification passed.`);
    for (const row of summary.rows) console.log(`  ${row.item.padEnd(18)} ${row.n}`);
  } finally { await client.end(); }
}
main().catch((err) => {
  console.error("\nDatabase load failed.\n");
  console.error(err);
  process.exit(1);
});
