#!/usr/bin/env node
// Compares the image paths stored in the database with the files in the upload folder.
//
//   npm run uploads:check          report only, changes nothing
//   npm run uploads:check -- --fix tidy up:
//     - rows whose file is missing are removed (listing and business photos), or the
//       column is cleared (business logo and cover); a listing that loses its main photo
//       gets its next photo as the main one
//     - files that no row uses are moved, not deleted, to .unreferenced/<date-time>/
//       (UTC) inside the upload folder (dot-folders are not served by the API)
//
// Uses PGDATABASE and UPLOAD_DIR from backend/.env, or --database=name.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const { UPLOAD_DIR } = require("../lib/uploads");

const QUARANTINE = ".unreferenced";

// Every place an uploaded image path is stored. "clear" columns are set to NULL; other rows are deleted.
const REFERENCES = `
  SELECT 'listing photo' AS kind, photo_id AS id, listing_id AS owner_id, photo_url AS url FROM listing_photos
  UNION ALL SELECT 'business photo', vendor_photo_id, vendor_id, vendor_photo_url FROM vendor_photos
  UNION ALL SELECT 'business logo', vendor_id, vendor_id, vendor_logo_url FROM vendors WHERE vendor_logo_url IS NOT NULL
  UNION ALL SELECT 'business cover', vendor_id, vendor_id, vendor_cover_url FROM vendors WHERE vendor_cover_url IS NOT NULL`;

// Stored paths look like "uploads/<file>"; full URLs point elsewhere and are not checked.
const fileName = (url) => (/^uploads\//.test(url) ? path.basename(url) : null);

/** Returns { missing, unreferenced }: rows whose file is absent, and files no row uses. */
async function inspectUploads(client, uploadDir = UPLOAD_DIR) {
  const files = fs.existsSync(uploadDir)
    ? fs.readdirSync(uploadDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)
    : [];
  const onDisk = new Set(files);
  const rows = (await client.query(REFERENCES)).rows;
  const used = new Set(rows.map((r) => fileName(r.url)).filter(Boolean));
  return {
    missing: rows.filter((r) => fileName(r.url) && !onDisk.has(fileName(r.url))),
    unreferenced: files.filter((f) => !used.has(f)).sort(),
  };
}

/** Removes the missing references in one transaction, then moves unreferenced files aside. */
async function fixUploads(client, { missing, unreferenced }, uploadDir = UPLOAD_DIR) {
  const ids = (kind) => missing.filter((r) => r.kind === kind).map((r) => r.id);
  await client.query("BEGIN");
  try {
    const removed = await client.query(
      "DELETE FROM listing_photos WHERE photo_id = ANY($1) RETURNING listing_id, photo_is_primary",
      [ids("listing photo")]
    );
    // Same rule as removing a photo in the dashboard: the next photo becomes the main one.
    const lostMain = [...new Set(removed.rows.filter((r) => r.photo_is_primary).map((r) => r.listing_id))];
    for (const listingId of lostMain) {
      await client.query(
        `UPDATE listing_photos SET photo_is_primary = true
         WHERE photo_id = (SELECT photo_id FROM listing_photos WHERE listing_id = $1
                           ORDER BY photo_sort_order, photo_id LIMIT 1)`,
        [listingId]
      );
    }
    await client.query("DELETE FROM vendor_photos WHERE vendor_photo_id = ANY($1)", [ids("business photo")]);
    await client.query("UPDATE vendors SET vendor_logo_url = NULL WHERE vendor_id = ANY($1)", [ids("business logo")]);
    await client.query("UPDATE vendors SET vendor_cover_url = NULL WHERE vendor_id = ANY($1)", [ids("business cover")]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }

  let movedTo = null;
  if (unreferenced.length) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    movedTo = path.join(uploadDir, QUARANTINE, stamp);
    fs.mkdirSync(movedTo, { recursive: true });
    for (const name of unreferenced) fs.renameSync(path.join(uploadDir, name), path.join(movedTo, name));
  }
  return { movedTo };
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
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
    const found = await inspectUploads(client);
    console.log(`Database ${dbName}, upload folder ${UPLOAD_DIR}`);
    if (!found.missing.length && !found.unreferenced.length) {
      console.log("Every stored image has its file, and every file is in use.");
      return;
    }
    if (found.missing.length) {
      console.log(`\n${found.missing.length} stored image(s) point at a file that does not exist:`);
      console.table(found.missing.map(({ kind, id, owner_id, url }) => ({ kind, id, "listing/business": owner_id, url })));
    }
    if (found.unreferenced.length) {
      console.log(`\n${found.unreferenced.length} file(s) in the upload folder are not used by any row:`);
      for (const name of found.unreferenced) console.log(`  ${name}`);
    }
    if (!fix) {
      console.log("\nNothing was changed. Run again with --fix to tidy up (see the top of scripts/check-uploads.js).");
      process.exitCode = 1;
      return;
    }
    const { movedTo } = await fixUploads(client, found);
    console.log(`\nRemoved ${found.missing.length} reference(s) to missing files.`);
    if (movedTo) console.log(`Moved ${found.unreferenced.length} unused file(s) to ${movedTo}`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { inspectUploads, fixUploads };
