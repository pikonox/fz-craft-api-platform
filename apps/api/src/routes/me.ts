import { Router } from "express";
import { z } from "zod";
import { ApiKey, Conversation, ImageGeneration, Message, Notification, Session, User } from "../db/models";
import { deleteFiles } from "../services/storage";
import { generationFileKeys } from "../services/imageRetention";
import { decrypt, encrypt, generateTotpSecret, hashPassword, randomBase62, sha256, verifyPassword, verifyTotp } from "../lib/crypto";
import { badRequest, unauthorized } from "../lib/errors";
import { me, requireAuth, SESSION_COOKIE } from "../middleware/auth";
import { getEntitlement } from "../services/billing";
import { entitlementSummary, publicUser } from "../services/users";
import { telegramEnabled } from "../services/settings";
import { telegramDeepLink } from "../services/telegram";
import { completeTelegramVerification, attachReferral } from "../services/referrals";
import { notify } from "../services/notify";
import { invalidateKeyCache, invalidateUserCache } from "../gateway/context";
import { env, isDev } from "../config/env";

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const user = me(req);
  const ent = await getEntitlement(user._id);
  res.json({ user: publicUser(user), entitlement: entitlementSummary(ent) });
});

meRouter.patch("/", async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      phone: z.string().trim().max(30).optional(),
      defaults: z
        .object({
          model: z.string().max(100).optional(),
          maxTokens: z.number().int().min(16).max(65_536).optional(),
          temperature: z.number().min(0).max(2).optional(),
          timezone: z.string().max(60).optional(),
        })
        .optional(),
      notificationPrefs: z
        .object({
          emailBilling: z.boolean().optional(),
          emailUsage: z.boolean().optional(),
          emailSecurity: z.boolean().optional(),
          emailProduct: z.boolean().optional(),
          telegram: z.boolean().optional(),
        })
        .optional(),
    })
    .parse(req.body);
  const set: Record<string, unknown> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.phone !== undefined) set.phone = body.phone;
  for (const [k, v] of Object.entries(body.defaults ?? {})) set[`defaults.${k}`] = v;
  for (const [k, v] of Object.entries(body.notificationPrefs ?? {})) set[`notificationPrefs.${k}`] = v;
  const user = await User.findByIdAndUpdate(me(req)._id, { $set: set }, { new: true }).lean();
  invalidateUserCache(String(me(req)._id));
  res.json({ user: publicUser(user as never) });
});

meRouter.post("/password", async (req, res) => {
  const body = z.object({ current: z.string().optional(), next: z.string().min(8, "Use at least 8 characters").max(200) }).parse(req.body);
  const user = await User.findById(me(req)._id);
  if (!user) throw unauthorized();
  if (user.passwordHash && !(await verifyPassword(body.current ?? "", user.passwordHash))) throw badRequest("Your current password is incorrect");
  user.passwordHash = await hashPassword(body.next);
  await user.save();
  // Sign out every other session
  await Session.deleteMany({ userId: user._id, _id: { $ne: req.sessionId } });
  await notify(user._id, { type: "security", title: "Password changed", body: "Your password was changed and other sessions were signed out." }, { email: true });
  res.json({ ok: true });
});

