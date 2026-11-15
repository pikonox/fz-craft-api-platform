// ── API keys ────────────────────────────────────────────
export const API_KEY_SCOPES = ["inference", "models:read", "embeddings", "images"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// ── Models ──────────────────────────────────────────────
export const MODEL_TYPES = ["chat", "image", "embedding"] as const;
export type ModelType = (typeof MODEL_TYPES)[number];

/** Which plans can use a model: free = everyone, paid = any paid plan, early = top tier only */
export const MODEL_ACCESS = ["free", "paid", "early"] as const;
export type ModelAccess = (typeof MODEL_ACCESS)[number];
export const ACCESS_RANK: Record<ModelAccess, number> = { free: 0, paid: 1, early: 2 };

export const MODEL_CAPABILITIES = ["reasoning", "vision", "tools", "streaming", "json"] as const;

/** "maintenance" models stay listed in the catalog but requests return 503 until they are active again. */
export const MODEL_STATUSES = ["active", "maintenance"] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

// ── Plans & billing ─────────────────────────────────────
export const PLAN_KINDS = ["monthly", "pass"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];
export const BILLING_CYCLES = ["monthly", "yearly", "daily", "free"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const WALLETS = ["main", "image"] as const;
export type Wallet = (typeof WALLETS)[number];

export const TRANSACTION_TYPES = [
  "deposit",
  "plan_purchase",
  "plan_refund",
  "plan_credit",
  "image_charge",
  "referral_bonus",
  "signup_bonus",
  "admin_adjust",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

// ── Payments ────────────────────────────────────────────
export const PAYMENT_METHODS = ["binance_pay", "usdt_bep20", "jazzcash", "easypaisa", "bank_transfer"] as const;
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number];

/** Methods that are verified automatically (no admin needed). */
export const AUTO_PAYMENT_METHODS: PaymentMethodId[] = ["binance_pay", "usdt_bep20"];
/** Methods paid in PKR that need a screenshot + admin approval. */
export const PKR_PAYMENT_METHODS: PaymentMethodId[] = ["jazzcash", "easypaisa", "bank_transfer"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodId, string> = {
  binance_pay: "Binance Pay",
  usdt_bep20: "USDT · BEP-20",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  bank_transfer: "Bank transfer",
};

export const PAYMENT_PURPOSES = ["balance", "image_wallet", "plan"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const PAYMENT_STATUSES = [
  "awaiting_payment", // created, user has not submitted a reference yet
  "verifying", // auto method, waiting for confirmations
  "pending_review", // manual method, waiting for admin
  "approved",
  "rejected",
  "expired",
  "cancelled",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ── Image Studio ────────────────────────────────────────
export const IMAGE_QUALITIES = ["1K", "2K", "4K"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export const QUALITY_LONG_SIDE: Record<ImageQuality, number> = { "1K": 1024, "2K": 2048, "4K": 3840 };

export const ASPECT_RATIOS = [
  { id: "1:1", w: 1, h: 1 },
  { id: "16:9", w: 16, h: 9 },
  { id: "9:16", w: 9, h: 16 },
  { id: "3:2", w: 3, h: 2 },
  { id: "2:3", w: 2, h: 3 },
  { id: "4:3", w: 4, h: 3 },
  { id: "3:4", w: 3, h: 4 },
] as const;
export type AspectRatioId = (typeof ASPECT_RATIOS)[number]["id"];

/** Pixel size for an aspect ratio at a quality tier (long side = tier, rounded to /16). */
export function imageDimensions(aspect: AspectRatioId, quality: ImageQuality) {
  const a = ASPECT_RATIOS.find((r) => r.id === aspect) ?? ASPECT_RATIOS[0];
  const long = QUALITY_LONG_SIDE[quality];
  const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
  if (a.w >= a.h) return { width: long, height: round16((long * a.h) / a.w) };
  return { width: round16((long * a.w) / a.h), height: long };
}

/** Quality tier implied by an OpenAI-style "WxH" size string. */
export function qualityForSize(size: string | undefined): ImageQuality {
  const m = /^(\d+)x(\d+)$/.exec(size ?? "");
  if (!m) return "1K";
  const long = Math.max(Number(m[1]), Number(m[2]));
  if (long <= 1536) return "1K";
  if (long <= 2560) return "2K";
  return "4K";
}

export const IMAGE_STYLES = [
  { id: "none", label: "None", suffix: "" },
  { id: "photoreal", label: "Photoreal", suffix: "photorealistic, ultra-detailed, natural lighting, shot on 85mm lens, sharp focus, high dynamic range" },
  { id: "cinematic", label: "Cinematic", suffix: "cinematic film still, dramatic lighting, anamorphic lens, shallow depth of field, rich color grading" },
  { id: "anime", label: "Anime", suffix: "anime illustration, clean line art, vibrant cel shading, expressive, studio quality" },
  { id: "3d", label: "3D render", suffix: "3D render, octane, soft global illumination, glossy materials, studio lighting" },
  { id: "neon", label: "Neon", suffix: "synthwave neon aesthetic, glowing magenta and cyan lights, retro-futuristic, night" },
  { id: "fantasy", label: "Fantasy", suffix: "epic fantasy concept art, magical atmosphere, painterly detail, volumetric light" },
  { id: "watercolor", label: "Watercolor", suffix: "soft watercolor painting, paper texture, gentle washes of color, delicate edges" },
  { id: "product", label: "Product", suffix: "premium product photography, seamless studio backdrop, softbox lighting, crisp reflections" },
  { id: "logo", label: "Logo", suffix: "minimal flat vector logo, simple geometric shapes, bold, centered, plain background" },
  { id: "pixel", label: "Pixel art", suffix: "16-bit pixel art, crisp pixels, limited palette, retro game style" },
] as const;
export type ImageStyleId = (typeof IMAGE_STYLES)[number]["id"];

// ── Referrals ───────────────────────────────────────────
export const REFERRAL_REWARD_TOKENS = 1_000_000;
export const REFERRAL_CODE_WINDOW_DAYS = 7;

// ── Misc ────────────────────────────────────────────────
export const NOTIFICATION_TYPES = ["billing", "usage", "security", "referral", "support", "system"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const TICKET_CATEGORIES = ["billing", "api", "account", "bug", "other"] as const;
export const FEEDBACK_TYPES = ["idea", "bug", "praise", "other"] as const;
