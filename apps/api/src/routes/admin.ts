import { Router, type Request } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import {
  MODEL_ACCESS,
  MODEL_STATUSES,
  MODEL_CAPABILITIES,
  MODEL_TYPES,
  PAYMENT_METHOD_LABELS,
  PLAN_KINDS,
  usdToMicros,
  type PaymentMethodId,
} from "@nova/shared";
import {
  AiModel,
  ApiKey,
  AuditLog,
  Feedback,
  ImageGeneration,
  Payment,
  PaymentMethodConfig,
  Plan,
  Provider,
  ProviderKey,
  RequestLog,
  Subscription,
  Ticket,
  Transaction,
  User,
} from "../db/models";
import { withTransaction } from "../db/connect";
import { encrypt, decrypt } from "../lib/crypto";
import { badRequest, notFound } from "../lib/errors";
import { me, requireAdmin } from "../middleware/auth";
import { imageUpload } from "../middleware/upload";
import { creditWallet, debitWallet, ensureFreeSubscription, getEntitlement, grantTokens, invalidateEntitlement } from "../services/billing";
import { entitlementSummary, publicUser } from "../services/users";
import { fulfillPayment, rejectPayment, serializePayment } from "../services/payments";
import { getSettings, updateSettings, SETTING_DEFAULTS } from "../services/settings";
import { fileUrl, newKey, putFile } from "../services/storage";
import { notify } from "../services/notify";
import { breakdown, parseRange, summary, timeseries } from "../services/analytics";
import { health, invalidateRegistry, registry } from "../gateway/registry";
import { invalidateKeyCache, invalidateUserCache } from "../gateway/context";
import { serializeTicket } from "./social";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const audit = (req: Request, action: string, targetType: string, targetId: string, meta?: unknown) =>
  AuditLog.create({ actorId: me(req)._id, action, targetType, targetId, meta }).catch(() => {});

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest("Invalid id");
  return new Types.ObjectId(id);
};

