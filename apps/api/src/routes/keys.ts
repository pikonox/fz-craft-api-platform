import { Router } from "express";
import { z } from "zod";
import { API_KEY_SCOPES, usdToMicros } from "@nova/shared";
import { ApiKey } from "../db/models";
import { decrypt, encrypt, sha256 } from "../lib/crypto";
import { badRequest, notFound } from "../lib/errors";
import { me, requireAuth } from "../middleware/auth";
import { createApiKey, generateKeySecret, serializeKey } from "../services/apiKeys";
import { invalidateKeyCache } from "../gateway/context";
import { env } from "../config/env";

export const keysRouter = Router();
keysRouter.use(requireAuth);

const MAX_KEYS = 50;

const limitsSchema = z.object({
  name: z.string().trim().min(1, "Give the key a name").max(60),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
  rpm: z.number().int().min(1).max(100_000).nullable().optional(),
  tokenLimit: z.number().int().min(1).nullable().optional(),
  spendLimitUsd: z.number().min(0.01).max(1_000_000).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  allowedModels: z.array(z.string().max(100)).max(100).optional(),
  ipAllowlist: z.array(z.string().trim().max(64)).max(50).optional(),
});

keysRouter.get("/", async (req, res) => {
  const keys = await ApiKey.find({ userId: me(req)._id }).sort({ createdAt: -1 }).lean();
  const list = keys.map(serializeKey);
  const active = list.filter((k) => k.status !== "revoked");
  res.json({
    keys: list,
    stats: {
      active: active.filter((k) => k.status === "active").length,
      paused: active.filter((k) => k.status === "paused").length,
      revoked: list.length - active.length,
      requests: list.reduce((n, k) => n + k.requests, 0),
      tokens: list.reduce((n, k) => n + k.tokensUsed, 0),
      spendMicros: list.reduce((n, k) => n + k.spendMicros, 0),
      withLimits: active.filter((k) => k.tokenLimit != null || k.spendLimitMicros != null).length,
    },
  });
});

keysRouter.post("/", async (req, res) => {
  const body = limitsSchema.parse(req.body);
  const count = await ApiKey.countDocuments({ userId: me(req)._id, status: { $ne: "revoked" } });
  if (count >= MAX_KEYS) throw badRequest(`You can have up to ${MAX_KEYS} active keys`);
  if (body.expiresAt && body.expiresAt.getTime() < Date.now()) throw badRequest("Expiry must be in the future");
  const { doc, secret } = await createApiKey(me(req)._id, {
    ...body,
    spendLimitMicros: body.spendLimitUsd != null ? usdToMicros(body.spendLimitUsd) : null,
  });
  res.status(201).json({ key: serializeKey(doc.toObject()), secret });
});

keysRouter.patch("/:id", async (req, res) => {
  const body = limitsSchema.partial().extend({ status: z.enum(["active", "paused"]).optional() }).parse(req.body);
  const key = await ApiKey.findOne({ _id: req.params.id, userId: me(req)._id });
  if (!key || key.status === "revoked") throw notFound("Key not found");
  const { spendLimitUsd, ...rest } = body;
  key.set(rest);
  if (spendLimitUsd !== undefined) key.spendLimitMicros = spendLimitUsd === null ? null : usdToMicros(spendLimitUsd);
  await key.save();
  invalidateKeyCache(key.hash);
  res.json({ key: serializeKey(key.toObject()) });
});

keysRouter.get("/:id/reveal", async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.id, userId: me(req)._id }).lean();
  if (!key || key.status === "revoked") throw notFound("Key not found");
  res.json({ secret: decrypt(key.keyEnc) });
});

keysRouter.post("/:id/rotate", async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.id, userId: me(req)._id });
  if (!key || key.status === "revoked") throw notFound("Key not found");
  const oldHash = key.hash;
  const secret = generateKeySecret();
  key.set({ hash: sha256(secret), keyEnc: encrypt(secret), start: secret.slice(0, env.KEY_PREFIX.length + 4), last4: secret.slice(-4) });
  await key.save();
  invalidateKeyCache(oldHash);
  res.json({ key: serializeKey(key.toObject()), secret });
});

keysRouter.post("/:id/revoke", async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.id, userId: me(req)._id });
  if (!key) throw notFound("Key not found");
  key.status = "revoked";
  key.revokedAt = new Date();
  await key.save();
  invalidateKeyCache(key.hash);
  res.json({ key: serializeKey(key.toObject()) });
});
