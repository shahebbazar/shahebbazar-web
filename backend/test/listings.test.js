// End-to-end API tests for listings, listing photos and business images.
//
// Builds a throwaway database from the baseline, starts the real API against it, signs in
// through the normal OTP flow (codes are read from the console mock), and exercises the
// routes as each role. Run with `npm test` from the repository root or backend/.
//
// Uses the PostgreSQL settings in backend/.env. The test database is
// "<PGDATABASE>_test" unless TEST_PGDATABASE is set, and is dropped afterwards.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const BACKEND_DIR = path.join(__dirname, "..");
const DEV_DB = process.env.PGDATABASE || "shahebbazar";
const TEST_DB = process.env.TEST_PGDATABASE || `${DEV_DB}_test`;
const PORT = Number(process.env.TEST_PORT) || 4100;
const API = `http://localhost:${PORT}/api`;
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "shahebbazar-uploads-"));

// Seeded accounts (database/baseline/seed.sql).
const PHONES = {
    owner: "+8801711000005", // owns business 1, rajshahi-mango-traders
    otherVendor: "+8801711000006", // owns business 6
    customer: "+8801722000001",
    admin: "+8801711000001",
};
const OWNED_VENDOR = 1;
const OWNED_VENDOR_SLUG = "rajshahi-mango-traders";

// Minimal files whose first bytes match their type, which is what the upload check reads.
const JPEG = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    "base64"
);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

let server;
let serverLog = "";
const cookies = {};

// ---------- helpers ----------

function adminClient() {
    return new Client({
        host: process.env.PGHOST || "localhost",
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD,
        port: Number(process.env.PGPORT) || 5432,
        database: "postgres",
    });
}

async function query(sql, params) {
    const client = new Client({
        host: process.env.PGHOST || "localhost",
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD,
        port: Number(process.env.PGPORT) || 5432,
        database: TEST_DB,
    });
    await client.connect();
    try {
        return (await client.query(sql, params)).rows;
    } finally {
        await client.end();
    }
}

function waitFor(check, label, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
            const value = check();
            if (value) {
                clearInterval(timer);
                resolve(value);
            } else if (Date.now() - started > timeoutMs) {
                clearInterval(timer);
                reject(new Error(`Timed out waiting for ${label}.\n--- API output ---\n${serverLog}`));
            }
        }, 50);
    });
}

async function call(method, route, { as, json, form } = {}) {
    const headers = {};
    if (as) headers.Cookie = cookies[as];
    let body;
    if (json) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(json);
    } else if (form) {
        body = form;
    }
    const res = await fetch(`${API}${route}`, { method, headers, body });
    const text = await res.text();
    let data = null;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    return { status: res.status, data, headers: res.headers };
}

/** Signs in through the real OTP flow, reading the code from the console mock. */
async function signIn(role, expectedRole) {
    const phone = PHONES[role];
    const from = serverLog.length;
    const requested = await call("POST", "/auth/request-verification", {
        json: { phone, purpose: "login", expectedRole },
    });
    assert.equal(requested.status, 201, `request-verification for ${role}: ${JSON.stringify(requested.data)}`);
    const pattern = new RegExp(
        `\\[mock verification\\] phone: ${phone.replace("+", "\\+")}\\s+\\[mock verification\\] purpose: login\\s+\\[mock verification\\] code: (\\d{6})`
    );
    const match = await waitFor(() => serverLog.slice(from).match(pattern), `the OTP for ${role}`);
    const verified = await call("POST", "/auth/verify", {
        json: { phone, purpose: "login", expectedRole, code: match[1] },
    });
    assert.equal(verified.status, 200, `verify for ${role}: ${JSON.stringify(verified.data)}`);
    const setCookie = verified.headers.get("set-cookie") || "";
    const session = setCookie.split(";")[0];
    assert.match(session, /^shaheb_session=/, `${role} received a session cookie`);
    cookies[role] = session;
}

function photoForm(files) {
    const form = new FormData();
    for (const [buffer, type, name] of files) {
        form.append("photos", new Blob([buffer], { type }), name);
    }
    return form;
}

const uploadedFiles = () => fs.readdirSync(UPLOAD_DIR);
const fileOf = (storedPath) => path.join(UPLOAD_DIR, path.basename(storedPath));