// ── Overview ────────────────────────────────────────────
adminRouter.get("/stats", async (req, res) => {
  const r = parseRange({ range: String(req.query.range ?? "30d") });
  const since24h = new Date(Date.now() - 86_400_000);
  const [users, newUsers, paying, revenue, revenueSeries, signupSeries, pendingPayments, openTickets, usage, series, reg] = await Promise.all([
    User.countDocuments({ status: { $ne: "deleted" } }),
    User.countDocuments({ createdAt: { $gte: since24h } }),
    Subscription.distinct("userId", { status: "active", priceMicros: { $gt: 0 } }),
    Transaction.aggregate([{ $match: { type: "deposit", createdAt: { $gte: r.from } } }, { $group: { _id: null, total: { $sum: "$amountMicros" }, count: { $sum: 1 } } }]),
    Transaction.aggregate([
      { $match: { type: "deposit", createdAt: { $gte: r.from } } },
      { $group: { _id: { $dateTrunc: { date: "$createdAt", unit: "day" } }, total: { $sum: "$amountMicros" } } },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([{ $match: { createdAt: { $gte: r.from } } }, { $group: { _id: { $dateTrunc: { date: "$createdAt", unit: "day" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Payment.countDocuments({ status: "pending_review" }),
    Ticket.countDocuments({ status: "open" }),
    summary(null, {}, r),
    timeseries(null, {}, r),
    registry(),
  ]);
  const now = Date.now();
  const keys = [...reg.keysByProvider.values()].flat();
  res.json({
    users,
    newUsers24h: newUsers,
    payingUsers: paying.length,
    revenueMicros: revenue[0]?.total ?? 0,
    deposits: revenue[0]?.count ?? 0,
    pendingPayments,
    openTickets,
    usage,
    series,
    revenueSeries: revenueSeries.map((x) => ({ t: new Date(x._id).getTime(), value: x.total })),
    signupSeries: signupSeries.map((x) => ({ t: new Date(x._id).getTime(), value: x.count })),
    providers: [...reg.providers.values()].map((p) => {
      const pk = keys.filter((k) => k.providerId === String(p._id));
      return { id: String(p._id), name: p.name, enabled: p.enabled, keys: pk.length, cooling: pk.filter((k) => (health.get(k.id)?.cooldownUntil ?? 0) > now).length };
    }),
  });
});

adminRouter.get("/usage/breakdown", async (req, res) => {
  const r = parseRange({ range: String(req.query.range ?? "7d") });
  const by = (["model", "vendor", "source"] as const).find((b) => b === req.query.by) ?? "model";
  res.json({ rows: (await breakdown(null, {}, r, by)).map((x) => ({ ...x, name: x.id })) });
});

adminRouter.get("/logs", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const filter: Record<string, unknown> = {};
  if (req.query.status === "error" || req.query.status === "success") filter.status = req.query.status;
  if (typeof req.query.model === "string" && req.query.model) filter.model = req.query.model;
  if (typeof req.query.userId === "string" && Types.ObjectId.isValid(req.query.userId)) filter.userId = new Types.ObjectId(req.query.userId);
  const [rows, total] = await Promise.all([RequestLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), RequestLog.countDocuments(filter)]);
  const users = new Map((await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select("email").lean()).map((u) => [String(u._id), u.email]));
  res.json({
    total,
    page,
    limit,
    logs: rows.map((l) => ({
      id: String(l._id),
      createdAt: l.createdAt,
      user: users.get(String(l.userId)) ?? "",
      userId: String(l.userId),
      model: l.model,
      provider: l.providerName,
      upstreamModel: l.upstreamModel,
      endpoint: l.endpoint,
      source: l.source,
      status: l.status,
      httpStatus: l.httpStatus,
      errorMessage: l.errorMessage,
      billedTokens: l.billedTokens,
      images: l.images,
      costMicros: l.costMicros,
      latencyMs: l.latencyMs,
      attempts: l.attempts,
    })),
  });
});

// ── Users ───────────────────────────────────────────────
adminRouter.get("/users", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 25);
  const filter: Record<string, unknown> = { status: { $ne: "deleted" } };
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ email: rx }, { name: rx }, { referralCode: rx }, ...(Types.ObjectId.isValid(q) ? [{ _id: new Types.ObjectId(q) }] : [])];
  }
  if (req.query.status === "banned") filter.status = "banned";
  const [rows, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), User.countDocuments(filter)]);
  const subs = await Subscription.find({ userId: { $in: rows.map((u) => u._id) }, status: "active", kind: "monthly" }).select("userId planName tokensUsed tokensLimit").lean();
  const subOf = new Map(subs.map((s) => [String(s.userId), s]));
  res.json({
    total,
    page,
    limit,
    users: rows.map((u) => ({
      ...publicUser(u as never),
      status: u.status,
      plan: subOf.get(String(u._id))?.planName ?? "—",
      tokensUsed: subOf.get(String(u._id))?.tokensUsed ?? 0,
      tokensLimit: subOf.get(String(u._id))?.tokensLimit ?? 0,
      lastLoginAt: u.lastLoginAt,
    })),
  });
});

adminRouter.get("/users/:id", async (req, res) => {
  const id = oid(String(req.params.id));
  const user = await User.findById(id).lean();
  if (!user) throw notFound("User not found");
  const r = parseRange({ range: "30d" });
  const [ent, keys, payments, transactions, usage, images] = await Promise.all([
    getEntitlement(id, true),
    ApiKey.find({ userId: id }).sort({ createdAt: -1 }).lean(),
    Payment.find({ userId: id }).sort({ createdAt: -1 }).limit(20).lean(),
    Transaction.find({ userId: id }).sort({ createdAt: -1 }).limit(30).lean(),
    summary(id, {}, r),
    ImageGeneration.countDocuments({ userId: id }),
  ]);
  res.json({
    user: { ...publicUser(user as never), status: user.status, lastLoginAt: user.lastLoginAt, telegramId: user.telegram?.id ?? "" },
    entitlement: entitlementSummary(ent),
    keys: keys.map((k) => ({ id: String(k._id), name: k.name, status: k.status, preview: `${k.start}••••${k.last4}`, requests: k.requests, tokensUsed: k.tokensUsed, lastUsedAt: k.lastUsedAt })),
    payments: payments.map((p) => serializePayment(p as never)),
    transactions: transactions.map((t) => ({ id: String(t._id), createdAt: t.createdAt, wallet: t.wallet, type: t.type, description: t.description, amountMicros: t.amountMicros, tokens: t.tokens })),
    usage30d: usage.current,
    imageGenerations: images,
  });
});

