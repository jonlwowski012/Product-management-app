import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://vercel.com/api/blob/ https://*.blob.vercel-storage.com ${process.env.E2E_TEST_MODE === "1" && process.env.NODE_ENV === "development" ? "http://127.0.0.1:3102" : ""}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
export default withWorkflow(config, { workflows: { sourcemap: false } });
