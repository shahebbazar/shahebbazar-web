#!/usr/bin/env node
// Checks a loaded database against database/checks/verify-baseline.sql.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const sqlPath = path.join(__dirname, "..", "..", "database", "checks", "verify-baseline.sql");

// Returns the rows the check query reports as missing; an empty array means the database is complete.
async function verifyDatabase(client) {
  const result = await client.query(fs.readFileSync(sqlPath, "utf8").replace(/^﻿/, ""));
  return result.rows;
}

async function main() {
  const args = process.argv.slice(2);
  const databaseArg = args.find((arg) => arg.startsWith("--database="));
  const dbName = databaseArg ? databaseArg.slice("--database=".length) : process.env.PGDATABASE;
  if (!dbName) throw new Error("No database selected. Set PGDATABASE or pass --database=name.");
  const client = new Client({
    host: process.env.PGHOST || "localhost",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD,
    port: Number(process.env.PGPORT) || 5432,
    database: dbName,
  });
  await client.connect();
  try {
    const problems = await verifyDatabase(client);
    if (problems.length) {
      console.error("Database verification failed:");
      console.table(problems);
      process.exitCode = 1;
    } else {
      console.log(`Database verification passed for ${dbName}.`);
    }
  } finally { await client.end(); }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { verifyDatabase };