adminRouter.patch("/users/:id", async (req, res) => {
  const body = z.object({ role: z.enum(["user", "admin"]).optional(), status: z.enum(["active", "banned"]).optional(), name: z.string().max(80).optional() }).parse(req.body);
  const id = oid(String(req.params.id));
  if (String(id) === String(me(req)._id) && (body.role === "user" || body.status === "banned")) throw badRequest("You can't demote or ban yourself");
  const user = await User.findByIdAndUpdate(id, { $set: body }, { new: true }).lean();
  if (!user) throw notFound("User not found");
  invalidateUserCache(String(id));
  await audit(req, "user.update", "user", String(id), body);
  res.json({ user: publicUser(user as never) });
});

adminRouter.post("/users/:id/adjust", async (req, res) => {
  const body = z.object({ wallet: z.enum(["main", "image", "tokens"]), amount: z.number().refine((n) => n !== 0, "Amount can't be 0"), note: z.string().trim().min(2).max(200) }).parse(req.body);
  const userId = oid(String(req.params.id));
  if (body.wallet === "tokens") {
    await grantTokens({ userId, tokens: Math.round(body.amount), type: "admin_adjust", description: body.note, method: "Admin" });
  } else {
    const micros = usdToMicros(body.amount);
    if (micros > 0) await creditWallet({ userId, wallet: body.wallet, amountMicros: micros, type: "admin_adjust", description: body.note, method: "Admin" });
    else await debitWallet({ userId, wallet: body.wallet, amountMicros: -micros, type: "admin_adjust", description: body.note });
  }
  invalidateEntitlement(userId);
  await audit(req, "user.adjust", "user", String(userId), body);
  if (body.amount > 0) await notify(userId, { type: "billing", title: body.wallet === "tokens" ? "Tokens added to your account" : "Credit added to your account", body: body.note });
  res.json({ ok: true });
});

adminRouter.post("/users/:id/grant-plan", async (req, res) => {
  const body = z.object({ planId: z.string(), days: z.number().int().min(1).max(3650).default(30) }).parse(req.body);
  const userId = oid(String(req.params.id));
  const plan = await Plan.findById(oid(body.planId)).lean();
  if (!plan) throw notFound("Plan not found");
  await withTransaction(async (session) => {
    if (plan.kind === "monthly") await Subscription.updateMany({ userId, kind: "monthly", status: "active" }, { $set: { status: "cancelled" } }, { session });
    else await Subscription.updateMany({ userId, kind: "pass", status: "active" }, { $set: { status: "cancelled" } }, { session });
    const now = Date.now();
    const term = new Date(now + body.days * 86_400_000);
    await Subscription.create(
      [
        {
          userId,
          planId: plan._id,
          planSlug: plan.slug,
          planName: plan.name,
          kind: plan.kind,
          cycle: plan.isFree ? "free" : plan.kind === "pass" ? "daily" : "monthly",
          priceMicros: 0,
          tokensLimit: plan.tokens,
          rpm: plan.rpm,
          modelAccess: plan.modelAccess,
          startsAt: new Date(now),
          periodEndsAt: new Date(Math.min(term.getTime(), now + 30 * 86_400_000)),
          termEndsAt: term,
          autoRenew: false,
        },
      ],
      { session },
    );
    if (plan.kind === "pass") await ensureFreeSubscription(userId, session);
  });
  invalidateEntitlement(userId);
  await audit(req, "user.grant_plan", "user", String(userId), body);
  await notify(userId, { type: "billing", title: `${plan.name} plan granted`, body: `Active for ${body.days} days.`, link: "/dashboard/billing/plan" }, { email: true });
  res.json({ ok: true });
});

// ── Payments ────────────────────────────────────────────
adminRouter.get("/payments", async (req, res) => {
  const filter: Record<string, unknown> = {};
  const status = String(req.query.status ?? "pending_review");
  if (status !== "all") filter.status = status;
  if (typeof req.query.method === "string" && req.query.method) filter.method = req.query.method;
  if (typeof req.query.id === "string" && Types.ObjectId.isValid(req.query.id)) filter._id = new Types.ObjectId(req.query.id);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const [rows, total, counts] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Payment.countDocuments(filter),
    Payment.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const users = new Map((await User.find({ _id: { $in: rows.map((p) => p.userId) } }).select("email name").lean()).map((u) => [String(u._id), u]));
  const plans = new Map((await Plan.find().select("name").lean()).map((p) => [String(p._id), p.name]));
  res.json({
    total,
    page,
    limit,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    payments: rows.map((p) => ({
      ...serializePayment({ ...p, planName: p.planId ? plans.get(String(p.planId)) : undefined } as never),
      user: { id: String(p.userId), email: users.get(String(p.userId))?.email ?? "", name: users.get(String(p.userId))?.name ?? "" },
      verification: p.verification,
    })),
  });
});

