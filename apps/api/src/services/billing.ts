import type { ClientSession, Types } from "mongoose";
import { ACCESS_RANK, formatTokens, formatUsd, type BillingCycle, type ModelAccess, type TransactionType } from "@nova/shared";
import { Plan, Subscription, Transaction, User, type PlanLean, type SubscriptionLean } from "../db/models";
import { withTransaction } from "../db/connect";
import { HttpError, badRequest, notFound } from "../lib/errors";
import { notify } from "./notify";
import { logger } from "../lib/logger";

const DAY = 24 * 3600 * 1000;
const PERIOD_MS = 30 * DAY;
const YEAR_MS = 365 * DAY;

type Id = Types.ObjectId | string;

// ── Wallets ─────────────────────────────────────────────

export async function creditWallet(args: {
  userId: Id;
  wallet: "main" | "image";
  amountMicros: number;
  type: TransactionType;
  description: string;
  reference?: string;
  method?: string;
  paymentId?: Id;
  meta?: unknown;
  session?: ClientSession;
}) {
  const field = args.wallet === "main" ? "mainBalance" : "imageBalance";
  const user = await User.findByIdAndUpdate(args.userId, { $inc: { [field]: args.amountMicros } }, { new: true, session: args.session });
  if (!user) throw notFound("User not found");
  await Transaction.create(
    [
      {
        userId: args.userId,
        wallet: args.wallet,
        type: args.type,
        amountMicros: args.amountMicros,
        balanceAfter: user[field],
        description: args.description,
        reference: args.reference ?? "",
        method: args.method ?? "",
        paymentId: args.paymentId,
        meta: args.meta,
      },
    ],
    { session: args.session },
  );
  return user[field] as number;
}

/** Debit only if the balance covers it; throws 402 otherwise. */
export async function debitWallet(args: {
  userId: Id;
  wallet: "main" | "image";
  amountMicros: number;
  type: TransactionType;
  description: string;
  reference?: string;
  meta?: unknown;
  session?: ClientSession;
  /** skip writing a ledger row (used for image holds that are settled later) */
  noLedger?: boolean;
}) {
  const field = args.wallet === "main" ? "mainBalance" : "imageBalance";
  const user = await User.findOneAndUpdate(
    { _id: args.userId, [field]: { $gte: args.amountMicros } },
    { $inc: { [field]: -args.amountMicros } },
    { new: true, session: args.session },
  );
  if (!user) {
    const label = args.wallet === "main" ? "balance" : "image balance";
    throw new HttpError(402, `Not enough ${label}. Please top up and try again.`, "insufficient_balance");
  }
  if (!args.noLedger) {
    await Transaction.create(
      [
        {
          userId: args.userId,
          wallet: args.wallet,
          type: args.type,
          amountMicros: -args.amountMicros,
          balanceAfter: user[field],
          description: args.description,
          reference: args.reference ?? "",
          meta: args.meta,
        },
      ],
      { session: args.session },
    );
  }
  return user[field] as number;
}

export async function grantTokens(args: { userId: Id; tokens: number; type: TransactionType; description: string; reference?: string; method?: string; session?: ClientSession }) {
  const user = await User.findByIdAndUpdate(args.userId, { $inc: { bonusTokens: args.tokens } }, { new: true, session: args.session });
  await Transaction.create(
    [
      {
        userId: args.userId,
        wallet: "tokens",
        type: args.type,
        tokens: args.tokens,
        balanceAfter: user?.bonusTokens ?? null,
        description: args.description,
        reference: args.reference ?? "",
        method: args.method ?? "",
      },
    ],
    { session: args.session },
  );
}

// ── Plans & subscriptions ───────────────────────────────

export async function getFreePlan(session?: ClientSession) {
  const plan = await Plan.findOne({ isFree: true, active: true }).session(session ?? null).lean();
  if (!plan) throw new Error("Free plan missing — run the seed script");
  return plan;
}

function newSubscriptionDoc(userId: Id, plan: PlanLean, cycle: BillingCycle, priceMicros: number, now = new Date()) {
  const isPass = plan.kind === "pass";
  const periodEnds = isPass ? new Date(now.getTime() + plan.durationHours * 3600 * 1000) : new Date(now.getTime() + PERIOD_MS);
  const termEnds = isPass ? periodEnds : cycle === "yearly" ? new Date(now.getTime() + YEAR_MS) : periodEnds;
  return {
    userId,
    planId: plan._id,
    planSlug: plan.slug,
    planName: plan.name,
    kind: plan.kind,
    cycle,
    priceMicros,
    tokensLimit: plan.tokens,
    tokensUsed: 0,
    rpm: plan.rpm,
    modelAccess: plan.modelAccess,
    startsAt: now,
    periodEndsAt: periodEnds,
    termEndsAt: termEnds,
    status: "active",
    autoRenew: !plan.isFree && !isPass,
  };
}

