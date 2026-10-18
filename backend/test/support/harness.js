// Shared set-up for the API test files.
//
// startApi() builds a throwaway database from the baseline, starts the real API against it and
// signs in through the normal OTP flow (codes are read from the console mock) as each seeded
// role. stopApi() stops the API and drops the database.
//
// Uses the PostgreSQL settings in backend/.env. The test database is
// "<PGDATABASE>_test" unless TEST_PGDATABASE is set. Test files run one at a time
// (--test-concurrency=1), so they can share the database name and port.

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

const BACKEND_DIR = path.join(__dirname, "..", "..");
const DEV_DB = process.env.PGDATABASE || "shahebbazar";
const TEST_DB = process.env.TEST_PGDATABASE || `${DEV_DB}_test`;
const PORT = Number(process.env.TEST_PORT) || 4100;
const ORIGIN = `http://localhost:${PORT}`;
const API = `${ORIGIN}/api`;
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "shahebbazar-uploads-"));

// Seeded accounts (database/baseline/seed.sql).
const PHONES = {
    owner: "+8801711000005", // owns business 1, rajshahi-mango-traders
    otherVendor: "+8801711000006", // owns business 6
    customer: "+8801722000001",
    admin: "+8801711000001",
};
const ROLES = { owner: "vendor", otherVendor: "vendor", customer: "customer", admin: "admin" };

// Minimal files whose first bytes match their type, which is what the upload check reads.
const JPEG = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    "base64"
);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

let server;
let serverLog = "";
const cookies = {};

function pgClient(database) {
    return new Client({
        host: process.env.PGHOST || "localhost",
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD,
        port: Number(process.env.PGPORT) || 5432,
        database,
    });
}

/** Runs SQL against the test database and returns the rows. */
async function query(sql, params) {
    const client = pgClient(TEST_DB);
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

/** Calls the API as a signed-in role (or signed out when `as` is omitted). */
async function call(method, route, { as, cookie, json, form } = {}) {
    const headers = {};
    if (as) headers.Cookie = cookies[as];
    if (cookie) headers.Cookie = cookie;
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

/** Requests a verification code and returns it, read from the console mock. */
async function requestCode(phone, purpose, expectedRole) {
    const from = serverLog.length;
    const requested = await call("POST", "/auth/request-verification", {
        json: { phone, purpose, expectedRole },
    });
    assert.equal(requested.status, 201, `request-verification for ${phone}: ${JSON.stringify(requested.data)}`);
    const pattern = new RegExp(
        `\\[mock verification\\] phone: ${phone.replace("+", "\\+")}\\s+\\[mock verification\\] purpose: ${purpose}\\s+\\[mock verification\\] code: (\\d{6})`
    );
    const match = await waitFor(() => serverLog.slice(from).match(pattern), `the ${purpose} code for ${phone}`);
    return match[1];
}

/** Signs in through the real OTP flow, reading the code from the console mock. */
async function signIn(role) {
    const phone = PHONES[role];
    const expectedRole = ROLES[role];
    const code = await requestCode(phone, "login", expectedRole);
    const verified = await call("POST", "/auth/verify", {
        json: { phone, purpose: "login", expectedRole, code },
    });
    assert.equal(verified.status, 200, `verify for ${role}: ${JSON.stringify(verified.data)}`);
    const session = (verified.headers.get("set-cookie") || "").split(";")[0];
    assert.match(session, /^shaheb_session=/, `${role} received a session cookie`);
    cookies[role] = session;
}

/** Loads the test database, starts the API and signs in as every role. */
async function startApi() {
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

    for (const role of Object.keys(PHONES)) await signIn(role);
}

/** Stops the API, drops the test database and removes the test upload folder. */
async function stopApi() {
    if (server) {
        server.kill();
        await new Promise((resolve) => server.once("exit", resolve));
    }
    const admin = pgClient("postgres");
    await admin.connect();
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [TEST_DB]);
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    await admin.end();
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
}

const userIdOf = async (role) =>
    (await query("SELECT user_id FROM users WHERE user_phone = $1", [PHONES[role]]))[0].user_id;

module.exports = {
    BACKEND_DIR,
    TEST_DB,
    ORIGIN,
    UPLOAD_DIR,
    PHONES,
    ROLES,
    JPEG,
    PNG,
    query,
    call,
    requestCode,
    signIn,
    startApi,
    stopApi,
    userIdOf,
};
