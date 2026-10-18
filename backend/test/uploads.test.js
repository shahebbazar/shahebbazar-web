// Tests for scripts/check-uploads.js (npm run uploads:check), against a throwaway database
// and upload folder; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { BACKEND_DIR, TEST_DB, ORIGIN, UPLOAD_DIR, JPEG, query, call, startApi, stopApi } = require("./support/harness");

const VENDOR = 1;

function runCheck(...args) {
    return spawnSync(process.execPath, ["scripts/check-uploads.js", `--database=${TEST_DB}`, ...args], {
        cwd: BACKEND_DIR,
        env: { ...process.env, UPLOAD_DIR },
        encoding: "utf8",
    });
}

before(startApi);
after(stopApi);

describe("uploads:check", () => {
    let listingId;
    let photos;

    before(async () => {
        // A listing with two photos, whose main photo's file then goes missing.
        const category = (await query("SELECT category_id FROM categories ORDER BY category_id LIMIT 1"))[0].category_id;
        const created = await call("POST", `/vendors/${VENDOR}/listings`, {
            as: "owner",
            json: { listing_title: "Upload check listing", category_id: category },
        });
        listingId = created.data.listing_id;
        const form = new FormData();
        form.append("photos", new Blob([JPEG], { type: "image/jpeg" }), "a.jpg");
        form.append("photos", new Blob([JPEG], { type: "image/jpeg" }), "b.jpg");
        photos = (await call("POST", `/listings/${listingId}/photos`, { as: "owner", form })).data.photos;
        assert.equal(photos.length, 2);
        fs.rmSync(path.join(UPLOAD_DIR, path.basename(photos[0].photo_url)));

        // A business cover and business photo whose file is missing, and a file nothing uses.
        await query("UPDATE vendors SET vendor_cover_url = 'uploads/gone-cover.jpg' WHERE vendor_id = $1", [VENDOR]);
        await query("INSERT INTO vendor_photos (vendor_id, vendor_photo_url) VALUES ($1, 'uploads/gone-photo.jpg')", [VENDOR]);
        fs.writeFileSync(path.join(UPLOAD_DIR, "stray.jpg"), JPEG);
    });

    it("reports the problems, exits with an error and changes nothing", async () => {
        const result = runCheck();
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stdout, /3 stored image\(s\) point at a file that does not exist/);
        assert.match(result.stdout, /gone-cover\.jpg/);
        assert.match(result.stdout, /stray\.jpg/);
        assert.match(result.stdout, /Nothing was changed/);
        assert.equal((await query("SELECT 1 FROM listing_photos WHERE listing_id = $1", [listingId])).length, 2);
        assert.ok(fs.existsSync(path.join(UPLOAD_DIR, "stray.jpg")));
    });

    it("--fix removes the broken references and the listing keeps a main photo", async () => {
        const result = runCheck("--fix");
        assert.equal(result.status, 0, result.stdout + result.stderr);

        const left = await query("SELECT photo_id, photo_is_primary FROM listing_photos WHERE listing_id = $1", [listingId]);
        assert.deepEqual(left, [{ photo_id: photos[1].photo_id, photo_is_primary: true }]);
        const vendor = (await query("SELECT vendor_cover_url FROM vendors WHERE vendor_id = $1", [VENDOR]))[0];
        assert.equal(vendor.vendor_cover_url, null);
        assert.equal((await query("SELECT 1 FROM vendor_photos WHERE vendor_photo_url = 'uploads/gone-photo.jpg'")).length, 0);
    });

    it("--fix moves unused files aside instead of deleting them, and they are not served", async () => {
        assert.equal(fs.existsSync(path.join(UPLOAD_DIR, "stray.jpg")), false);
        const [batch] = fs.readdirSync(path.join(UPLOAD_DIR, ".unreferenced"));
        assert.ok(fs.existsSync(path.join(UPLOAD_DIR, ".unreferenced", batch, "stray.jpg")));
        const served = await fetch(`${ORIGIN}/uploads/.unreferenced/${batch}/stray.jpg`);
        assert.equal(served.status, 404);
        // The photo still in use was not touched.
        assert.ok(fs.existsSync(path.join(UPLOAD_DIR, path.basename(photos[1].photo_url))));
    });

    it("afterwards everything matches", () => {
        const result = runCheck();
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /Every stored image has its file, and every file is in use/);
    });
});
