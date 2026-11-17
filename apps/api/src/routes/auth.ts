import express, { Router } from "express";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { OtpCode, Session, User } from "../db/models";
import { env, isDev } from "../config/env";
import { hashPassword, randomDigits, sha256, verifyPassword, verifyTotp, decrypt } from "../lib/crypto";
import { HttpError, badRequest, conflict, forbidden, unauthorized } from "../lib/errors";
import { createSession, destroySession, me, requireAuth } from "../middleware/auth";
import { sendOtpEmail } from "../services/mail";
import { generateReferralCode, attachReferral } from "../services/referrals";
import { onboardUser, publicUser } from "../services/users";
import { telegramEnabled } from "../services/settings";
import { logger } from "../lib/logger";

export const authRouter = Router();

const email = z.string().trim().toLowerCase().email("Enter a valid email");
const password = z.string().min(8, "Use at least 8 characters").max(200);

// Very small per-IP throttle for auth endpoints
const attempts = new Map<string, number[]>();
function throttle(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (attempts.get(key) ?? []).filter((t) => t > now - windowMs);
  if (arr.length >= max) throw new HttpError(429, "Too many attempts. Please wait a few minutes.", "rate_limited");
  arr.push(now);
  attempts.set(key, arr);
}

async function issueOtp(addr: string, purpose: "verify" | "reset") {
  const recent = await OtpCode.findOne({ email: addr, purpose, createdAt: { $gt: new Date(Date.now() - 45_000) } });
  if (recent) throw new HttpError(429, "Please wait a moment before requesting another code.", "rate_limited");
  await OtpCode.deleteMany({ email: addr, purpose });
  const code = randomDigits(6);
  await OtpCode.create({ email: addr, purpose, codeHash: sha256(`${addr}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) });
  await sendOtpEmail(addr, code, purpose);
  // In local development without SMTP the code is returned to make testing easy.
  return isDev && !env.SMTP_HOST ? code : undefined;
}

async function checkOtp(addr: string, purpose: "verify" | "reset", code: string) {
  const otp = await OtpCode.findOne({ email: addr, purpose, expiresAt: { $gt: new Date() } });
  if (!otp) throw badRequest("This code has expired. Request a new one.");
  if (otp.attempts >= 5) {
    await otp.deleteOne();
    throw badRequest("Too many wrong attempts. Request a new code.");
  }
  if (otp.codeHash !== sha256(`${addr}:${code.trim()}`)) {
    otp.attempts += 1;
    await otp.save();
    throw badRequest("That code isn't right. Check your email and try again.");
  }
  await otp.deleteOne();
}

authRouter.get("/config", (_req, res) => {
  res.json({
    brand: env.BRAND_NAME,
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    telegramEnabled: telegramEnabled(),
    telegramBot: env.TELEGRAM_BOT_USERNAME || null,
  });
});

authRouter.post("/register", async (req, res) => {
  throttle(`reg:${req.ip}`, 10, 15 * 60_000);
  const body = z.object({ name: z.string().trim().min(1, "Enter your name").max(80), email, password, ref: z.string().max(40).optional() }).parse(req.body);
  let user = await User.findOne({ email: body.email });
  if (user?.emailVerified) throw conflict("An account with this email already exists. Sign in instead.");
  if (!user) {
    user = await User.create({ email: body.email, name: body.name, passwordHash: await hashPassword(body.password), referralCode: await generateReferralCode() });
    if (body.ref) {
      await attachReferral(user._id, body.ref, "link").catch((err) => logger.debug({ err: err.message }, "referral not attached"));
    }
  } else {
    user.name = body.name;
    user.passwordHash = await hashPassword(body.password);
    await user.save();
  }
  const devCode = await issueOtp(body.email, "verify");
  res.status(201).json({ ok: true, email: body.email, devCode });
});

authRouter.post("/verify-email", async (req, res) => {
  throttle(`ver:${req.ip}`, 20, 15 * 60_000);
  const body = z.object({ email, code: z.string().trim().length(6, "Enter the 6-digit code") }).parse(req.body);
  const user = await User.findOne({ email: body.email });
  if (!user) throw badRequest("No account for this email");
  await checkOtp(body.email, "verify", body.code);
  user.emailVerified = true;
  await user.save();
  await onboardUser(user._id);
  await createSession(req, res, user._id);
  res.json({ user: publicUser(user.toObject() as never) });
});

authRouter.post("/resend-code", async (req, res) => {
  const body = z.object({ email, purpose: z.enum(["verify", "reset"]).default("verify") }).parse(req.body);
  const user = await User.findOne({ email: body.email }).lean();
  let devCode: string | undefined;
  if (user && !(body.purpose === "verify" && user.emailVerified)) devCode = await issueOtp(body.email, body.purpose);
  res.json({ ok: true, devCode });
});

authRouter.post("/login", async (req, res) => {
  throttle(`login:${req.ip}`, 20, 15 * 60_000);
  const body = z.object({ email, password: z.string().min(1), totp: z.string().optional() }).parse(req.body);
  const user = await User.findOne({ email: body.email });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw unauthorized("Incorrect email or password");
  if (user.status === "banned") throw forbidden("Your account has been suspended. Contact support.");
  if (user.status === "deleted") throw unauthorized("Incorrect email or password");
  if (!user.emailVerified) {
    const devCode = await issueOtp(user.email, "verify").catch(() => undefined);
    res.json({ needsVerification: true, email: user.email, devCode });
    return;
  }
  if (user.twoFactor?.enabled && user.twoFactor.secretEnc) {
    if (!body.totp) {
      res.json({ requires2fa: true });
      return;
    }
    if (!verifyTotp(decrypt(user.twoFactor.secretEnc), body.totp)) throw unauthorized("Invalid two-factor code");
  }
  await createSession(req, res, user._id);
  res.json({ user: publicUser(user.toObject() as never) });
});

/** A path on this site to continue to after sign-in ("/dashboard" when missing or not a local path). */
function safeNext(next: unknown) {
  return typeof next === "string" && /^\/(?![\/\\])/.test(next) ? next : "/dashboard";
}

/** True when a form post comes from a page on this site (stops other sites from signing visitors into another account). */
function fromOurSite(req: express.Request) {
  const source = req.get("origin") || req.get("referer") || "";
  let sourceHost = "";
  try {
    sourceHost = new URL(source).host;
  } catch {
    return false;
  }
  const allowed = new Set([req.get("x-forwarded-host"), req.get("host")].filter(Boolean) as string[]);
  try {
    allowed.add(new URL(env.APP_URL).host);
  } catch {
    /* APP_URL not a URL */
  }
  return allowed.has(sourceHost);
}

/**
 * Plain form-post sign-in, used only when the login page's JavaScript isn't running (a browser
 * extension or a slow connection). Same checks as POST /login; answers with redirects instead of JSON.
 */
authRouter.post("/login-form", express.urlencoded({ extended: false, limit: "10kb" }), async (req, res) => {
  const back = (message: string, emailValue = "") =>
    res.redirect(303, `/login?error=${encodeURIComponent(message)}${emailValue ? `&email=${encodeURIComponent(emailValue)}` : ""}`);
  if (!fromOurSite(req)) return back("Please sign in from the login page.");
  try {
    throttle(`login:${req.ip}`, 20, 15 * 60_000);
    const parsed = z.object({ email, password: z.string().min(1), next: z.string().optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return back("Enter your email and password.", String(req.body?.email ?? ""));
    const next = safeNext(parsed.data.next);
    const user = await User.findOne({ email: parsed.data.email });
    if (!user || user.status === "deleted" || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return back("Incorrect email or password", parsed.data.email);
    }
    if (user.status === "banned") return back("Your account has been suspended. Contact support.");
    if (!user.emailVerified) {
      await issueOtp(user.email, "verify").catch(() => undefined);
      return res.redirect(303, `/verify-email?email=${encodeURIComponent(user.email)}&next=${encodeURIComponent(next)}`);
    }
    if (user.twoFactor?.enabled && user.twoFactor.secretEnc) {
      return back("Your account uses two-factor sign-in, which needs the page to finish loading. Reload the page and try again.", user.email);
    }
    await createSession(req, res, user._id);
    res.redirect(303, next);
  } catch (err) {
    back(err instanceof HttpError ? err.message : "Sign-in failed. Please try again.");
  }
});

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

authRouter.post("/google", async (req, res) => {
  if (!googleClient) throw badRequest("Google sign-in is not configured");
  const body = z.object({ credential: z.string().min(10), ref: z.string().max(40).optional() }).parse(req.body);
  const ticket = await googleClient.verifyIdToken({ idToken: body.credential, audience: env.GOOGLE_CLIENT_ID }).catch(() => null);
  const p = ticket?.getPayload();
  if (!p?.email || !p.sub) throw unauthorized("Google sign-in failed");
  if (!p.email_verified) throw unauthorized("Your Google email isn't verified");
  let user = await User.findOne({ $or: [{ googleId: p.sub }, { email: p.email.toLowerCase() }] });
  let isNew = false;
  if (!user) {
    isNew = true;
    user = await User.create({ email: p.email.toLowerCase(), name: p.name ?? "", googleId: p.sub, emailVerified: true, referralCode: await generateReferralCode() });
    if (body.ref) await attachReferral(user._id, body.ref, "link").catch(() => {});
  } else {
    if (user.status === "banned") throw forbidden("Your account has been suspended. Contact support.");
    if (user.status === "deleted") throw unauthorized("This account was deleted");
    if (!user.googleId) user.googleId = p.sub;
    if (!user.name && p.name) user.name = p.name;
    const wasUnverified = !user.emailVerified;
    user.emailVerified = true;
    await user.save();
    isNew = wasUnverified;
  }
  if (isNew) await onboardUser(user._id);
  await createSession(req, res, user._id);
  res.json({ user: publicUser(user.toObject() as never) });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

authRouter.post("/forgot-password", async (req, res) => {
  throttle(`forgot:${req.ip}`, 10, 15 * 60_000);
  const body = z.object({ email }).parse(req.body);
  const user = await User.findOne({ email: body.email, status: "active" }).lean();
  let devCode: string | undefined;
  if (user) devCode = await issueOtp(body.email, "reset").catch(() => undefined);
  res.json({ ok: true, devCode });
});

authRouter.post("/reset-password", async (req, res) => {
  throttle(`reset:${req.ip}`, 20, 15 * 60_000);
  const body = z.object({ email, code: z.string().trim().length(6), password }).parse(req.body);
  const user = await User.findOne({ email: body.email });
  if (!user) throw badRequest("No account for this email");
  await checkOtp(body.email, "reset", body.code);
  user.passwordHash = await hashPassword(body.password);
  user.emailVerified = true;
  await user.save();
  await Session.deleteMany({ userId: user._id });
  await onboardUser(user._id);
  await createSession(req, res, user._id);
  res.json({ user: publicUser(user.toObject() as never) });
});

authRouter.get("/session", requireAuth, (req, res) => {
  res.json({ user: publicUser(me(req)) });
});
