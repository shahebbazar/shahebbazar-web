// Before the browser tests: load a fresh database, build the site for it, then start the API and the
// site. Returns the teardown that stops both.
//
// E2E_SKIP_BUILD=1 reuses the last test build, for quick reruns when only tests changed.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { API, API_LOG, API_PORT, BACKEND_DIR, DATABASE, DIST_DIR, FRONTEND_DIR, ROOT, UPLOAD_DIR, WEB, WEB_PORT } from "./env";

const isWindows = process.platform === "win32";

const apiEnv = (): NodeJS.ProcessEnv => ({
    ...process.env,
    PORT: String(API_PORT),
    PGDATABASE: DATABASE,
    CORS_ORIGIN: WEB,
    PUBLIC_SITE_URL: WEB,
    UPLOAD_DIR,
    MOCK_VERIFICATION_DELIVERY: "console",
    MARKETING_WORKSPACE_ENABLED: "true",
    // Campaign emails go to the API console, never to a real provider, whatever backend/.env says.
    MARKETING_EMAIL_ENABLED: "false",
    ANALYTICS_SALT: process.env.ANALYTICS_SALT || "e2e-only-salt",
    NODE_ENV: "development", // codes are printed to the log, which the sign-in test reads
});

const webEnv = (): NodeJS.ProcessEnv => ({
    ...process.env,
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_PUBLIC_API_BASE_URL: API,
    API_BASE_URL: API,
    NEXT_PUBLIC_SITE_URL: WEB,
    NEXT_TELEMETRY_DISABLED: "1",
});

// npx is a script on Windows, so it needs a shell; node itself must not go through one (its path has spaces).
const viaShell = (command: string, args: string[]): [string, string[], boolean] =>
    command === "npx" ? [`npx ${args.join(" ")}`, [], true] : [command, args, false];

function run(label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
    console.log(`[e2e] ${label}`);
    const [file, fileArgs, shell] = viaShell(command, args);
    const result = spawnSync(file, fileArgs, { cwd, env, stdio: "inherit", shell });
    if (result.status !== 0) throw new Error(`[e2e] ${label} failed (exit ${result.status})`);
}

function start(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, log: fs.WriteStream): ChildProcess {
    const [file, fileArgs, shell] = viaShell(command, args);
    const child = spawn(file, fileArgs, { cwd, env, shell, detached: !isWindows });
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
    return child;
}

function stop(child: ChildProcess | undefined) {
    if (!child?.pid || child.exitCode !== null) return;
    if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else {
        try {
            process.kill(-child.pid, "SIGTERM"); // the whole group, including npx's children
        } catch {
            child.kill("SIGTERM");
        }
    }
}

async function waitFor(url: string, child: ChildProcess, label: string, timeoutMs = 120_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (child.exitCode !== null) throw new Error(`[e2e] ${label} exited early (code ${child.exitCode}); see ${API_LOG}`);
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch {
            // not listening yet
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`[e2e] ${label} did not start within ${timeoutMs / 1000}s; see ${API_LOG}`);
}

export default async function globalSetup() {
    fs.mkdirSync(path.dirname(API_LOG), { recursive: true });
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });

    run(`loading database "${DATABASE}"`, process.execPath,
        [path.join(BACKEND_DIR, "scripts", "load-db.js"), "--reset", "--yes", `--database=${DATABASE}`], ROOT, apiEnv());

    if (process.env.E2E_SKIP_BUILD === "1" && fs.existsSync(path.join(FRONTEND_DIR, DIST_DIR, "BUILD_ID"))) {
        console.log("[e2e] reusing the last test build (E2E_SKIP_BUILD=1)");
    } else {
        run("building the site for the test servers", "npx", ["next", "build"], FRONTEND_DIR, webEnv());
    }

    const log = fs.createWriteStream(API_LOG, { flags: "w" });
    const api = start(process.execPath, ["index.js"], BACKEND_DIR, apiEnv(), log);
    const web = start("npx", ["next", "start", "-p", String(WEB_PORT)], FRONTEND_DIR, webEnv(), log);
    try {
        await waitFor(`${API}/api/health`, api, "the API");
        await waitFor(`${WEB}/faq`, web, "the site");
    } catch (err) {
        stop(api);
        stop(web);
        throw err;
    }
    console.log(`[e2e] site ${WEB}, API ${API}, database ${DATABASE}`);

    return async () => {
        stop(web);
        stop(api);
        log.end();
    };
}