adminRouter.post("/payments/:id/approve", async (req, res) => {
  const body = z.object({ amountUsd: z.number().positive().optional(), note: z.string().max(300).optional() }).parse(req.body);
  const p = await Payment.findById(oid(String(req.params.id))).lean();
  if (!p) throw notFound("Payment not found");
  const amount = body.amountUsd ? usdToMicros(body.amountUsd) : (p.receivedMicros ?? p.amountMicros);
  const out = await fulfillPayment(String(p._id), amount, { reviewerId: me(req)._id, note: body.note || `Approved by admin` });
  if (!out) throw badRequest("This payment was already processed");
  await audit(req, "payment.approve", "payment", String(p._id), { amount, method: p.method });
  res.json({ ok: true });
});

adminRouter.post("/payments/:id/reject", async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, "Give the user a reason").max(300) }).parse(req.body);
  await rejectPayment(String(req.params.id), reason, me(req)._id);
  await audit(req, "payment.reject", "payment", String(req.params.id), { reason });
  res.json({ ok: true });
});

// ── Providers & keys ────────────────────────────────────
adminRouter.get("/providers", async (_req, res) => {
  const [providers, keys] = await Promise.all([Provider.find().sort({ createdAt: 1 }).lean(), ProviderKey.find().sort({ createdAt: 1 }).lean()]);
  const now = Date.now();
  res.json({
    providers: providers.map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      baseUrl: p.baseUrl,
      headers: Object.fromEntries(Object.entries(p.headers ?? {})),
      enabled: p.enabled,
      timeoutMs: p.timeoutMs,
      notes: p.notes,
      keys: keys
        .filter((k) => String(k.providerId) === String(p._id))
        .map((k) => {
          const h = health.get(String(k._id));
          const cooldownUntil = h?.cooldownUntil ?? (k.cooldownUntil ? new Date(k.cooldownUntil).getTime() : 0);
          return {
            id: String(k._id),
            label: k.label,
            last4: k.last4,
            weight: k.weight,
            status: k.status,
            healthy: cooldownUntil <= now,
            cooldownUntil: cooldownUntil > now ? new Date(cooldownUntil) : null,
            failStreak: h?.failStreak ?? k.failStreak,
            lastError: k.lastError,
            lastErrorAt: k.lastErrorAt,
            lastUsedAt: k.lastUsedAt,
            successCount: k.successCount,
            failCount: k.failCount,
          };
        }),
    })),
  });
});

const providerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes").max(40),
  baseUrl: z.string().trim().url(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().min(5_000).max(600_000).optional(),
  notes: z.string().max(500).optional(),
});

adminRouter.post("/providers", async (req, res) => {
  const body = providerSchema.parse(req.body);
  const p = await Provider.create(body);
  invalidateRegistry();
  await audit(req, "provider.create", "provider", String(p._id), { name: body.name });
  res.status(201).json({ id: String(p._id) });
});

adminRouter.patch("/providers/:id", async (req, res) => {
  const body = providerSchema.partial().parse(req.body);
  const p = await Provider.findByIdAndUpdate(oid(String(req.params.id)), { $set: body }, { new: true });
  if (!p) throw notFound("Provider not found");
  invalidateRegistry();
  await audit(req, "provider.update", "provider", String(p._id), body);
  res.json({ ok: true });
});

adminRouter.delete("/providers/:id", async (req, res) => {
  const id = oid(String(req.params.id));
  const used = await AiModel.exists({ "routes.providerId": id });
  if (used) throw badRequest("Remove this provider from all model routes first");
  await Promise.all([Provider.deleteOne({ _id: id }), ProviderKey.deleteMany({ providerId: id })]);
  invalidateRegistry();
  await audit(req, "provider.delete", "provider", String(id));
  res.json({ ok: true });
});

