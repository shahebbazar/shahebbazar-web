import { defineConfig, devices } from "@playwright/test";
import { WEB } from "./env";

// Browser tests for the whole site (see README.md). Tests share one database, so they run one at a
// time. Every test runs on a desktop browser; tests tagged @phone also run at phone size.
export default defineConfig({
    testDir: "./tests",
    globalSetup: "./global-setup.ts",
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    timeout: 45_000,
    expect: { timeout: 10_000 },
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }], ["list"]] : [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: WEB,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        timezoneId: "Asia/Dhaka",
    },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"] } },
        { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
    ],
});
