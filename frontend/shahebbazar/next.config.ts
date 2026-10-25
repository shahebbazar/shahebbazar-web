import path from "node:path";
import type { NextConfig } from "next";

// The server build (frontend/shahebbazar/Dockerfile sets BUILD_STANDALONE=1) runs behind a proxy (Caddy
// or Traefik) that compresses responses, so it is a self-contained "standalone" app with Next's own compression off.
const serverBuild = process.env.BUILD_STANDALONE === "1";

const nextConfig: NextConfig = {
    // The browser tests build into their own folder (e2e/env.ts), so they never replace this build.
    distDir: process.env.NEXT_DIST_DIR || ".next",
    output: serverBuild ? "standalone" : undefined,
    compress: !serverBuild,
    // The share images read their font files at run time, and the Bangla text shaper (lib/ogText.ts) loads
    // its WebAssembly file beside its own code, so the server build must include them.
    outputFileTracingIncludes: {
        "/og/**": ["./assets/og-fonts/*.ttf", "./node_modules/harfbuzzjs/dist/harfbuzz.{js,wasm}"],
        "/og.png": ["./assets/og-fonts/*.ttf"],
    },
    // Loaded by Node as it is, not bundled, so it finds that WebAssembly file.
    serverExternalPackages: ["harfbuzzjs"],
    // No "X-Powered-By: Next.js" header advertising the software.
    poweredByHeader: false,
    turbopack: {
        // Pins the Turbopack root to this app, since the repo root has its own package-lock.json.
        root: path.resolve(__dirname),
    },
};

export default nextConfig;
