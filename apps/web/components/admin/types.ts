// Response shapes of /api/admin/* (see apps/api/src/routes/admin.ts)
import type { Entitlement, Payment, Summary, Timeseries, Totals, User } from "@/lib/types";

export type PaymentStatus = Payment["status"];
export type PaymentMethodId = Payment["method"];
export type Access = "free" | "paid" | "early";

export type AdminStats = {
  users: number;
  newUsers24h: number;
  payingUsers: number;
  revenueMicros: number;
  deposits: number;
  pendingPayments: number;
  openTickets: number;
  usage: Summary;
  series: Timeseries;
  revenueSeries: { t: number; value: number }[];
  signupSeries: { t: number; value: number }[];
  providers: { id: string; name: string; enabled: boolean; keys: number; cooling: number }[];
};

export type AdminBreakdownRow = Omit<Totals, "reasoningTokens"> & { id: string; name: string };

export type AdminPayment = Payment & {
  user: { id: string; email: string; name: string };
  verification?: { attempts?: number; lastCheckedAt?: string; lastError?: string; data?: unknown };
};

export type AdminPaymentsResponse = {
  total: number;
  page: number;
  limit: number;
  counts: Partial<Record<PaymentStatus, number>>;
  payments: AdminPayment[];
};

export type AdminUserRow = User & {
  status: "active" | "banned" | "deleted";
  plan: string;
  tokensUsed: number;
  tokensLimit: number;
  lastLoginAt: string | null;
};

export type AdminUsersResponse = { total: number; page: number; limit: number; users: AdminUserRow[] };

export type AdminUserKey = { id: string; name: string; status: "active" | "paused" | "revoked"; preview: string; requests: number; tokensUsed: number; lastUsedAt: string | null };

export type AdminTransaction = { id: string; createdAt: string; wallet: "main" | "image" | "tokens"; type: string; description: string; amountMicros: number; tokens: number };

export type AdminUserDetail = {
  user: User & { status: "active" | "banned" | "deleted"; lastLoginAt: string | null; telegramId: string };
  entitlement: Entitlement;
  keys: AdminUserKey[];
  payments: Payment[];
  transactions: AdminTransaction[];
  usage30d: Totals;
  imageGenerations: number;
};

export type ProviderKey = {
  id: string;
  label: string;
  last4: string;
  weight: number;
  status: "active" | "disabled";
  healthy: boolean;
  cooldownUntil: string | null;
  failStreak: number;
  lastError: string;
  lastErrorAt?: string | null;
  lastUsedAt?: string | null;
  successCount: number;
  failCount: number;
};

export type Provider = {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  headers: Record<string, string>;
  enabled: boolean;
  timeoutMs: number;
  notes: string;
  keys: ProviderKey[];
};

export type ProviderTest = { ok: boolean; status: number; latencyMs: number; models: string[]; error: string };

export type ModelRoute = { id?: string; providerId: string; upstreamModel: string; priority: number; weight: number; enabled: boolean };

export type AdminModel = {
  id: string;
  publicId: string;
  name: string;
  type: "chat" | "image" | "embedding";
  vendor: string;
  description: string;
  capabilities: ("reasoning" | "vision" | "tools" | "streaming" | "json")[];
  contextLength: number;
  maxOutput: number;
  access: Access;
  enabled: boolean;
  /** "maintenance" models stay listed but return 503 until switched back. */
  status?: "active" | "maintenance";
  featured: boolean;
  sort: number;
  pricing: { inputPer1M?: number; outputPer1M?: number; cachedInputPer1M?: number; perImage?: Partial<Record<"1K" | "2K" | "4K", number>> };
  routes: ModelRoute[];
};

export type AdminPlan = {
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
  modelAccess: Access;
  features: string[];
  badge: string;
  highlight: boolean;
  sort: number;
  active: boolean;
  activeSubscribers: number;
};

export type MethodDetails = Partial<Record<"payId" | "name" | "address" | "network" | "accountTitle" | "accountNumber" | "iban" | "bankName", string>>;

export type AdminPaymentMethod = {
  id: string;
  method: PaymentMethodId;
  enabled: boolean;
  label: string;
  currency: "USDT" | "PKR";
  details: MethodDetails;
  qrUrl: string;
  instructions: string;
  minUsd: number;
  sort: number;
};

export type AdminSettings = {
  pkrPerUsd: number;
  statusBanner: { level: "none" | "info" | "warning" | "outage"; message: string };
  requireTelegramForFree: boolean;
  referralRewardTokens: number;
  signupBonusTokens: number;
  utilityModel: string;
  imageDefaultModel: string;
  supportEmail: string;
  announcement: string;
  quickReplies: QuickReplies;
  adminAlerts: AdminAlerts;
  upstreamPool: UpstreamPoolSettings;
};

/** Who gets admin emails ("" = every admin account's email) and which ones are sent. */
export type AdminAlerts = { email: string; sales: boolean; upstream: boolean };

/** The shared upstream account (FreeModel) all paid models are served from. Micros = USD × 1,000,000. */
export type UpstreamPoolSettings = {
  providerSlug: string;
  tokens: number;
  periodStart: string;
  periodDays: number;
  imageBudgetMicros: number;
  imageBudgetSince: string;
  imageCostMicros: number;
  alertPercent: number;
};

export type UpstreamPoolStatus = {
  settings: UpstreamPoolSettings;
  provider: { id: string; name: string; slug: string } | null;
  providers: { slug: string; name: string }[];
  /** source "live" = read from the upstream's own response headers; "estimate" = counted from our logs */
  tokens: {
    used: number;
    limit: number;
    pct: number;
    requests: number;
    source: "live" | "estimate";
    updatedAt: string | null;
    windowStart: string | null;
    windowEnd: string | null;
    runsOutAt: string | null;
  } | null;
  images: { count: number; spentMicros: number; budgetMicros: number; pct: number; since: string } | null;
  sold: { tokens: number; plans: number; passes: number };
  keyProblem: { message: string; at: string; coolingDown: boolean } | null;
};

export type QuickIntent = "greeting" | "salam" | "howAreYou" | "identity" | "thanks";
/** Instant answers (no provider call) for messages that are only a greeting, identity question or thanks. */
export type QuickReplies = { enabled: boolean } & Record<QuickIntent, string[]>;

export type TicketStatus = "open" | "answered" | "closed";
export type TicketPriority = "low" | "normal" | "high";

export type AdminTicket = {
  id: string;
  number: number;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  lastActivityAt: string;
  createdAt: string;
  messageCount: number;
  lastMessage: { from: "user" | "admin"; body: string } | null;
  user: { id: string; email: string; name?: string };
  messages?: { id: string; from: "user" | "admin"; authorName: string; body: string; createdAt: string }[];
};

export type AdminFeedback = { id: string; type: string; rating: number | null; message: string; page: string; status: "new" | "reviewed"; createdAt: string; user: string };

export type AuditEntry = { id: string; createdAt: string; actor: string; action: string; targetType: string; targetId: string; meta?: unknown };

export type AdminLog = {
  id: string;
  createdAt: string;
  user: string;
  userId: string;
  model: string;
  provider: string;
  upstreamModel: string;
  endpoint: string;
  source: string;
  status: "success" | "error";
  httpStatus: number;
  errorMessage: string;
  billedTokens: number;
  images: number;
  costMicros: number;
  latencyMs: number;
  attempts: number;
};

export type AdminLogsResponse = { total: number; page: number; limit: number; logs: AdminLog[] };
