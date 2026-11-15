import type { Request, Response, RequestHandler } from "express";
import type { Types } from "mongoose";
import { Session, User, type UserLean } from "../db/models";
import { randomToken, sha256 } from "../lib/crypto";
import { forbidden, unauthorized } from "../lib/errors";
import { isProd } from "../config/env";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserLean;
      sessionId?: string;
    }
  }
}

export const SESSION_COOKIE = "nv_session";
const SESSION_DAYS = 30;

export async function createSession(req: Request, res: Response, userId: Types.ObjectId) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await Session.create({
    userId,
    tokenHash: sha256(token),
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300),
    ip: req.ip ?? "",
    expiresAt,
  });
  await User.updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await Session.deleteOne({ tokenHash: sha256(token) });
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Attaches req.user when a valid session cookie is present. Never rejects. */
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return next();
  const user = await User.findById(session.userId).lean<UserLean>();
  if (!user || user.status === "deleted") return next();
  req.user = user;
  req.sessionId = String(session._id);
  // Sliding expiry, written at most every 5 minutes
  if (Date.now() - new Date(session.lastSeenAt).getTime() > 5 * 60_000) {
    await Session.updateOne(
      { _id: session._id },
      { $set: { lastSeenAt: new Date(), ip: req.ip ?? "", expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) } },
    );
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.status === "banned") return next(forbidden("Your account has been suspended. Contact support."));
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== "admin") return next(forbidden("Admins only"));
  next();
};

/** Non-null user after requireAuth. */
export function me(req: Request): UserLean {
  if (!req.user) throw unauthorized();
  return req.user;
}