adminRouter.post("/providers/:id/keys", async (req, res) => {
  const body = z.object({ key: z.string().trim().min(4).max(500), label: z.string().max(60).default(""), weight: z.number().min(0).max(100).default(1) }).parse(req.body);
  const providerId = oid(String(req.params.id));
  if (!(await Provider.exists({ _id: providerId }))) throw notFound("Provider not found");
  const k = await ProviderKey.create({ providerId, keyEnc: encrypt(body.key), last4: body.key.slice(-4), label: body.label, weight: body.weight });
  invalidateRegistry();
  await audit(req, "provider_key.create", "provider", String(providerId), { label: body.label });
  res.status(201).json({ id: String(k._id) });
});

adminRouter.patch("/provider-keys/:id", async (req, res) => {
  const body = z.object({ label: z.string().max(60).optional(), weight: z.number().min(0).max(100).optional(), status: z.enum(["active", "disabled"]).optional(), resetHealth: z.boolean().optional() }).parse(req.body);
  const { resetHealth, ...set } = body;
  const update: Record<string, unknown> = { ...set };
  if (resetHealth) Object.assign(update, { failStreak: 0, cooldownUntil: null, lastError: "" });
  const k = await ProviderKey.findByIdAndUpdate(oid(String(req.params.id)), { $set: update }, { new: true });
  if (!k) throw notFound("Key not found");
  if (resetHealth) health.set(String(k._id), { failStreak: 0, cooldownUntil: 0 });
  invalidateRegistry();
  res.json({ ok: true });
});

adminRouter.delete("/provider-keys/:id", async (req, res) => {
  await ProviderKey.deleteOne({ _id: oid(String(req.params.id)) });
  invalidateRegistry();
  await audit(req, "provider_key.delete", "provider_key", String(req.params.id));
  res.json({ ok: true });
});

