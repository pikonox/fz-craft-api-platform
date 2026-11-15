import type { Types } from "mongoose";
import { API_KEY_SCOPES, type ApiKeyScope } from "@nova/shared";
import { ApiKey } from "../db/models";
import { env } from "../config/env";
import { encrypt, randomBase62, sha256 } from "../lib/crypto";

export function generateKeySecret() {
  return `${env.KEY_PREFIX}${randomBase62(40)}`;
}

export async function createApiKey(
  userId: Types.ObjectId | string,
  opts: {
    name: string;
    scopes?: ApiKeyScope[];
    rpm?: number | null;
    tokenLimit?: number | null;
    spendLimitMicros?: number | null;
    expiresAt?: Date | null;
    allowedModels?: string[];
    ipAllowlist?: string[];
  },
) {
  const secret = generateKeySecret();
  const doc = await ApiKey.create({
    userId,
    name: opts.name,
    start: secret.slice(0, env.KEY_PREFIX.length + 4),
    last4: secret.slice(-4),
    hash: sha256(secret),
    keyEnc: encrypt(secret),
    scopes: opts.scopes?.length ? opts.scopes : [...API_KEY_SCOPES],
    rpm: opts.rpm ?? null,
    tokenLimit: opts.tokenLimit ?? null,
    spendLimitMicros: opts.spendLimitMicros ?? null,
    expiresAt: opts.expiresAt ?? null,
    allowedModels: opts.allowedModels ?? [],
    ipAllowlist: opts.ipAllowlist ?? [],
  });
  return { doc, secret };
}

export function serializeKey(k: any) {
  return {
    id: String(k._id),
    name: k.name,
    preview: `${k.start}••••••••${k.last4}`,
    scopes: k.scopes,
    rpm: k.rpm,
    tokenLimit: k.tokenLimit,
    spendLimitMicros: k.spendLimitMicros,
    expiresAt: k.expiresAt,
    allowedModels: k.allowedModels ?? [],
    ipAllowlist: k.ipAllowlist ?? [],
    status: k.expiresAt && new Date(k.expiresAt).getTime() < Date.now() && k.status === "active" ? "expired" : k.status,
    revokedAt: k.revokedAt ?? null,
    requests: k.requests ?? 0,
    tokensUsed: k.tokensUsed ?? 0,
    spendMicros: k.spendMicros ?? 0,
    lastUsedAt: k.lastUsedAt ?? null,
    createdAt: k.createdAt,
  };
}
