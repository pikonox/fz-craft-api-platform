import type { UserLean } from "../db/models";
import { ApiKey, Notification, Transaction, User } from "../db/models";
import { ensureFreeSubscription, grantTokens, type Entitlement } from "./billing";
import { createApiKey } from "./apiKeys";
import { getSetting, telegramEnabled } from "./settings";
import { rewardReferral } from "./referrals";
import { notify } from "./notify";
import { env } from "../config/env";

/** First-time setup once an email is verified. Idempotent enough to call on every verify. */
export async function onboardUser(userId: UserLean["_id"]) {
  await ensureFreeSubscription(userId);
  if (!(await ApiKey.exists({ userId }))) await createApiKey(userId, { name: "Default API Key" });
  const bonus = await getSetting("signupBonusTokens");
  const user = await User.findById(userId).select("createdAt").lean();
  const isNew = user && Date.now() - new Date(user.createdAt).getTime() < 24 * 3600_000;
  if (bonus > 0 && isNew) {
    if (!(await Transaction.exists({ userId, type: "signup_bonus" }))) {
      await grantTokens({ userId, tokens: bonus, type: "signup_bonus", description: "Welcome bonus", method: "Bonus" });
    }
  }
  if (!telegramEnabled()) await rewardReferral(userId);
  if (isNew && !(await Notification.exists({ userId }))) {
    await notify(userId, {
      type: "system",
      title: `Welcome to ${env.BRAND_NAME} 👋`,
      body: "Your free plan is active and a default API key is ready. Try the Playground or make your first API call.",
      link: "/dashboard",
    });
  }
}

export function publicUser(u: UserLean) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    emailVerified: u.emailVerified,
    telegram: { verified: Boolean(u.telegram?.verifiedAt), username: u.telegram?.username ?? "" },
    referralCode: u.referralCode,
    mainBalance: u.mainBalance,
    imageBalance: u.imageBalance,
    bonusTokens: u.bonusTokens,
    defaults: u.defaults,
    notificationPrefs: u.notificationPrefs,
    twoFactorEnabled: Boolean(u.twoFactor?.enabled),
    hasPassword: Boolean(u.passwordHash),
    googleLinked: Boolean(u.googleId),
    createdAt: u.createdAt,
  };
}

function subSummary(s: Entitlement["monthly"]) {
  if (!s) return null;
  return {
    id: String(s._id),
    name: s.planName,
    slug: s.planSlug,
    kind: s.kind,
    cycle: s.cycle,
    priceMicros: s.priceMicros,
    tokensLimit: s.tokensLimit,
    tokensUsed: s.tokensUsed,
    rpm: s.rpm,
    modelAccess: s.modelAccess,
    startsAt: s.startsAt,
    periodEndsAt: s.periodEndsAt,
    termEndsAt: s.termEndsAt,
    autoRenew: s.autoRenew,
    refundableUntil: s.refundableUntil,
    isFree: s.cycle === "free",
  };
}

export function entitlementSummary(ent: Entitlement) {
  const plan = subSummary(ent.monthly);
  const pass = subSummary(ent.pass);
  const totalTokens = (plan?.tokensLimit ?? 0) + (pass?.tokensLimit ?? 0) + ent.bonusTokens;
  const usedTokens = (plan?.tokensUsed ?? 0) + (pass?.tokensUsed ?? 0);
  return {
    plan,
    pass,
    bonusTokens: ent.bonusTokens,
    totalTokens,
    usedTokens,
    remainingTokens: ent.remaining,
    rpm: ent.rpm,
    access: ent.access,
    isPaid: ent.isPaid,
  };
}