/** Ping the provider's /models endpoint with its first active key. */
adminRouter.post("/providers/:id/test", async (req, res) => {
  const p = await Provider.findById(oid(String(req.params.id))).lean();
  if (!p) throw notFound("Provider not found");
  const key = await ProviderKey.findOne({ providerId: p._id, status: "active" }).lean();
  if (!key) throw badRequest("Add an active key first");
  const started = Date.now();
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${decrypt(key.keyEnc)}` };
    for (const [k, v] of Object.entries(p.headers ?? {})) headers[k] = String(v);
    const r = await fetch(`${p.baseUrl.replace(/\/$/, "")}/models`, { headers, signal: AbortSignal.timeout(15_000) });
    const text = await r.text();
    let models: string[] = [];
    try {
      models = (JSON.parse(text).data ?? []).map((m: any) => m.id).slice(0, 200);
    } catch {
      /* not JSON */
    }
    res.json({ ok: r.ok, status: r.status, latencyMs: Date.now() - started, models, error: r.ok ? "" : text.slice(0, 300) });
  } catch (err) {
    res.json({ ok: false, status: 0, latencyMs: Date.now() - started, models: [], error: (err as Error).message });
  }
});

// ── Models ──────────────────────────────────────────────
adminRouter.get("/models", async (_req, res) => {
  const models = await AiModel.find().sort({ sort: 1, name: 1 }).lean();
  res.json({ models: models.map((m) => ({ ...m, id: String(m._id), routes: m.routes.map((r) => ({ ...r, id: String(r._id), providerId: String(r.providerId) })) })) });
});

const modelSchema = z.object({
  publicId: z.string().trim().regex(/^[a-zA-Z0-9._:/-]+$/, "Letters, numbers, . _ - : / only").max(100),
  name: z.string().trim().min(1).max(100),
  type: z.enum(MODEL_TYPES),
  vendor: z.string().max(60).default(""),
  description: z.string().max(1000).default(""),
  capabilities: z.array(z.enum(MODEL_CAPABILITIES)).default([]),
  contextLength: z.number().int().min(0).default(128_000),
  maxOutput: z.number().int().min(0).default(16_384),
  access: z.enum(MODEL_ACCESS).default("free"),
  enabled: z.boolean().default(true),
  status: z.enum(MODEL_STATUSES).default("active"),
  featured: z.boolean().default(false),
  sort: z.number().int().default(100),
  /** USD prices from the form; converted to micros */
  pricingUsd: z
    .object({
      inputPer1M: z.number().min(0).default(0),
      outputPer1M: z.number().min(0).default(0),
      cachedInputPer1M: z.number().min(0).default(0),
      perImage: z.object({ "1K": z.number().min(0).default(0), "2K": z.number().min(0).default(0), "4K": z.number().min(0).default(0) }).default({}),
    })
    .default({}),
  routes: z
    .array(z.object({ providerId: z.string(), upstreamModel: z.string().trim().min(1).max(200), priority: z.number().int().min(0).max(100).default(1), weight: z.number().min(0).max(100).default(1), enabled: z.boolean().default(true) }))
    .default([]),
});

function modelDoc(body: z.infer<typeof modelSchema>) {
  const { pricingUsd, routes, ...rest } = body;
  return {
    ...rest,
    pricing: {
      inputPer1M: usdToMicros(pricingUsd.inputPer1M),
      outputPer1M: usdToMicros(pricingUsd.outputPer1M),
      cachedInputPer1M: usdToMicros(pricingUsd.cachedInputPer1M),
      perImage: { "1K": usdToMicros(pricingUsd.perImage["1K"]), "2K": usdToMicros(pricingUsd.perImage["2K"]), "4K": usdToMicros(pricingUsd.perImage["4K"]) },
    },
    routes: routes.map((r) => ({ ...r, providerId: oid(r.providerId) })),
  };
}

adminRouter.post("/models", async (req, res) => {
  const body = modelSchema.parse(req.body);
  const m = await AiModel.create(modelDoc(body));
  invalidateRegistry();
  await audit(req, "model.create", "model", m.publicId);
  res.status(201).json({ id: String(m._id) });
});

adminRouter.put("/models/:id", async (req, res) => {
  const body = modelSchema.parse(req.body);
  const m = await AiModel.findByIdAndUpdate(oid(String(req.params.id)), { $set: modelDoc(body) }, { new: true });
  if (!m) throw notFound("Model not found");
  invalidateRegistry();
  await audit(req, "model.update", "model", m.publicId);
  res.json({ ok: true });
});

adminRouter.patch("/models/:id", async (req, res) => {
  const body = z
    .object({ enabled: z.boolean().optional(), status: z.enum(MODEL_STATUSES).optional(), featured: z.boolean().optional(), sort: z.number().int().optional() })
    .parse(req.body);
  await AiModel.updateOne({ _id: oid(String(req.params.id)) }, { $set: body });
  invalidateRegistry();
  res.json({ ok: true });
});

adminRouter.delete("/models/:id", async (req, res) => {
  const m = await AiModel.findByIdAndDelete(oid(String(req.params.id)));
  invalidateRegistry();
  if (m) await audit(req, "model.delete", "model", m.publicId);
  res.json({ ok: true });
});

// ── Plans ───────────────────────────────────────────────
adminRouter.get("/plans", async (_req, res) => {
  const plans = await Plan.find().sort({ sort: 1 }).lean();
  const counts = await Subscription.aggregate([{ $match: { status: "active" } }, { $group: { _id: "$planId", n: { $sum: 1 } } }]);
  const countOf = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({ plans: plans.map((p) => ({ ...p, id: String(p._id), activeSubscribers: countOf.get(String(p._id)) ?? 0 })) });
});

const planSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).max(40),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(PLAN_KINDS),
  isFree: z.boolean().default(false),
  priceMonthlyUsd: z.number().min(0).default(0),
  priceYearlyUsd: z.number().min(0).default(0),
  pricePassUsd: z.number().min(0).default(0),
  durationHours: z.number().int().min(1).max(24 * 31).default(24),
  tokens: z.number().int().min(0),
  rpm: z.number().int().min(1).max(100_000),
  modelAccess: z.enum(MODEL_ACCESS).default("free"),
  features: z.array(z.string().max(120)).max(20).default([]),
  badge: z.string().max(30).default(""),
  highlight: z.boolean().default(false),
  sort: z.number().int().default(100),
  active: z.boolean().default(true),
});

function planDoc(b: z.infer<typeof planSchema>) {
  const { priceMonthlyUsd, priceYearlyUsd, pricePassUsd, ...rest } = b;
  return { ...rest, priceMonthly: usdToMicros(priceMonthlyUsd), priceYearly: usdToMicros(priceYearlyUsd), pricePass: usdToMicros(pricePassUsd) };
}

adminRouter.post("/plans", async (req, res) => {
  const body = planSchema.parse(req.body);
  if (body.isFree && (await Plan.exists({ isFree: true }))) throw badRequest("There is already a free plan");
  const p = await Plan.create(planDoc(body));
  await audit(req, "plan.create", "plan", p.slug);
  res.status(201).json({ id: String(p._id) });
});

adminRouter.put("/plans/:id", async (req, res) => {
  const body = planSchema.parse(req.body);
  const p = await Plan.findByIdAndUpdate(oid(String(req.params.id)), { $set: planDoc(body) }, { new: true });
  if (!p) throw notFound("Plan not found");
  await audit(req, "plan.update", "plan", p.slug);
  res.json({ ok: true });
});

adminRouter.delete("/plans/:id", async (req, res) => {
  const id = oid(String(req.params.id));
  if (await Subscription.exists({ planId: id, status: "active" })) throw badRequest("This plan has active subscribers. Deactivate it instead.");
  const p = await Plan.findOneAndDelete({ _id: id, isFree: false });
  if (!p) throw badRequest("The free plan can't be deleted");
  await audit(req, "plan.delete", "plan", p.slug);
  res.json({ ok: true });
});

// ── Payment methods ─────────────────────────────────────
adminRouter.get("/payment-methods", async (_req, res) => {
  const rows = await PaymentMethodConfig.find().sort({ sort: 1 }).lean();
  res.json({ methods: rows.map((m) => ({ ...m, id: String(m._id), qrUrl: m.qrImageKey ? fileUrl(m.qrImageKey) : "" })) });
});

adminRouter.patch("/payment-methods/:method", async (req, res) => {
  const body = z
    .object({
      enabled: z.boolean().optional(),
      label: z.string().max(60).optional(),
      instructions: z.string().max(2000).optional(),
      minUsd: z.number().min(0).max(10_000).optional(),
      sort: z.number().int().optional(),
      details: z
        .object({
          payId: z.string().max(100).optional(),
          name: z.string().max(100).optional(),
          address: z.string().max(100).optional(),
          network: z.string().max(60).optional(),
          accountTitle: z.string().max(100).optional(),
          accountNumber: z.string().max(60).optional(),
          iban: z.string().max(60).optional(),
          bankName: z.string().max(100).optional(),
        })
        .optional(),
    })
    .parse(req.body);
  const method = String(req.params.method) as PaymentMethodId;
  if (!(method in PAYMENT_METHOD_LABELS)) throw notFound("Unknown method");
  if (body.details?.address && method === "usdt_bep20" && !/^0x[0-9a-fA-F]{40}$/.test(body.details.address)) throw badRequest("Enter a valid BSC address (0x…)");
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (k !== "details") set[k] = v;
  for (const [k, v] of Object.entries(body.details ?? {})) set[`details.${k}`] = v;
  await PaymentMethodConfig.updateOne({ method }, { $set: set });
  await audit(req, "payment_method.update", "payment_method", method, body);
  res.json({ ok: true });
});

adminRouter.post("/payment-methods/:method/qr", imageUpload.single("image"), async (req, res) => {
  if (!req.file) throw badRequest("Upload an image");
  const key = newKey("public", "qr", req.file.mimetype);
  await putFile(key, req.file.buffer, req.file.mimetype);
  await PaymentMethodConfig.updateOne({ method: String(req.params.method) }, { $set: { qrImageKey: key } });
  res.json({ qrUrl: fileUrl(key) });
});

// ── Settings ────────────────────────────────────────────
adminRouter.get("/settings", async (_req, res) => {
  res.json({ settings: await getSettings(), defaults: SETTING_DEFAULTS });
});

/** Up to 10 answers per quick-reply intent (an empty list turns that intent off). */
const quickAnswers = z.array(z.string().trim().min(1).max(600)).max(10);

adminRouter.patch("/settings", async (req, res) => {
  const body = z
    .object({
      pkrPerUsd: z.number().min(1).max(10_000).optional(),
      statusBanner: z.object({ level: z.enum(["none", "info", "warning", "outage"]), message: z.string().max(300) }).optional(),
      requireTelegramForFree: z.boolean().optional(),
      referralRewardTokens: z.number().int().min(0).max(1_000_000_000).optional(),
      signupBonusTokens: z.number().int().min(0).max(1_000_000_000).optional(),
      utilityModel: z.string().max(100).optional(),
      imageDefaultModel: z.string().max(100).optional(),
      supportEmail: z.string().max(200).optional(),
      announcement: z.string().max(500).optional(),
      quickReplies: z
        .object({
          enabled: z.boolean(),
          greeting: quickAnswers,
          salam: quickAnswers,
          howAreYou: quickAnswers,
          identity: quickAnswers,
          thanks: quickAnswers,
        })
        .optional(),
    })
    .parse(req.body);
  const settings = await updateSettings(body);
  await audit(req, "settings.update", "settings", "-", body);
  res.json({ settings });
});

// ── Support & feedback ──────────────────────────────────
adminRouter.get("/tickets", async (req, res) => {
  const filter: Record<string, unknown> = {};
  const status = String(req.query.status ?? "open");
  if (status !== "all") filter.status = status;
  const rows = await Ticket.find(filter).sort({ lastActivityAt: -1 }).limit(200).lean();
  const users = new Map((await User.find({ _id: { $in: rows.map((t) => t.userId) } }).select("email name").lean()).map((u) => [String(u._id), u]));
  res.json({ tickets: rows.map((t) => ({ ...serializeTicket(t), user: { id: String(t.userId), email: users.get(String(t.userId))?.email ?? "" } })) });
});

adminRouter.get("/tickets/:id", async (req, res) => {
  const t = await Ticket.findById(oid(String(req.params.id))).lean();
  if (!t) throw notFound("Ticket not found");
  const u = await User.findById(t.userId).select("email name").lean();
  res.json({ ticket: { ...serializeTicket(t, true), user: { id: String(t.userId), email: u?.email ?? "", name: u?.name ?? "" } } });
});

adminRouter.post("/tickets/:id/reply", async (req, res) => {
  const { message } = z.object({ message: z.string().trim().min(1).max(10_000) }).parse(req.body);
  const t = await Ticket.findById(oid(String(req.params.id)));
  if (!t) throw notFound("Ticket not found");
  const admin = me(req);
  t.messages.push({ from: "admin", authorId: admin._id, authorName: "Support team", body: message, createdAt: new Date() });
  t.status = "answered";
  t.lastActivityAt = new Date();
  await t.save();
  await notify(t.userId, { type: "support", title: `Support replied to #${t.number}`, body: message.slice(0, 200), link: `/dashboard/support/${t._id}` }, { email: true, telegram: true });
  res.json({ ticket: serializeTicket(t.toObject(), true) });
});

