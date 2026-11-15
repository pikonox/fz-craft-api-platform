import type { Types } from "mongoose";
import { formatTokens, REFERRAL_CODE_WINDOW_DAYS } from "@nova/shared";
import { Referral, User } from "../db/models";
import { env } from "../config/env";
import { randomBase62 } from "../lib/crypto";
import { badRequest } from "../lib/errors";
import { grantTokens, invalidateEntitlement } from "./billing";
import { notify } from "./notify";
import { getSetting, telegramEnabled } from "./settings";
import { withTransaction } from "../db/connect";

type Id = Types.ObjectId | string;

const codePrefix = () => (env.KEY_PREFIX.replace(/[^a-z]/gi, "").slice(0, 2) || "FZ").toUpperCase();

export async function generateReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = `${codePrefix()}-${randomBase62(5).toUpperCase()}`;
    if (!(await User.exists({ referralCode: code }))) return code;
  }
  return `${codePrefix()}-${randomBase62(8).toUpperCase()}`;
}

/** Link a new user to whoever referred them. */
export async function attachReferral(refereeId: Id, rawCode: string, via: "link" | "code") {
  const code = rawCode.trim().toUpperCase();
  if (!code) return;
  const referee = await User.findById(refereeId);
  if (!referee) throw badRequest("User not found");
  if (referee.referredBy || (await Referral.exists({ refereeId }))) throw badRequest("A referral code is already applied to your account");
  if (via === "code") {
    const ageDays = (Date.now() - referee.createdAt.getTime()) / 86_400_000;
    if (ageDays > REFERRAL_CODE_WINDOW_DAYS) throw badRequest(`Referral codes can only be added within ${REFERRAL_CODE_WINDOW_DAYS} days of sign-up`);
  }
  const referrer = await User.findOne({ referralCode: code, status: "active" });
  if (!referrer) throw badRequest("That referral code doesn't exist");
  if (String(referrer._id) === String(referee._id)) throw badRequest("You can't refer yourself");

  referee.referredBy = referrer._id;
  await referee.save();
  await Referral.create({ referrerId: referrer._id, refereeId: referee._id, code, via, status: "pending" });

  // If the referee is already verified, reward right away
  const verified = telegramEnabled() ? Boolean(referee.telegram?.verifiedAt) : referee.emailVerified;
  if (verified) await rewardReferral(referee._id);
}

/** Called when the referee completes verification (Telegram, or email if the bot is off). */
export async function rewardReferral(refereeId: Id) {
  const reward = await getSetting("referralRewardTokens");
  const ref = await withTransaction(async (session) => {
    const r = await Referral.findOneAndUpdate(
      { refereeId, status: "pending" },
      { $set: { status: "verified", verifiedAt: new Date(), rewardTokens: reward } },
      { new: true, session },
    );
    if (!r) return null;
    const referee = await User.findById(refereeId).select("email").session(session).lean();
    await grantTokens({
      userId: r.referrerId,
      tokens: reward,
      type: "referral_bonus",
      description: `${reward.toLocaleString("en-US")} token bonus for referring ${referee?.email ?? "a friend"}`,
      reference: `REF-${String(r._id).slice(-7).toUpperCase()}`,
      method: "Referral",
      session,
    });
    return r;
  });
  if (!ref) return;
  invalidateEntitlement(ref.referrerId);
  await notify(
    ref.referrerId,
    { type: "referral", title: `You earned ${formatTokens(reward)} tokens 🎉`, body: "A friend you invited just verified their account.", link: "/dashboard/rewards" },
    { email: true, telegram: true },
  );
}

export async function completeTelegramVerification(userId: Id, telegramId: string, username: string): Promise<{ ok: boolean; message: string }> {
  const taken = await User.exists({ "telegram.id": telegramId, _id: { $ne: userId } });
  if (taken) return { ok: false, message: "This Telegram account is already linked to another account." };
  const user = await User.findById(userId);
  if (!user) return { ok: false, message: "Account not found." };
  const firstTime = !user.telegram?.verifiedAt;
  user.set("telegram", { id: telegramId, username, verifiedAt: user.telegram?.verifiedAt ?? new Date() });
  await user.save();
  invalidateEntitlement(userId);
  if (firstTime) {
    await notify(userId, { type: "security", title: "Telegram verified", body: "Your free tier is unlocked and alerts will arrive on Telegram." });
    await rewardReferral(userId);
  }
  return { ok: true, message: "Verified" };
}
