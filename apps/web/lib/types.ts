// Response shapes from the Express API (see apps/api/src/routes)

export type User = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: "user" | "admin";
  emailVerified: boolean;
  telegram: { verified: boolean; username: string };
  referralCode: string;
  mainBalance: number;
  imageBalance: number;
  bonusTokens: number;
  defaults: { model: string; maxTokens: number; temperature: number; timezone: string };
  notificationPrefs: { emailBilling: boolean; emailUsage: boolean; emailSecurity: boolean; emailProduct: boolean; telegram: boolean };
  twoFactorEnabled: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  createdAt: string;
};

export type SubSummary = {
  id: string;
  name: string;
  slug: string;
  kind: "monthly" | "pass";
  cycle: "monthly" | "yearly" | "daily" | "free";
  priceMicros: number;
  tokensLimit: number;
  tokensUsed: number;
  rpm: number;
  modelAccess: "free" | "paid" | "early";
  startsAt: string;
  periodEndsAt: string;
  termEndsAt: string;
  autoRenew: boolean;
  refundableUntil: string | null;
  isFree: boolean;
};

export type Entitlement = {
  plan: SubSummary | null;
  pass: SubSummary | null;
  bonusTokens: number;
  totalTokens: number;
  usedTokens: number;
  remainingTokens: number;
  rpm: number;
  access: "free" | "paid" | "early";
  isPaid: boolean;
};

export type MeResponse = { user: User; entitlement: Entitlement };

export type Totals = {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  billedTokens: number;
  images: number;
  costMicros: number;
  latencyAvgMs: number;
};

export type Summary = { current: Totals; previous: Totals; latency: { p50: number; p95: number; ttftAvg: number } };

export type SeriesPoint = {
  t: number;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  billedTokens: number;
  images: number;
  costMicros: number;
};

export type Timeseries = { unit: "minute" | "hour" | "day"; points: SeriesPoint[] };

export type BreakdownRow = Omit<Totals, "reasoningTokens"> & { id: string | null; name: string };

export type LogRow = {
  id: string;
  createdAt: string;
  model: string;
  vendor: string;
  endpoint: string;
  source: string;
  keyId: string | null;
  keyName: string;
  status: "success" | "error";
  httpStatus: number;
  errorCode: string;
  errorMessage: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  billedTokens: number;
  images: number;
  costMicros: number;
  latencyMs: number;
  ttftMs: number | null;
  stream: boolean;
  estimated: boolean;
};

export type ModelInfo = {
  id: string;
  name: string;
  type: "chat" | "image" | "embedding";
  vendor: string;
  description: string;
  capabilities: ("reasoning" | "vision" | "tools" | "streaming" | "json")[];
  contextLength: number;
  maxOutput: number;
  access: "free" | "paid" | "early";
  /** "maintenance" models are listed but requests return 503 */
  status: "active" | "maintenance";
  featured: boolean;
  pricing: { inputPer1M: number; outputPer1M: number; cachedInputPer1M: number; perImage: { "1K": number; "2K": number; "4K": number } };
  available: boolean;
};

export type ApiKeyInfo = {
  id: string;
  name: string;
  preview: string;
  scopes: string[];
  rpm: number | null;
  tokenLimit: number | null;
  spendLimitMicros: number | null;
  expiresAt: string | null;
  allowedModels: string[];
  ipAllowlist: string[];
  status: "active" | "paused" | "revoked" | "expired";
  revokedAt: string | null;
  requests: number;
  tokensUsed: number;
  spendMicros: number;
  lastUsedAt: string | null;
  createdAt: string;
};

export type Plan = {
  id: string;
  slug: string;
  name: string;
  kind: "monthly" | "pass";
  isFree: boolean;
  priceMonthly: number;
  priceYearly: number;
  pricePass: number;
  durationHours: number;
  tokens: number;
  rpm: number;
  modelAccess: "free" | "paid" | "early";
  features: string[];
  badge: string;
  highlight: boolean;
};

export type PaymentMethodInfo = {
  method: "binance_pay" | "usdt_bep20" | "jazzcash" | "easypaisa" | "bank_transfer";
  label: string;
  currency: "USDT" | "PKR";
  auto: boolean;
  details: Partial<Record<"payId" | "name" | "address" | "network" | "accountTitle" | "accountNumber" | "iban" | "bankName", string>>;
  qrUrl: string;
  instructions: string;
  minUsd: number;
};

export type Payment = {
  id: string;
  method: PaymentMethodInfo["method"];
  methodLabel: string;
  purpose: "balance" | "image_wallet" | "plan";
  planId: string | null;
  planName: string | null;
  cycle: string | null;
  amountMicros: number;
  amountPkr: number | null;
  pkrRate: number | null;
  receivedMicros: number | null;
  reference: string;
  screenshotUrl: string;
  userNote: string;
  status: "awaiting_payment" | "verifying" | "pending_review" | "approved" | "rejected" | "expired" | "cancelled";
  history: { status: string; at: string; note?: string }[];
  lastError: string;
  rejectReason: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Notification = { id: string; type: string; title: string; body: string; link: string; readAt: string | null; createdAt: string };
