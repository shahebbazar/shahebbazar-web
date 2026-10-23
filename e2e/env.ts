// Shared settings for the browser tests. Ports and the database are separate from the development
// servers (3000/4000, database "shahebbazar") and the API tests (4100, "<db>_test"), so all three can
// run at once.

import path from "node:path";
import dotenv from "dotenv";

export const ROOT = path.resolve(__dirname, "..");
export const BACKEND_DIR = path.join(ROOT, "backend");
export const FRONTEND_DIR = path.join(ROOT, "frontend", "shahebbazar");

// Local runs read the PostgreSQL settings from backend/.env; CI sets them in the workflow.
dotenv.config({ path: path.join(BACKEND_DIR, ".env"), quiet: true });

export const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 3200;
export const API_PORT = Number(process.env.E2E_API_PORT) || 4200;
export const WEB = `http://localhost:${WEB_PORT}`;
export const API = `http://localhost:${API_PORT}`;
export const DATABASE = process.env.E2E_PGDATABASE || "shahebbazar_e2e";
export const UPLOAD_DIR = path.join(__dirname, ".uploads");
export const API_LOG = path.join(__dirname, "test-results", "api.log");
// The test build gets its own folder, so it never replaces the development build in .next.
export const DIST_DIR = ".next-e2e";

// The API and the tests sign unsubscribe links with the same secret.
process.env.UNSUBSCRIBE_SECRET ||= "e2e-only-unsubscribe-secret";
process.env.OTP_HASH_SECRET ||= "e2e-only-otp-secret";

// Seeded accounts (database/baseline/seed.sql).
export const PHONES = {
    admin: "+8801711000001",
    owner: "+8801711000005", // owns business 1, Rajshahi Mango Traders
    otherVendor: "+8801711000006",
    twoBusinesses: "+8801711000002", // Shaheb Bazar Silk House and Cloth Store (pending)
    customer: "+8801722000001", // has an email address
    customer2: "+8801722000002", // no email address
} as const;
export type Who = keyof typeof PHONES;
