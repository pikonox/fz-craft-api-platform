import type { Request, RequestHandler } from "express";
import { ACCESS_RANK, type ApiKeyScope, type ModelAccess, type ModelType } from "@nova/shared";
import { ApiKey, User, type ApiKeyLean, type ModelLean, type UserLean } from "../db/models";
import { sha256 } from "../lib/crypto";
import { getEntitlement, type Entitlement } from "../services/billing";
import { getSetting, telegramEnabled } from "../services/settings";
import { GatewayError } from "./errors";
import { rateLimiter } from "./ratelimit";
import { getModel } from "./registry";

export type CallerContext = {
  user: UserLean;
  apiKey: ApiKeyLean | null;
  ent: Entitlement;
  source: "api" | "playground" | "studio";
  ip?: string;
  userAgent?: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      gw?: CallerContext;
    }
  }
}

// ── Short-lived caches so the hot path does ~0 DB reads ─
const keyCache = new Map<string, { at: number; key: ApiKeyLean | null }>();
const userCache = new Map<string, { at: number; user: UserLean | null }>();
const KEY_TTL = 10_000;

export function invalidateKeyCache(hash?: string) {
  if (hash) keyCache.delete(hash);
  else keyCache.clear();
}
export function invalidateUserCache(userId?: string) {
  if (userId) userCache.delete(userId);
  else userCache.clear();
}

async function findKey(raw: string) {
  const hash = sha256(raw);
  const hit = keyCache.get(hash);
  if (hit && Date.now() - hit.at < KEY_TTL) return hit.key;
  const key = await ApiKey.findOne({ hash }).lean<ApiKeyLean>();
  keyCache.set(hash, { at: Date.now(), key });
  return key;
}

async function findUser(id: string) {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < KEY_TTL) return hit.user;
  const user = await User.findById(id).lean<UserLean>();
  userCache.set(id, { at: Date.now(), user });
  return user;
}

function extractKey(req: Request) {
  const auth = req.headers.authorization ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const x = req.headers["x-api-key"];
  return typeof x === "string" ? x.trim() : "";
}

const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, "");

/**
 * The caller's plan from an API key, for public endpoints that personalise their answer (e.g.
 * /models.json). Never throws and never counts against rate limits: returns null when there is no
 * usable key.
 */
export async function optionalKeyAccess(req: Request): Promise<{ access: ModelAccess; planName: string; isPaid: boolean } | null> {
  const raw = extractKey(req);
  if (!raw) return null;
  const key = await findKey(raw);
  if (!key || key.status === "revoked" || key.status === "paused") return null;
  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) return null;
  const user = await findUser(String(key.userId));
  if (!user || user.status !== "active") return null;
  const ent = await getEntitlement(user._id);
  return { access: ent.access, planName: ent.pass?.planName ?? ent.monthly?.planName ?? "Free", isPaid: ent.isPaid };
}

/** Authenticates /v1 requests by API key and applies plan + key rate limits. */
export const apiKeyAuth: RequestHandler = async (req, res, next) => {
  const raw = extractKey(req);
  if (!raw) {
    throw new GatewayError(401, "You didn't provide an API key. Pass it as 'Authorization: Bearer YOUR_KEY'.", "invalid_request_error", "missing_api_key");
  }
  const key = await findKey(raw);
  if (!key) throw new GatewayError(401, "Incorrect API key provided.", "invalid_request_error", "invalid_api_key");
  if (key.status === "revoked") throw new GatewayError(401, "This API key has been revoked.", "invalid_request_error", "invalid_api_key");
  if (key.status === "paused") throw new GatewayError(403, "This API key is paused. Resume it in your dashboard.", "permission_error", "key_paused");
  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
    throw new GatewayError(401, "This API key has expired.", "invalid_request_error", "key_expired");
  }
  const ip = normalizeIp(req.ip ?? "");
  if (key.ipAllowlist?.length && !key.ipAllowlist.map(normalizeIp).includes(ip)) {
    throw new GatewayError(403, `Requests from ${ip} are not allowed for this key.`, "permission_error", "ip_not_allowed");
  }
  const user = await findUser(String(key.userId));
  if (!user || user.status !== "active") throw new GatewayError(403, "This account is suspended.", "permission_error", "account_suspended");

  const ent = await getEntitlement(user._id);
  const keyLimit = key.rpm ? Math.min(key.rpm, ent.rpm) : ent.rpm;
  const rl = rateLimiter.hit([
    { key: `k:${key._id}`, limit: keyLimit },
    { key: `u:${user._id}`, limit: ent.rpm },
  ]);
  res.setHeader("x-ratelimit-limit-requests", String(rl.limit));
  res.setHeader("x-ratelimit-remaining-requests", String(Math.max(0, rl.remaining)));
  res.setHeader("x-ratelimit-reset-requests", `${Math.ceil(rl.resetMs / 1000)}s`);
  if (!rl.ok) {
    throw new GatewayError(
      429,
      `Rate limit reached: ${rl.limit} requests per minute. Upgrade your plan for higher limits.`,
      "rate_limit_error",
      "rate_limit_exceeded",
      null,
      { "retry-after": String(Math.ceil(rl.resetMs / 1000)) },
    );
  }

  req.gw = { user, apiKey: key, ent, source: "api", ip, userAgent: String(req.headers["user-agent"] ?? "") };
  next();
};