export async function ensureFreeSubscription(userId: Id, session?: ClientSession) {
  const now = new Date();
  const existing = await Subscription.findOne({ userId, kind: "monthly", status: "active", termEndsAt: { $gt: now } }).session(session ?? null);
  if (existing) return existing;
  const free = await getFreePlan(session);
  const [sub] = await Subscription.create([newSubscriptionDoc(userId, free, "free", 0, now)], { session });
  return sub;
}

export function planPrice(plan: PlanLean, cycle: BillingCycle): number {
  if (plan.kind === "pass") return plan.pricePass;
  return cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
}

/** Buy a plan or pass from the main balance. Runs inside the caller's session if given. */
export async function purchasePlan(args: { userId: Id; planId: Id; cycle: BillingCycle; session?: ClientSession }) {
  const run = async (session: ClientSession) => {
    const plan = await Plan.findById(args.planId).session(session).lean();
    if (!plan || !plan.active) throw notFound("Plan not found");
    if (plan.isFree) throw badRequest("The free plan is applied automatically");
    const cycle: BillingCycle = plan.kind === "pass" ? "daily" : args.cycle === "yearly" ? "yearly" : "monthly";
    const price = planPrice(plan, cycle);
    if (cycle === "yearly" && !plan.priceYearly) throw badRequest("This plan has no yearly option");
    const now = new Date();

    const active = await Subscription.find({ userId: args.userId, status: "active", termEndsAt: { $gt: now } }).session(session);
    const monthly = active.find((s) => s.kind === "monthly");
    const pass = active.find((s) => s.kind === "pass");

    if (plan.kind === "pass") {
      if (monthly && monthly.priceMicros > 0) throw badRequest("24-hour passes can't be stacked on an active monthly plan");
      if (pass) throw badRequest("You already have an active pass");
    } else if (monthly && String(monthly.planId) === String(plan._id) && monthly.cycle === cycle) {
      throw badRequest("You're already on this plan");
    }

    const isFirstPaid = !(await Subscription.exists({ userId: args.userId, priceMicros: { $gt: 0 } }).session(session));

    // Prorated credit for the unused part of the current paid plan
    if (plan.kind === "monthly" && monthly && monthly.priceMicros > 0) {
      const total = monthly.termEndsAt.getTime() - monthly.startsAt.getTime();
      const left = Math.max(0, monthly.termEndsAt.getTime() - now.getTime());
      const usedRatio = monthly.tokensLimit ? Math.min(1, monthly.tokensUsed / monthly.tokensLimit) : 0;
      // Credit the smaller of unused time and unused tokens, so switching can't be gamed
      const fraction = Math.min(left / total, 1 - usedRatio);
      const credit = Math.floor(monthly.priceMicros * Math.max(0, fraction));
      if (credit > 0) {
        await creditWallet({
          userId: args.userId,
          wallet: "main",
          amountMicros: credit,
          type: "plan_credit",
          description: `Unused time credit for ${monthly.planName}`,
          session,
        });
      }
    }

    await debitWallet({
      userId: args.userId,
      wallet: "main",
      amountMicros: price,
      type: "plan_purchase",
      description: plan.kind === "pass" ? `${plan.name} (24h pass)` : `${plan.name} plan · ${cycle}`,
      session,
    });

    if (plan.kind === "monthly" && monthly) {
      monthly.status = "cancelled";
      await monthly.save({ session });
    }

    const doc = newSubscriptionDoc(args.userId, plan, cycle, price, now);
    const [sub] = await Subscription.create(
      [{ ...doc, refundableUntil: isFirstPaid && plan.kind === "monthly" ? new Date(now.getTime() + DAY) : null }],
      { session },
    );
    return { sub, plan };
  };

  const { sub, plan } = args.session ? await run(args.session) : await withTransaction(run);
  invalidateEntitlement(args.userId);
  await notify(
    args.userId,
    {
      type: "billing",
      title: `${plan.name} ${plan.kind === "pass" ? "pass" : "plan"} activated`,
      body: `${formatTokens(plan.tokens)} tokens · ${plan.rpm} requests/min. Active until ${sub.termEndsAt.toUTCString()}.`,
      link: "/dashboard/billing/plan",
    },
    { email: true, telegram: true },
  );
  return sub;
}

