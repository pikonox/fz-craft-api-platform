import { Router } from "express";
import { z } from "zod";
import { PAYMENT_METHODS, PAYMENT_PURPOSES } from "@nova/shared";
import { Payment, Plan, Subscription, Transaction } from "../db/models";
import { badRequest, notFound } from "../lib/errors";
import { me, requireAuth } from "../middleware/auth";
import { imageUpload } from "../middleware/upload";
import { getEntitlement, invalidateEntitlement, purchasePlan, refundSubscription } from "../services/billing";
import { entitlementSummary } from "../services/users";
import { createPayment, listMethods, serializePayment, submitPayment, verifyPayment } from "../services/payments";
import { getSetting } from "../services/settings";

export const billingRouter = Router();
billingRouter.use(requireAuth);

billingRouter.get("/summary", async (req, res) => {
  const user = me(req);
  const [ent, deposits, spent, pending, txCount, pkrPerUsd] = await Promise.all([
    getEntitlement(user._id, true),
    Transaction.aggregate([{ $match: { userId: user._id, type: "deposit" } }, { $group: { _id: "$wallet", total: { $sum: "$amountMicros" } } }]),
    Transaction.aggregate([{ $match: { userId: user._id, type: { $in: ["plan_purchase", "plan_refund", "plan_credit"] } } }, { $group: { _id: null, total: { $sum: "$amountMicros" } } }]),
    Payment.countDocuments({ userId: user._id, status: { $in: ["awaiting_payment", "verifying", "pending_review"] } }),
    Transaction.countDocuments({ userId: user._id }),
    getSetting("pkrPerUsd"),
  ]);
  const dep = (w: string) => deposits.find((d) => d._id === w)?.total ?? 0;
  res.json({
    mainBalance: user.mainBalance,
    imageBalance: user.imageBalance,
    entitlement: entitlementSummary(ent),
    stats: {
      totalDeposited: dep("main"),
      imageDeposited: dep("image"),
      spentOnPlans: -(spent[0]?.total ?? 0),
      pendingPayments: pending,
      transactions: txCount,
    },
    pkrPerUsd,
  });
});

billingRouter.get("/transactions", async (req, res) => {
  const user = me(req);
  const type = String(req.query.type ?? "all");
  const filter: Record<string, unknown> = { userId: user._id };
  if (type === "deposits") filter.type = "deposit";
  else if (type === "plans") filter.type = { $in: ["plan_purchase", "plan_refund", "plan_credit"] };
  else if (type === "rewards") filter.type = { $in: ["referral_bonus", "signup_bonus"] };
  else if (type === "images") filter.wallet = "image";
  if (req.query.wallet === "image" || req.query.wallet === "main") filter.wallet = req.query.wallet;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const [rows, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Transaction.countDocuments(filter),
  ]);
  res.json({
    transactions: rows.map((t) => ({
      id: String(t._id),
      createdAt: t.createdAt,
      wallet: t.wallet,
      type: t.type,
      description: t.description,
      reference: t.reference || `TX-${String(t._id).slice(-8).toUpperCase()}`,
      method: t.method || (t.type === "plan_purchase" ? "Balance" : t.type === "image_charge" ? "Image wallet" : ""),
      amountMicros: t.amountMicros,
      tokens: t.tokens,
      status: t.status,
      paymentId: t.paymentId ? String(t.paymentId) : null,
    })),
    total,
    page,
    limit,
  });
});

