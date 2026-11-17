import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the monorepo root .env (and an optional apps/api/.env) before parsing.
const here = path.dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(here, "../../.env"),
  path.resolve(here, "../../../../.env"),
  path.resolve(process.cwd(), "../../.env"),
]) {
  if (fs.existsSync(candidate)) {
    try {
      process.loadEnvFile(candidate);
    } catch {
      /* ignore malformed */
    }
  }
}

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  BRAND_NAME: z.string().default("FZ-craft"),
  KEY_PREFIX: z.string().default("fz_live_"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Base URL users put in their SDKs; shown in docs and samples. */
  PUBLIC_API_BASE_URL: z.string().url().default("https://fzcraft.pikonox.com/v1"),
  API_PORT: z.coerce.number().default(4000),
  /** Interface to listen on. Empty = all interfaces (local dev); "127.0.0.1" on a server behind nginx/Caddy. */
  API_HOST: z.string().trim().default(""),
  MONGODB_URI: z.string().default("mongodb://localhost:27017/nova?replicaSet=rs0&directConnection=true"),
  SESSION_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex chars (openssl rand -hex 32)"),
  ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_PASSWORD: z.string().default("Admin@12345"),
  GOOGLE_CLIENT_ID: z.string().trim().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  MAIL_FROM: z.string().default("FZ-craft <no-reply@fzcraft.pikonox.com>"),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_BOT_USERNAME: z.string().optional().default(""),
  BSC_RPC_URL: z.string().default("https://bsc-dataseed.binance.org"),
  USDT_BEP20_CONTRACT: z.string().default("0x55d398326f99059fF775485246999027B3197955"),
  USDT_BEP20_ADDRESS: z.string().optional().default(""),
  BSC_MIN_CONFIRMATIONS: z.coerce.number().default(5),
  BINANCE_API_KEY: z.string().optional().default(""),
  BINANCE_API_SECRET: z.string().optional().default(""),
  SEARCH_API_KEY: z.string().optional().default(""),
  STORAGE_DRIVER: z.enum(["local", "s3", "cloudinary"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_PUBLIC_URL: z.string().optional().default(""),
  /** cloudinary://API_KEY:API_SECRET@CLOUD_NAME (Cloudinary dashboard → API Keys) */
  CLOUDINARY_URL: z.string().trim().optional().default(""),
  CLOUDINARY_FOLDER: z.string().trim().default("fz-craft"),
  /** Generated images are deleted (files + gallery records) after this many hours. */
  IMAGE_RETENTION_HOURS: z.coerce.number().positive().default(48),
  /** Your upstream AI provider (OpenAI-compatible). `pnpm seed` routes every catalog model to it. */
  UPSTREAM_NAME: z.string().trim().default("Main provider"),
  UPSTREAM_BASE_URL: z
    .string()
    .trim()
    .default("")
    .refine((v) => !v || /^https?:\/\//.test(v), "must start with http:// or https://"),
  /** One key, or several separated by commas (requests are load-balanced across them). */
  UPSTREAM_API_KEYS: z.string().trim().default(""),
  /** Provider for the free models (FREE_MODELS in scripts/catalog.ts). `pnpm seed` routes only those models to it. */
  FREE_UPSTREAM_NAME: z.string().trim().default("Free-tier provider"),
  FREE_UPSTREAM_BASE_URL: z
    .string()
    .trim()
    .default("")
    .refine((v) => !v || /^https?:\/\//.test(v), "must start with http:// or https://"),
  FREE_UPSTREAM_API_KEYS: z.string().trim().default(""),
  ENABLE_MOCK_PROVIDER: bool,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