// ── Two-factor auth ─────────────────────────────────────
meRouter.post("/2fa/setup", async (req, res) => {
  const user = me(req);
  if (user.twoFactor?.enabled) throw badRequest("Two-factor auth is already on");
  const secret = generateTotpSecret();
  await User.updateOne({ _id: user._id }, { $set: { "twoFactor.pendingSecretEnc": encrypt(secret) } });
  const label = encodeURIComponent(`${env.BRAND_NAME}:${user.email}`);
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(env.BRAND_NAME)}&digits=6&period=30`;
  res.json({ secret, otpauth });
});

meRouter.post("/2fa/enable", async (req, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.body);
  const user = await User.findById(me(req)._id);
  const pending = user?.twoFactor?.pendingSecretEnc;
  if (!user || !pending) throw badRequest("Start the setup first");
  if (!verifyTotp(decrypt(pending), code)) throw badRequest("That code didn't match. Check your authenticator app's time and try again.");
  user.set("twoFactor", { enabled: true, secretEnc: pending, pendingSecretEnc: undefined });
  await user.save();
  await notify(user._id, { type: "security", title: "Two-factor authentication enabled" }, { email: true });
  res.json({ ok: true });
});

meRouter.post("/2fa/disable", async (req, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.body);
  const user = await User.findById(me(req)._id);
  if (!user?.twoFactor?.enabled || !user.twoFactor.secretEnc) throw badRequest("Two-factor auth is not on");
  if (!verifyTotp(decrypt(user.twoFactor.secretEnc), code)) throw badRequest("Invalid code");
  user.set("twoFactor", { enabled: false });
  await user.save();
  await notify(user._id, { type: "security", title: "Two-factor authentication disabled" }, { email: true });
  res.json({ ok: true });
});

// ── Sessions ────────────────────────────────────────────
meRouter.get("/sessions", async (req, res) => {
  const sessions = await Session.find({ userId: me(req)._id, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).lean();
  res.json({
    sessions: sessions.map((s) => ({
      id: String(s._id),
      userAgent: s.userAgent,
      ip: s.ip,
      lastSeenAt: s.lastSeenAt,
      createdAt: s.createdAt,
      current: String(s._id) === req.sessionId,
    })),
  });
});

meRouter.delete("/sessions/:id", async (req, res) => {
  await Session.deleteOne({ _id: req.params.id, userId: me(req)._id });
  res.json({ ok: true });
});

meRouter.post("/sessions/revoke-others", async (req, res) => {
  const r = await Session.deleteMany({ userId: me(req)._id, _id: { $ne: req.sessionId } });
  res.json({ ok: true, revoked: r.deletedCount });
});

// ── Telegram verification ───────────────────────────────
meRouter.post("/telegram/link", async (req, res) => {
  const user = me(req);
  if (!telegramEnabled()) {
    if (isDev) {
      // Local development without a bot: verify instantly with a fake Telegram id.
      const result = await completeTelegramVerification(user._id, `dev-${user._id}`, "dev");
      res.json({ verified: result.ok, dev: true });
      return;
    }
    throw badRequest("Telegram verification is not configured");
  }
  const token = randomBase62(24);
  await User.updateOne({ _id: user._id }, { $set: { "telegram.linkToken": token, "telegram.linkTokenExpires": new Date(Date.now() + 15 * 60_000) } });
  res.json({ url: telegramDeepLink(token), expiresInSec: 900 });
});

meRouter.get("/telegram/status", async (req, res) => {
  const user = await User.findById(me(req)._id).select("telegram").lean();
  res.json({ verified: Boolean(user?.telegram?.verifiedAt), username: user?.telegram?.username ?? "" });
});

// ── Referral code entry (within 7 days of sign-up) ──────
meRouter.post("/referral-code", async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(3).max(40) }).parse(req.body);
  await attachReferral(me(req)._id, code, "code");
  res.json({ ok: true });
});

// ── Delete account ──────────────────────────────────────
meRouter.post("/delete", async (req, res) => {
  const body = z.object({ password: z.string().optional(), confirm: z.literal("DELETE") }).parse(req.body);
  const user = await User.findById(me(req)._id);
  if (!user) throw unauthorized();
  if (user.passwordHash && !(await verifyPassword(body.password ?? "", user.passwordHash))) throw badRequest("Incorrect password");
  const keys = await ApiKey.find({ userId: user._id }).select("hash").lean();
  await ApiKey.updateMany({ userId: user._id }, { $set: { status: "revoked", revokedAt: new Date() } });
  keys.forEach((k) => invalidateKeyCache(k.hash));

  // Delete personal content: Playground chats (and their attachments), generated images and notifications.
  // Files go first, so a storage error stops here and the request can simply be retried.
  const [withFiles, generations] = await Promise.all([
    Message.find({ userId: user._id, "attachments.0": { $exists: true } }).select("attachments.key").lean(),
    ImageGeneration.find({ userId: user._id }).select("images.key refImage.key").lean(),
  ]);
  await deleteFiles([...withFiles.flatMap((m) => (m.attachments ?? []).map((a) => a.key)), ...generations.flatMap(generationFileKeys)]);
  await Promise.all([
    Conversation.deleteMany({ userId: user._id }),
    Message.deleteMany({ userId: user._id }),
    ImageGeneration.deleteMany({ userId: user._id }),
    Notification.deleteMany({ userId: user._id }),
  ]);

  await Session.deleteMany({ userId: user._id });
  // Anonymise but keep the record for billing history
  user.set({
    status: "deleted",
    deletedAt: new Date(),
    email: `deleted-${user._id}-${sha256(user.email).slice(0, 8)}@deleted.local`,
    name: "Deleted user",
    phone: "",
    passwordHash: undefined,
    googleId: undefined,
    telegram: {},
    twoFactor: { enabled: false },
  });
  await user.save();
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});