adminRouter.patch("/tickets/:id", async (req, res) => {
  const body = z.object({ status: z.enum(["open", "answered", "closed"]).optional(), priority: z.enum(["low", "normal", "high"]).optional() }).parse(req.body);
  await Ticket.updateOne({ _id: oid(String(req.params.id)) }, { $set: body });
  res.json({ ok: true });
});

adminRouter.get("/feedback", async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.status === "new" || req.query.status === "reviewed") filter.status = req.query.status;
  const rows = await Feedback.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const users = new Map((await User.find({ _id: { $in: rows.map((f) => f.userId) } }).select("email").lean()).map((u) => [String(u._id), u.email]));
  res.json({ feedback: rows.map((f) => ({ id: String(f._id), type: f.type, rating: f.rating, message: f.message, page: f.page, status: f.status, createdAt: f.createdAt, user: users.get(String(f.userId)) ?? "" })) });
});

adminRouter.patch("/feedback/:id", async (req, res) => {
  const { status } = z.object({ status: z.enum(["new", "reviewed"]) }).parse(req.body);
  await Feedback.updateOne({ _id: oid(String(req.params.id)) }, { $set: { status } });
  res.json({ ok: true });
});

adminRouter.get("/audit", async (_req, res) => {
  const rows = await AuditLog.find().sort({ createdAt: -1 }).limit(200).lean();
  const users = new Map((await User.find({ _id: { $in: rows.map((a) => a.actorId) } }).select("email").lean()).map((u) => [String(u._id), u.email]));
  res.json({ entries: rows.map((a) => ({ id: String(a._id), createdAt: a.createdAt, actor: users.get(String(a.actorId)) ?? "", action: a.action, targetType: a.targetType, targetId: a.targetId, meta: a.meta })) });
});

// Revoke a user's API key (abuse handling)
adminRouter.post("/keys/:id/revoke", async (req, res) => {
  const k = await ApiKey.findByIdAndUpdate(oid(String(req.params.id)), { $set: { status: "revoked", revokedAt: new Date() } }, { new: true });
  if (!k) throw notFound("Key not found");
  invalidateKeyCache(k.hash);
  await audit(req, "key.revoke", "api_key", String(k._id));
  res.json({ ok: true });
});