async function createListing(as, title, vendorId = OWNED_VENDOR) {
    const created = await call("POST", `/vendors/${vendorId}/listings`, {
        as,
        json: { listing_title: title, category_id: await categoryId(), listing_price: "100" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    return created.data.listing_id;
}

let cachedCategory;
async function categoryId() {
    if (!cachedCategory) {
        cachedCategory = (await query("SELECT category_id FROM categories ORDER BY category_id LIMIT 1"))[0].category_id;
    }
    return cachedCategory;
}

// ---------- setup ----------

before(async () => {
    assert.notEqual(TEST_DB, DEV_DB, "The test database must not be the development database.");

    const load = spawnSync(process.execPath, ["scripts/load-db.js", "--reset", "--yes", `--database=${TEST_DB}`], {
        cwd: BACKEND_DIR,
        env: { ...process.env, UPLOAD_DIR },
        encoding: "utf8",
    });
    assert.equal(load.status, 0, `Loading the test database failed:\n${load.stdout}\n${load.stderr}`);

    server = spawn(process.execPath, ["index.js"], {
        cwd: BACKEND_DIR,
        env: {
            ...process.env,
            PORT: String(PORT),
            PGDATABASE: TEST_DB,
            UPLOAD_DIR,
            NODE_ENV: "test",
            MOCK_VERIFICATION_DELIVERY: "console",
        },
    });
    server.stdout.on("data", (chunk) => (serverLog += chunk));
    server.stderr.on("data", (chunk) => (serverLog += chunk));
    await waitFor(() => serverLog.includes("API running on"), "the API to start");

    await signIn("owner", "vendor");
    await signIn("otherVendor", "vendor");
    await signIn("customer", "customer");
    await signIn("admin", "admin");
});

after(async () => {
    if (server) {
        server.kill();
        await new Promise((resolve) => server.once("exit", resolve));
    }
    const admin = adminClient();
    await admin.connect();
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [TEST_DB]);
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    await admin.end();
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

// ---------- access control ----------

describe("access control", () => {
    let listingId;
    before(async () => {
        listingId = await createListing("owner", "Access test listing");
    });

    // [label, method, route builder, request options]
    const routes = [
        ["list a business's listings", "GET", () => `/vendors/${OWNED_VENDOR}/listings`, {}],
        ["create a listing", "POST", () => `/vendors/${OWNED_VENDOR}/listings`, { json: {} }],
        ["update a listing", "PUT", (id) => `/listings/${id}`, { json: {} }],
        ["upload listing photos", "POST", (id) => `/listings/${id}/photos`, { photos: true }],
        ["make a photo the main one", "PUT", (id) => `/listings/${id}/photos/1/primary`, {}],
        ["remove a listing photo", "DELETE", (id) => `/listings/${id}/photos/1`, {}],
        ["delete a listing", "DELETE", (id) => `/listings/${id}`, {}],
        ["upload a business logo", "POST", () => `/vendors/${OWNED_VENDOR}/logo`, { logo: true }],
        ["upload business photos", "POST", () => `/vendors/${OWNED_VENDOR}/photos`, { photos: true }],
    ];

    for (const [label, method, route, options] of routes) {
        for (const [as, expected] of [[undefined, 401], ["customer", 403], ["otherVendor", 403]]) {
            it(`${label}: ${as ?? "signed out"} gets ${expected}`, async () => {
                const before = uploadedFiles().length;
                let form;
                if (options.photos) form = photoForm([[JPEG, "image/jpeg", "a.jpg"]]);
                if (options.logo) {
                    form = new FormData();
                    form.append("logo", new Blob([JPEG], { type: "image/jpeg" }), "logo.jpg");
                }
                const res = await call(method, route(listingId), { as, json: options.json, form });
                assert.equal(res.status, expected, JSON.stringify(res.data));
                assert.equal(uploadedFiles().length, before, "a refused request must not write a file");
            });
        }
    }

    it("the owner and an admin can list the business's listings", async () => {
        assert.equal((await call("GET", `/vendors/${OWNED_VENDOR}/listings`, { as: "owner" })).status, 200);
        assert.equal((await call("GET", `/vendors/${OWNED_VENDOR}/listings`, { as: "admin" })).status, 200);
    });

    it("an admin can update another vendor's listing", async () => {
        const res = await call("PUT", `/listings/${listingId}`, {
            as: "admin",
            json: { listing_title: "Access test listing (edited)", category_id: await categoryId() },
        });
        assert.equal(res.status, 200, JSON.stringify(res.data));
    });

    it("a listing id that does not exist gives 404, and an invalid one 400", async () => {
        assert.equal((await call("PUT", "/listings/999999", { as: "owner", json: {} })).status, 404);
        assert.equal((await call("DELETE", "/listings/abc", { as: "owner" })).status, 400);
    });
});

// ---------- the vendor's journey ----------

describe("listing photos, from upload to the public page", () => {
    let listingId;
    let photos;

    it("a new listing starts pending, with no photos", async () => {
        listingId = await createListing("owner", "Langra Mango Crate");
        const list = await call("GET", `/vendors/${OWNED_VENDOR}/listings`, { as: "owner" });
        const listing = list.data.find((l) => l.listing_id === listingId);
        assert.equal(listing.listing_status, "pending");
        assert.equal(listing.photo_url, null);
        assert.deepEqual(listing.photos, []);
    });

    it("the first upload becomes the main photo and is saved to disk", async () => {
        const res = await call("POST", `/listings/${listingId}/photos`, {
            as: "owner",
            form: photoForm([[JPEG, "image/jpeg", "crate.jpg"]]),
        });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        photos = res.data.photos;
        assert.equal(photos.length, 1);
        assert.equal(photos[0].photo_is_primary, true);
        assert.match(photos[0].photo_url, new RegExp(`^uploads/listing-${listingId}-[0-9a-f]{24}\\.jpg$`));
        assert.ok(fs.existsSync(fileOf(photos[0].photo_url)));
    });

    it("the vendor's listing list returns the main photo and all photos", async () => {
        const list = await call("GET", `/vendors/${OWNED_VENDOR}/listings`, { as: "owner" });
        const listing = list.data.find((l) => l.listing_id === listingId);
        assert.equal(listing.photo_url, photos[0].photo_url);
        assert.equal(listing.photos.length, 1);
    });

    it("the uploaded file is served at /uploads", async () => {
        const res = await fetch(`http://localhost:${PORT}/${photos[0].photo_url}`);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("content-type"), "image/jpeg");
    });

    it("later uploads are added without replacing the main photo", async () => {
        const res = await call("POST", `/listings/${listingId}/photos`, {
            as: "owner",
            form: photoForm([[PNG, "image/png", "side.png"]]),
        });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        photos = res.data.photos;
        assert.equal(photos.length, 2);
        assert.deepEqual(photos.map((p) => p.photo_is_primary), [true, false]);
    });

    it("the vendor can make another photo the main one", async () => {
        const second = photos[1];
        const res = await call("PUT", `/listings/${listingId}/photos/${second.photo_id}/primary`, { as: "owner" });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        photos = res.data.photos;
        assert.equal(photos[0].photo_id, second.photo_id, "the new main photo is listed first");
        assert.equal(photos.filter((p) => p.photo_is_primary).length, 1);
    });

    it("a pending listing is not on the public page", async () => {
        const page = await call("GET", `/businesses/${OWNED_VENDOR_SLUG}`);
        assert.equal(page.status, 200);
        assert.equal(page.data.listings.some((l) => l.listing_id === listingId), false);
    });

    it("once an admin approves it, the listing and its main photo are on the public page", async () => {
        const decision = await call("POST", `/admin/listings/${listingId}/decision`, {
            as: "admin",
            json: { decision: "approve" },
        });
        assert.equal(decision.status, 200, JSON.stringify(decision.data));
        const page = await call("GET", `/businesses/${OWNED_VENDOR_SLUG}`);
        const card = page.data.listings.find((l) => l.listing_id === listingId);
        assert.ok(card, "approved listing is returned");
        assert.equal(card.photo_url, photos[0].photo_url, "the card uses the main photo");
        const served = await fetch(`http://localhost:${PORT}/${card.photo_url}`);
        assert.equal(served.status, 200, "the card's photo exists");
    });

    it("removing the main photo promotes the next one and deletes the file", async () => {
        const main = photos[0];
        const res = await call("DELETE", `/listings/${listingId}/photos/${main.photo_id}`, { as: "owner" });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.photos.length, 1);
        assert.equal(res.data.photos[0].photo_is_primary, true);
        assert.equal(fs.existsSync(fileOf(main.photo_url)), false);
        photos = res.data.photos;
    });

    it("a photo id from another listing gives 404", async () => {
        const other = await createListing("owner", "Second listing");
        const res = await call("PUT", `/listings/${other}/photos/${photos[0].photo_id}/primary`, { as: "owner" });
        assert.equal(res.status, 404);
    });

    it("deleting the listing removes its photo rows and files", async () => {
        const res = await call("DELETE", `/listings/${listingId}`, { as: "owner" });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const rows = await query("SELECT 1 FROM listing_photos WHERE listing_id = $1", [listingId]);
        assert.equal(rows.length, 0);
        assert.equal(fs.existsSync(fileOf(photos[0].photo_url)), false);
    });
});

// ---------- upload validation ----------

describe("upload validation", () => {
    let listingId;
    before(async () => {
        listingId = await createListing("owner", "Validation listing");
    });

    const rejects = [
        ["a text file labelled as a JPEG", [[Buffer.from("not an image"), "image/jpeg", "fake.jpg"]], 400, /not a valid image/],
        ["a GIF", [[JPEG, "image/gif", "a.gif"]], 400, /Only JPG, PNG or WEBP/],
        ["a file over 5 MB", [[Buffer.concat([JPEG, Buffer.alloc(6 * 1024 * 1024)]), "image/jpeg", "big.jpg"]], 400, /5 MB or smaller/],
        ["no file", [], 400, /Choose an image/],
    ];
    for (const [label, files, status, message] of rejects) {
        it(`rejects ${label} and leaves no file behind`, async () => {
            const before = uploadedFiles().length;
            const res = await call("POST", `/listings/${listingId}/photos`, { as: "owner", form: photoForm(files) });
            assert.equal(res.status, status, JSON.stringify(res.data));
            assert.match(res.data.error, message);
            assert.equal(uploadedFiles().length, before);
        });
    }

    it("never sends a server path in an error", async () => {
        const res = await call("POST", `/listings/${listingId}/photos`, {
            as: "owner",
            form: photoForm([[Buffer.from("x"), "image/jpeg", "x.jpg"]]),
        });
        assert.doesNotMatch(JSON.stringify(res.data), /[A-Za-z]:\\|\/uploads\/|ENOENT/);
    });

    it("allows at most 8 photos per listing", async () => {
        const six = Array.from({ length: 6 }, (_, i) => [JPEG, "image/jpeg", `p${i}.jpg`]);
        assert.equal((await call("POST", `/listings/${listingId}/photos`, { as: "owner", form: photoForm(six) })).status, 201);
        const before = uploadedFiles().length;
        const tooMany = Array.from({ length: 3 }, (_, i) => [JPEG, "image/jpeg", `q${i}.jpg`]);
        const res = await call("POST", `/listings/${listingId}/photos`, { as: "owner", form: photoForm(tooMany) });
        assert.equal(res.status, 400);
        assert.match(res.data.error, /You can add 2 more photos/);
        assert.equal(uploadedFiles().length, before);
    });

    it("recreates the upload folder if it is deleted while the API is running", async () => {
        const target = await createListing("owner", "Folder test listing");
        fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
        const res = await call("POST", `/listings/${target}/photos`, {
            as: "owner",
            form: photoForm([[JPEG, "image/jpeg", "a.jpg"]]),
        });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.ok(fs.existsSync(fileOf(res.data.photos[0].photo_url)));
    });
});

// ---------- business images still work ----------

describe("business images", () => {
    it("the owner can upload a logo", async () => {
        const form = new FormData();
        form.append("logo", new Blob([JPEG], { type: "image/jpeg" }), "logo.jpg");
        const res = await call("POST", `/vendors/${OWNED_VENDOR}/logo`, { as: "owner", form });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.match(res.data.logo_url, new RegExp(`^uploads/vendor-${OWNED_VENDOR}-[0-9a-f]{24}\\.jpg$`));
    });
});