export async function refundSubscription(userId: Id) {
  const sub = await withTransaction(async (session) => {
    const now = new Date();
    const s = await Subscription.findOne({ userId, kind: "monthly", status: "active", refundableUntil: { $gt: now } }).session(session);
    if (!s) throw badRequest("No plan is eligible for a refund");
    s.status = "refunded";
    await s.save({ session });
    await creditWallet({ userId, wallet: "main", amountMicros: s.priceMicros, type: "plan_refund", description: `Refund for ${s.planName}`, session });
    await ensureFreeSubscription(userId, session);
    return s;
  });
  invalidateEntitlement(userId);
  await notify(userId, { type: "billing", title: "Plan refunded", body: `${formatUsd(sub.priceMicros)} was returned to your balance.`, link: "/dashboard/billing/balance" }, { email: true });
  return sub;
}

// ── Entitlement (what the user can do right now) ────────

export type Entitlement = {
  userId: string;
  monthly: SubscriptionLean | null;
  pass: SubscriptionLean | null;
  bonusTokens: number;
  rpm: number;
  access: ModelAccess;
  remaining: number;
  isPaid: boolean;
};

const entCache = new Map<string, { at: number; ent: Entitlement }>();

export function invalidateEntitlement(userId: Id) {
  entCache.delete(String(userId));
}

export async function getEntitlement(userId: Id, fresh = false): Promise<Entitlement> {
  const key = String(userId);
  const hit = entCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 3000) return hit.ent;

  const now = new Date();
  let subs = await Subscription.find({ userId, status: "active", termEndsAt: { $gt: now } }).lean();
  if (!subs.some((s) => s.kind === "monthly")) {
    await ensureFreeSubscription(userId);
    subs = await Subscription.find({ userId, status: "active", termEndsAt: { $gt: now } }).lean();
  }
  const user = await User.findById(userId).select("bonusTokens").lean();
  const monthly = subs.find((s) => s.kind === "monthly") ?? null;
  const pass = subs.find((s) => s.kind === "pass") ?? null;
  const bonus = Math.max(0, user?.bonusTokens ?? 0);
  const left = (s: SubscriptionLean | null) => (s ? Math.max(0, s.tokensLimit - s.tokensUsed) : 0);
  const accessOf = (s: SubscriptionLean | null): ModelAccess => (s?.modelAccess as ModelAccess) ?? "free";
  const access = [accessOf(monthly), accessOf(pass)].sort((a, b) => ACCESS_RANK[b] - ACCESS_RANK[a])[0];
  const ent: Entitlement = {
    userId: key,
    monthly,
    pass,
    bonusTokens: bonus,
    rpm: Math.max(monthly?.rpm ?? 0, pass?.rpm ?? 0, 10),
    access,
    remaining: left(pass) + left(monthly) + bonus,
    isPaid: Boolean((monthly && monthly.priceMicros > 0) || pass),
  };
  entCache.set(key, { at: Date.now(), ent });
  return ent;
}

/** Deduct tokens: 24h pass first, then the plan cycle, then bonus tokens. Overage lands on the plan. */
export async function consumeTokens(userId: Id, tokens: number) {
  if (!tokens || tokens <= 0) return;
  const now = new Date();
  const subs = await Subscription.find({ userId, status: "active", termEndsAt: { $gt: now } }).lean();
  const ordered = [...subs.filter((s) => s.kind === "pass"), ...subs.filter((s) => s.kind === "monthly")];
  let left = tokens;

  for (const s of ordered) {
    const take = Math.min(Math.max(0, s.tokensLimit - s.tokensUsed), left);
    if (take > 0) {
      await Subscription.updateOne({ _id: s._id }, { $inc: { tokensUsed: take } });
      left -= take;
    }
    if (left <= 0) break;
  }

  if (left > 0) {
    const u = await User.findById(userId).select("bonusTokens").lean();
    const take = Math.min(Math.max(0, u?.bonusTokens ?? 0), left);
    if (take > 0) {
      const res = await User.updateOne({ _id: userId, bonusTokens: { $gte: take } }, { $inc: { bonusTokens: -take } });
      if (res.modifiedCount) left -= take;
    }
  }

  const monthly = subs.find((s) => s.kind === "monthly");
  if (left > 0 && monthly) await Subscription.updateOne({ _id: monthly._id }, { $inc: { tokensUsed: left } });
  invalidateEntitlement(userId);

  if (monthly) await checkUsageAlerts(String(monthly._id));
}

