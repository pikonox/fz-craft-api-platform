import crypto from "node:crypto";
import type { Types } from "mongoose";
import {
  AUTO_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PKR_PAYMENT_METHODS,
  formatUsd,
  microsToPkr,
  usdToMicros,
  type BillingCycle,
  type PaymentMethodId,
  type PaymentPurpose,
} from "@nova/shared";
import { Payment, PaymentMethodConfig, Plan, type PaymentLean } from "../../db/models";
import { withTransaction } from "../../db/connect";
import { HttpError, badRequest, conflict, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { env } from "../../config/env";
import { creditWallet, planPrice, purchasePlan } from "../billing";
import { notify, notifyAdmins } from "../notify";
import { getSetting } from "../settings";
import { fileUrl, newKey, putFile } from "../storage";
import { verifyBep20 } from "./bep20";
import { verifyBinancePay } from "./binancePay";

type Id = Types.ObjectId | string;

const AUTO_EXPIRY_MS = 2 * 3600_000;
const MANUAL_EXPIRY_MS = 72 * 3600_000;
/** Tx must be sent after the order (minus clock skew). Stops claiming someone else's older transfer. */
const SKEW_MS = 10 * 60_000;
/** Auto checks keep retrying for this long before handing over to an admin. */
const AUTO_RETRY_WINDOW_MS = 6 * 3600_000;
const MAX_TOPUP_USD = 10_000;

export async function getMethodConfig(method: PaymentMethodId) {
  const cfg = await PaymentMethodConfig.findOne({ method }).lean();
  if (!cfg || !cfg.enabled) throw badRequest("This payment method is not available right now");
  return cfg;
}

export async function listMethods() {
  const [methods, rate] = await Promise.all([PaymentMethodConfig.find({ enabled: true }).sort({ sort: 1 }).lean(), getSetting("pkrPerUsd")]);
  return {
    pkrPerUsd: rate,
    methods: methods.map((m) => ({
      method: m.method,
      label: m.label,
      currency: m.currency,
      auto: AUTO_PAYMENT_METHODS.includes(m.method as PaymentMethodId),
      details: { ...m.details, address: m.method === "usdt_bep20" ? m.details?.address || env.USDT_BEP20_ADDRESS : m.details?.address },
      qrUrl: m.qrImageKey ? fileUrl(m.qrImageKey) : "",
      instructions: m.instructions,
      minUsd: m.minUsd,
    })),
  };
}

export function serializePayment(p: PaymentLean & { planName?: string } | any) {
  return {
    id: String(p._id),
    method: p.method,
    methodLabel: PAYMENT_METHOD_LABELS[p.method as PaymentMethodId],
    purpose: p.purpose,
    planId: p.planId ? String(p.planId) : null,
    planName: p.planName ?? null,
    cycle: p.cycle,
    amountMicros: p.amountMicros,
    amountPkr: p.amountPkr,
    pkrRate: p.pkrRate,
    receivedMicros: p.receivedMicros,
    reference: p.reference,
    screenshotUrl: p.screenshotKey ? fileUrl(p.screenshotKey) : "",
    userNote: p.userNote,
    status: p.status,
    history: p.history,
    lastError: p.verification?.lastError ?? "",
    rejectReason: p.rejectReason,
    expiresAt: p.expiresAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function createPayment(userId: Id, input: { method: PaymentMethodId; purpose: PaymentPurpose; planId?: string; cycle?: BillingCycle; amountUsd?: number }) {
  const cfg = await getMethodConfig(input.method);
  let amountMicros: number;
  let planId: Types.ObjectId | undefined;
  let cycle: BillingCycle | undefined;

  if (input.purpose === "plan") {
    const plan = await Plan.findById(input.planId).lean();
    if (!plan || !plan.active || plan.isFree) throw notFound("Plan not found");
    cycle = plan.kind === "pass" ? "daily" : input.cycle === "yearly" ? "yearly" : "monthly";
    amountMicros = planPrice(plan, cycle);
    planId = plan._id;
    if (amountMicros <= 0) throw badRequest("This plan has no price for that billing cycle");
  } else {
    const usd = Number(input.amountUsd);
    if (!isFinite(usd) || usd < cfg.minUsd) throw badRequest(`The minimum for ${cfg.label} is $${cfg.minUsd}`);
    if (usd > MAX_TOPUP_USD) throw badRequest(`The maximum top-up is $${MAX_TOPUP_USD.toLocaleString()}`);
    amountMicros = usdToMicros(Math.round(usd * 100) / 100);
  }

  // A unique cents tail on on-chain payments ties a transfer to exactly one order.
  if (input.method === "usdt_bep20") amountMicros += crypto.randomInt(1, 100) * 100;

  // Only one open order per method
  await Payment.updateMany(
    { userId, method: input.method, status: "awaiting_payment" },
    { $set: { status: "cancelled" }, $push: { history: { status: "cancelled", at: new Date(), note: "Replaced by a new order" } } },
  );

  const isPkr = PKR_PAYMENT_METHODS.includes(input.method);
  const rate = isPkr ? await getSetting("pkrPerUsd") : null;
  const payment = await Payment.create({
    userId,
    method: input.method,
    purpose: input.purpose,
    planId,
    cycle,
    amountMicros,
    amountPkr: isPkr && rate ? microsToPkr(amountMicros, rate) : null,
    pkrRate: rate,
    status: "awaiting_payment",
    history: [{ status: "awaiting_payment", at: new Date(), note: "Order created" }],
    expiresAt: new Date(Date.now() + (AUTO_PAYMENT_METHODS.includes(input.method) ? AUTO_EXPIRY_MS : MANUAL_EXPIRY_MS)),
  });
  return payment;
}

export async function submitPayment(
  userId: Id,
  paymentId: string,
  input: { reference: string; note?: string; screenshot?: { buffer: Buffer; mime: string } | null },
) {
  const payment = await Payment.findOne({ _id: paymentId, userId });
  if (!payment) throw notFound("Payment not found");
  if (payment.status !== "awaiting_payment") throw badRequest("This payment was already submitted");
  if (payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
    payment.status = "expired";
    await payment.save();
    throw badRequest("This order expired. Please start a new one.");
  }
  const method = payment.method as PaymentMethodId;
  const auto = AUTO_PAYMENT_METHODS.includes(method);
  let ref = input.reference.trim();
  if (method === "usdt_bep20") ref = ref.toLowerCase();
  if (!ref || ref.length < 4 || ref.length > 128) throw badRequest(auto ? "Enter the transaction hash / Order ID" : "Enter the transaction ID (TID) from your receipt");
  if (!auto && !input.screenshot) throw badRequest("Please upload a screenshot of the payment receipt");

  if (input.screenshot) {
    const key = newKey("private", "payments", input.screenshot.mime, String(userId));
    await putFile(key, input.screenshot.buffer, input.screenshot.mime);
    payment.screenshotKey = key;
  }
  payment.reference = ref;
  payment.referenceKey = `${method}:${ref}`;
  payment.userNote = (input.note ?? "").slice(0, 500);
  payment.status = auto ? "verifying" : "pending_review";
  payment.history.push({ status: payment.status, at: new Date(), note: auto ? "Checking payment automatically" : "Waiting for review" });
  try {
    await payment.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict("This transaction ID has already been used for another payment.");
    throw err;
  }

  if (auto) {
    await verifyPayment(String(payment._id));
  } else {
    await notifyAdmins({
      type: "billing",
      title: `New ${PAYMENT_METHOD_LABELS[method]} payment to review`,
      body: `${formatUsd(payment.amountMicros)}${payment.amountPkr ? ` (Rs ${payment.amountPkr})` : ""} · TID ${ref}`,
      link: `/admin/payments?id=${payment._id}`,
    });
  }
  return Payment.findById(payment._id).lean();
}

/** Check an auto-verified payment once. Safe to call repeatedly (used by cron). */
export async function verifyPayment(paymentId: string) {
  const payment = await Payment.findById(paymentId);
  if (!payment || payment.status !== "verifying") return;
  const method = payment.method as PaymentMethodId;
  const notBefore = payment.createdAt.getTime() - SKEW_MS;
  payment.verification!.attempts = (payment.verification!.attempts ?? 0) + 1;
  payment.verification!.lastCheckedAt = new Date();

  const toReview = async (reason: string) => {
    payment.status = "pending_review";
    payment.verification!.lastError = reason;
    payment.history.push({ status: "pending_review", at: new Date(), note: reason });
    await payment.save();
    await notifyAdmins({ type: "billing", title: `${PAYMENT_METHOD_LABELS[method]} payment needs review`, body: reason, link: `/admin/payments?id=${payment._id}` });
  };
  const backToUser = async (reason: string) => {
    payment.status = "awaiting_payment";
    payment.verification!.lastError = reason;
    payment.referenceKey = undefined;
    payment.history.push({ status: "awaiting_payment", at: new Date(), note: reason });
    await payment.save();
  };
  const tooOld = Date.now() - payment.updatedAt.getTime() > AUTO_RETRY_WINDOW_MS && payment.verification!.attempts > 3;

  if (method === "usdt_bep20") {
    const cfg = await PaymentMethodConfig.findOne({ method }).lean();
    const to = cfg?.details?.address || env.USDT_BEP20_ADDRESS;
    const r = await verifyBep20({ txHash: payment.reference, to, notBefore });
    if (r.status === "failed") return backToUser(r.reason);
    if (r.status === "pending") {
      if (tooOld) return toReview(`Still unconfirmed after 6 hours: ${r.reason}`);
      payment.verification!.lastError = r.reason;
      await payment.save();
      return;
    }
    payment.verification!.data = { confirmations: r.confirmations, blockTime: r.blockTime };
    await payment.save();
    // Exact amount (to the cent) is required so a transfer can't be claimed by another order
    const diff = r.receivedMicros - payment.amountMicros;
    if (diff < -5_000 || diff > 5_000) {
      payment.receivedMicros = r.receivedMicros;
      return toReview(`Amount mismatch: received ${formatUsd(r.receivedMicros, { precision: 4 })}, expected ${formatUsd(payment.amountMicros, { precision: 4 })}.`);
    }
    return fulfillPayment(String(payment._id), r.receivedMicros, { note: `Verified on-chain (${r.confirmations} confirmations)` });
  }

  if (method === "binance_pay") {
    const r = await verifyBinancePay({ orderId: payment.reference, expectedMicros: payment.amountMicros, notBefore });
    if (r.status === "failed") return backToUser(r.reason);
    if (r.status === "mismatch") {
      payment.receivedMicros = r.receivedMicros;
      return toReview(r.reason);
    }
    if (r.status === "pending") {
      if (tooOld || payment.verification!.attempts >= 30) return toReview(`Not found automatically: ${r.reason}`);
      payment.verification!.lastError = r.reason;
      await payment.save();
      return;
    }
    payment.verification!.data = { payer: r.payer };
    await payment.save();
    return fulfillPayment(String(payment._id), r.receivedMicros, { note: "Verified via Binance Pay" });
  }
}

/** Credit the wallet for an approved payment and, for plan orders, activate the plan. Idempotent. */
export async function fulfillPayment(paymentId: string, receivedMicros: number, opts: { reviewerId?: Id; note?: string } = {}) {
  const payment = await withTransaction(async (session) => {
    const p = await Payment.findOneAndUpdate(
      { _id: paymentId, status: { $in: ["verifying", "pending_review", "awaiting_payment"] } },
      {
        $set: { status: "approved", receivedMicros, reviewedBy: opts.reviewerId, reviewedAt: new Date(), "verification.lastError": "" },
        $push: { history: { status: "approved", at: new Date(), note: opts.note ?? "Approved" } },
      },
      { new: true, session },
    );
    if (!p) return null;
    await creditWallet({
      userId: p.userId,
      wallet: p.purpose === "image_wallet" ? "image" : "main",
      amountMicros: receivedMicros,
      type: "deposit",
      description: p.purpose === "image_wallet" ? "Image wallet top-up" : p.purpose === "plan" ? "Plan payment" : "Balance top-up",
      reference: p.reference,
      method: PAYMENT_METHOD_LABELS[p.method as PaymentMethodId],
      paymentId: p._id,
      session,
    });
    return p;
  });
  if (!payment) return null;

  if (payment.purpose === "plan" && payment.planId) {
    try {
      await purchasePlan({ userId: payment.userId, planId: payment.planId, cycle: (payment.cycle as BillingCycle) ?? "monthly" });
      return payment;
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : "the plan couldn't be activated";
      logger.warn({ err, payment: String(payment._id) }, "plan activation after payment failed");
      await notify(
        payment.userId,
        { type: "billing", title: "Payment received", body: `${formatUsd(receivedMicros)} was added to your balance, but ${msg}. You can activate a plan from Plans.`, link: "/dashboard/billing/plan" },
        { email: true, telegram: true },
      );
      return payment;
    }
  }
  await notify(
    payment.userId,
    {
      type: "billing",
      title: "Payment approved",
      body: `${formatUsd(receivedMicros)} was added to your ${payment.purpose === "image_wallet" ? "image wallet" : "balance"}.`,
      link: payment.purpose === "image_wallet" ? "/dashboard/image-studio" : "/dashboard/billing/balance",
    },
    { email: true, telegram: true },
  );
  return payment;
}

export async function rejectPayment(paymentId: string, reason: string, reviewerId: Id) {
  const p = await Payment.findOneAndUpdate(
    { _id: paymentId, status: { $in: ["verifying", "pending_review", "awaiting_payment"] } },
    {
      $set: { status: "rejected", rejectReason: reason, reviewedBy: reviewerId, reviewedAt: new Date() },
      $unset: { referenceKey: 1 },
      $push: { history: { status: "rejected", at: new Date(), note: reason } },
    },
    { new: true },
  );
  if (!p) throw badRequest("This payment can't be rejected");
  await notify(p.userId, { type: "billing", title: "Payment rejected", body: reason, link: `/dashboard/billing/payments/${p._id}` }, { email: true, telegram: true });
  return p;
}

/** Cron: re-check auto payments and expire stale orders. */
export async function processPendingPayments() {
  const verifying = await Payment.find({ status: "verifying", "verification.lastCheckedAt": { $lt: new Date(Date.now() - 45_000) } }).select("_id").limit(100).lean();
  for (const p of verifying) {
    try {
      await verifyPayment(String(p._id));
    } catch (err) {
      logger.warn({ err, payment: String(p._id) }, "payment recheck failed");
    }
  }
  await Payment.updateMany(
    { status: "awaiting_payment", expiresAt: { $lt: new Date() } },
    { $set: { status: "expired" }, $push: { history: { status: "expired", at: new Date(), note: "Order expired" } } },
  );
}
