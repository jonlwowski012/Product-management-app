import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { sourceConnector } from "./lib/source-connector-config";
const config: NextConfig = {
  poweredByHeader: false,
  webpack(config) {
    // Avoid large disk caches on storage-constrained development machines.
    if (process.env.EVIDENCE_BUILD_NO_CACHE === "1") config.cache = false;
    return config;
  },
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/**": [
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "node_modules/@napi-rs/canvas*/**/*",
    ],
  },
  distDir: process.env.E2E_TEST_MODE === "1" ? ".next-e2e" : ".next",
  typescript: {
    tsconfigPath:
      process.env.E2E_TEST_MODE === "1" ? "tsconfig.e2e.json" : "tsconfig.json",
  },
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    const contentSecurityPolicy = (picker: boolean) => ({
      key: "Content-Security-Policy",
      value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""} ${picker ? "https://apis.google.com" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${process.env.VERCEL === "1" ? "https://vercel.com/api/blob/ https://*.blob.vercel-storage.com" : ""} ${process.env.E2E_TEST_MODE === "1" && process.env.NODE_ENV === "development" ? "https://vercel.com/api/blob/ https://*.blob.vercel-storage.com http://127.0.0.1:3102" : ""}; ${picker ? "frame-src https://docs.google.com https://drive.google.com; " : ""}frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    });
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          contentSecurityPolicy(false),
        ],
      },
      ...(sourceConnector("google-drive")
        ? [
            "/",
            "/reports/:path*",
            "/settings/:path*",
            "/customers/:path*",
            "/signals/:path*",
            "/demo/:path*",
            "/admin/beta",
            "/pricing",
            "/privacy",
            "/terms",
            "/help",
          ].map((source) => ({
            source,
            headers: [contentSecurityPolicy(true)],
          }))
        : []),
    ];
  },
};
export default process.env.JOB_RUNNER === "workflow"
  ? withWorkflow(config, { workflows: { sourcemap: false } })
  : config;