billingRouter.get("/subscriptions", async (req, res) => {
  const subs = await Subscription.find({ userId: me(req)._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({
    subscriptions: subs.map((s) => ({
      id: String(s._id),
      planName: s.planName,
      kind: s.kind,
      cycle: s.cycle,
      priceMicros: s.priceMicros,
      status: s.status,
      startsAt: s.startsAt,
      termEndsAt: s.termEndsAt,
      tokensUsed: s.tokensUsed,
      tokensLimit: s.tokensLimit,
    })),
  });
});

billingRouter.post("/purchase", async (req, res) => {
  const body = z.object({ planId: z.string(), cycle: z.enum(["monthly", "yearly", "daily"]).default("monthly") }).parse(req.body);
  const sub = await purchasePlan({ userId: me(req)._id, planId: body.planId, cycle: body.cycle });
  res.json({ ok: true, subscriptionId: String(sub._id) });
});

billingRouter.post("/refund", async (req, res) => {
  await refundSubscription(me(req)._id);
  res.json({ ok: true });
});

billingRouter.post("/auto-renew", async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  const r = await Subscription.updateOne({ userId: me(req)._id, kind: "monthly", status: "active", priceMicros: { $gt: 0 } }, { $set: { autoRenew: enabled } });
  if (!r.matchedCount) throw badRequest("You don't have a paid plan");
  invalidateEntitlement(me(req)._id);
  res.json({ ok: true });
});

// ── Payments ────────────────────────────────────────────

billingRouter.get("/payment-methods", async (_req, res) => {
  res.json(await listMethods());
});

billingRouter.post("/payments", async (req, res) => {
  const body = z
    .object({
      method: z.enum(PAYMENT_METHODS),
      purpose: z.enum(PAYMENT_PURPOSES),
      planId: z.string().optional(),
      cycle: z.enum(["monthly", "yearly", "daily"]).optional(),
      amountUsd: z.number().optional(),
    })
    .parse(req.body);
  const p = await createPayment(me(req)._id, body);
  res.status(201).json({ payment: serializePayment(await withPlanName(p.toObject())) });
});

async function withPlanName<T extends { planId?: unknown }>(p: T): Promise<any> {
  if (!p.planId) return p as any;
  const plan = await Plan.findById(p.planId).select("name").lean();
  return { ...p, planName: plan?.name };
}

billingRouter.get("/payments", async (req, res) => {
  const rows = await Payment.find({ userId: me(req)._id }).sort({ createdAt: -1 }).limit(100).lean();
  const plans = new Map((await Plan.find().select("name").lean()).map((p) => [String(p._id), p.name]));
  res.json({ payments: rows.map((p) => serializePayment({ ...p, planName: p.planId ? plans.get(String(p.planId)) : undefined })) });
});

billingRouter.get("/payments/:id", async (req, res) => {
  const p = await Payment.findOne({ _id: req.params.id, userId: me(req)._id }).lean();
  if (!p) throw notFound("Payment not found");
  const methods = await listMethods();
  res.json({ payment: serializePayment(await withPlanName(p)), method: methods.methods.find((m) => m.method === p.method) ?? null, pkrPerUsd: methods.pkrPerUsd });
});

billingRouter.post("/payments/:id/submit", imageUpload.single("screenshot"), async (req, res) => {
  const body = z.object({ reference: z.string().trim().min(1, "Enter the transaction ID").max(128), note: z.string().max(500).optional() }).parse(req.body);
  const p = await submitPayment(me(req)._id, String(req.params.id), {
    reference: body.reference,
    note: body.note,
    screenshot: req.file ? { buffer: req.file.buffer, mime: req.file.mimetype } : null,
  });
  res.json({ payment: p ? serializePayment(await withPlanName(p)) : null });
});

billingRouter.post("/payments/:id/recheck", async (req, res) => {
  const p = await Payment.findOne({ _id: req.params.id, userId: me(req)._id }).lean();
  if (!p) throw notFound("Payment not found");
  if (p.status === "verifying") {
    const last = p.verification?.lastCheckedAt ? new Date(p.verification.lastCheckedAt).getTime() : 0;
    if (Date.now() - last > 10_000) await verifyPayment(String(p._id));
  }
  const fresh = await Payment.findById(p._id).lean();
  res.json({ payment: serializePayment(await withPlanName(fresh!)) });
});

billingRouter.post("/payments/:id/cancel", async (req, res) => {
  const r = await Payment.updateOne(
    { _id: req.params.id, userId: me(req)._id, status: "awaiting_payment" },
    { $set: { status: "cancelled" }, $push: { history: { status: "cancelled", at: new Date(), note: "Cancelled by you" } } },
  );
  if (!r.modifiedCount) throw badRequest("This payment can't be cancelled");
  res.json({ ok: true });
});
