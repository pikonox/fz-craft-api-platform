import type { NextConfig } from "next";
import path from "node:path";
import fs from "node:fs";

// Share the monorepo root .env with the web app (NEXT_PUBLIC_* values, API_INTERNAL_URL)
const rootEnv = path.resolve(__dirname, "../../.env");
if (fs.existsSync(rootEnv)) {
  try {
    process.loadEnvFile(rootEnv);
  } catch {
    /* ignore */
  }
}

const api = process.env.API_INTERNAL_URL || "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@nova/shared"],
  poweredByHeader: false,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME || process.env.BRAND_NAME || "FZ-craft",
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || process.env.PUBLIC_API_BASE_URL || "https://fzcraft.pikonox.com/v1",
    NEXT_PUBLIC_KEY_PREFIX: process.env.KEY_PREFIX || "fz_live_",
    NEXT_PUBLIC_IMAGE_RETENTION_HOURS: process.env.IMAGE_RETENTION_HOURS || "48",
    // Legal pages (/legal/*): who operates the service, governing law and the contact address
    NEXT_PUBLIC_LEGAL_ENTITY: process.env.LEGAL_ENTITY || "",
    NEXT_PUBLIC_LEGAL_COUNTRY: process.env.LEGAL_COUNTRY || "Pakistan",
    NEXT_PUBLIC_LEGAL_EMAIL: process.env.LEGAL_EMAIL || "",
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: [process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_ID].map((v) => v?.trim()).find(Boolean) ?? "",
  },
  async rewrites() {
    // The Express server owns /api, /v1 (public API) and /files (generated images)
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/v1/:path*", destination: `${api}/v1/:path*` },
      { source: "/files/:path*", destination: `${api}/files/:path*` },
      // Public model list for apps and extensions (built live from the database)
      { source: "/models.json", destination: `${api}/api/models.json` },
      { source: "/model.json", destination: `${api}/api/models.json` },
    ];
  },
};

export default nextConfig;
