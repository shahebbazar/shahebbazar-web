import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // The browser tests build into their own folder (e2e/env.ts), so they never replace this build.
    distDir: process.env.NEXT_DIST_DIR || ".next",
    turbopack: {
        // Pins the Turbopack root to this app, since the repo root has its own package-lock.json.
        root: path.resolve(__dirname),
    },
};

export default nextConfig;