export function requireScope(scope: ApiKeyScope): RequestHandler {
  return (req, _res, next) => {
    const key = req.gw?.apiKey;
    if (key && !(key.scopes ?? []).includes(scope)) {
      throw new GatewayError(403, `This API key is missing the '${scope}' scope.`, "permission_error", "missing_scope");
    }
    next();
  };
}

/** Validates that the caller can use `modelId` right now. Returns the model. */
export async function preflight(ctx: CallerContext, modelId: unknown, type: ModelType): Promise<ModelLean> {
  if (typeof modelId !== "string" || !modelId) {
    throw new GatewayError(400, "You must provide a model parameter.", "invalid_request_error", "missing_model", "model");
  }
  const model = await getModel(modelId);
  if (!model || !model.enabled) {
    throw new GatewayError(404, `The model '${modelId}' does not exist or you do not have access to it.`, "invalid_request_error", "model_not_found", "model");
  }
  if (model.status === "maintenance") {
    throw new GatewayError(503, `'${modelId}' is under maintenance right now. Please try another model or check back soon.`, "server_error", "model_maintenance", "model");
  }
  if (model.type !== type) {
    throw new GatewayError(400, `'${modelId}' is a ${model.type} model and can't be used on this endpoint.`, "invalid_request_error", "wrong_model_type", "model");
  }
  if (ACCESS_RANK[model.access as ModelAccess] > ACCESS_RANK[ctx.ent.access]) {
    const need = model.access === "early" ? "the top plan" : "a paid plan";
    throw new GatewayError(403, `'${modelId}' requires ${need}. Upgrade in your dashboard to use it.`, "permission_error", "model_not_in_plan", "model");
  }
  const allowed = ctx.apiKey?.allowedModels ?? [];
  if (allowed.length && !allowed.includes(modelId)) {
    throw new GatewayError(403, `This API key is not allowed to use '${modelId}'.`, "permission_error", "model_not_allowed", "model");
  }

  // Images are pay-per-image from the image wallet, so only token usage is gated
  if (type !== "image" && !ctx.ent.isPaid && telegramEnabled() && (await getSetting("requireTelegramForFree")) && !ctx.user.telegram?.verifiedAt) {
    throw new GatewayError(403, "Verify your Telegram account in the dashboard to unlock the free tier.", "permission_error", "telegram_verification_required");
  }

  if (type !== "image") {
    if (ctx.ent.remaining <= 0) {
      throw new GatewayError(
        429,
        "You've used all tokens for this cycle. Upgrade your plan or buy a 24h pass to continue.",
        "insufficient_quota",
        "insufficient_quota",
      );
    }
  }
  const k = ctx.apiKey;
  if (k?.tokenLimit != null && (k.tokensUsed ?? 0) >= k.tokenLimit) {
    throw new GatewayError(429, "This API key has reached its token limit.", "insufficient_quota", "key_token_limit_reached");
  }
  if (k?.spendLimitMicros != null && (k.spendMicros ?? 0) >= k.spendLimitMicros) {
    throw new GatewayError(402, "This API key has reached its spend limit.", "insufficient_quota", "key_spend_limit_reached");
  }
  return model;
}