async function checkUsageAlerts(subId: string) {
  const s = await Subscription.findById(subId).lean();
  if (!s || !s.tokensLimit) return;
  const ratio = s.tokensUsed / s.tokensLimit;
  if (ratio >= 1 && !s.alerts?.p100) {
    await Subscription.updateOne({ _id: s._id }, { $set: { "alerts.p100": true, "alerts.p80": true } });
    await notify(
      s.userId,
      { type: "usage", title: "You've used all your plan tokens", body: `Your ${s.planName} tokens renew on ${s.periodEndsAt.toUTCString()}. Upgrade or buy a 24h pass to keep going.`, link: "/dashboard/billing/plan" },
      { email: true, telegram: true },
    );
  } else if (ratio >= 0.8 && !s.alerts?.p80) {
    await Subscription.updateOne({ _id: s._id }, { $set: { "alerts.p80": true } });
    await notify(s.userId, { type: "usage", title: "80% of your tokens used", body: `You've used ${formatTokens(s.tokensUsed)} of ${formatTokens(s.tokensLimit)} tokens this cycle.`, link: "/dashboard/usage" }, { email: true });
  }
}

// ── Scheduled maintenance ───────────────────────────────

/** Reset token periods, renew or expire plans, expire passes. Safe to run often. */
export async function processSubscriptionCycles() {
  const now = new Date();

  // 1. Token period resets inside a still-valid term (free + yearly plans)
  const resets = await Subscription.find({ status: "active", periodEndsAt: { $lte: now }, termEndsAt: { $gt: now }, kind: "monthly" }).limit(500);
  for (const s of resets) {
    let next = s.periodEndsAt.getTime();
    while (next <= now.getTime()) next += PERIOD_MS;
    s.periodEndsAt = new Date(Math.min(next, s.termEndsAt.getTime()));
    s.tokensUsed = 0;
    s.alerts = { p80: false, p100: false };
    await s.save();
    invalidateEntitlement(s.userId);
  }

  // 2. Terms that ended
  const ended = await Subscription.find({ status: "active", termEndsAt: { $lte: now } }).limit(500);
  for (const s of ended) {
    try {
      if (s.kind === "pass") {
        s.status = "expired";
        await s.save();
        await notify(s.userId, { type: "billing", title: "Your 24h pass has ended", link: "/dashboard/billing/plan" });
      } else if (s.cycle === "free") {
        // Free plan simply rolls into a new cycle
        s.status = "expired";
        await s.save();
        await ensureFreeSubscription(s.userId);
      } else {
        await renewOrDowngrade(String(s._id));
      }
      invalidateEntitlement(s.userId);
    } catch (err) {
      logger.error({ err, sub: String(s._id) }, "subscription cycle failed");
    }
  }
}

async function renewOrDowngrade(subId: string) {
  const outcome = await withTransaction(async (session) => {
    const s = await Subscription.findById(subId).session(session);
    if (!s || s.status !== "active") return null;
    s.status = "expired";
    await s.save({ session });
    const plan = await Plan.findById(s.planId).session(session).lean();
    const user = await User.findById(s.userId).session(session).lean();
    const price = plan ? planPrice(plan, s.cycle as BillingCycle) : 0;
    if (s.autoRenew && plan?.active && user && user.mainBalance >= price) {
      await debitWallet({ userId: s.userId, wallet: "main", amountMicros: price, type: "plan_purchase", description: `${plan.name} plan renewal · ${s.cycle}`, session });
      await Subscription.create([newSubscriptionDoc(s.userId, plan, s.cycle as BillingCycle, price)], { session });
      return { renewed: true, userId: s.userId, name: plan.name, price };
    }
    await ensureFreeSubscription(s.userId, session);
    return { renewed: false, userId: s.userId, name: s.planName, price };
  });
  if (!outcome) return;
  await notify(
    outcome.userId,
    outcome.renewed
      ? { type: "billing", title: `${outcome.name} renewed`, body: `${formatUsd(outcome.price)} was charged from your balance.`, link: "/dashboard/billing/plan" }
      : { type: "billing", title: `${outcome.name} expired`, body: "Your balance didn't cover the renewal, so you're back on the Free plan. Top up to upgrade again.", link: "/dashboard/billing/balance" },
    { email: true, telegram: true },
  );
}
