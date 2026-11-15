import { Router } from "express";
import { z } from "zod";
import { FEEDBACK_TYPES, REFERRAL_CODE_WINDOW_DAYS, TICKET_CATEGORIES } from "@nova/shared";
import { Feedback, Notification, Referral, Subscription, Ticket, User, nextSequence } from "../db/models";
import { badRequest, notFound } from "../lib/errors";
import { me, requireAuth } from "../middleware/auth";
import { getSetting, telegramEnabled } from "../services/settings";
import { notifyAdmins } from "../services/notify";
import { env } from "../config/env";

// ── Rewards / referrals ─────────────────────────────────
export const referralsRouter = Router();
referralsRouter.use(requireAuth);

const maskEmail = (e: string) => {
  const [name, domain] = e.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(3, Math.min(8, name.length - 2)))}@${domain}`;
};

referralsRouter.get("/", async (req, res) => {
  const user = me(req);
  const [refs, reward] = await Promise.all([Referral.find({ referrerId: user._id }).sort({ createdAt: -1 }).lean(), getSetting("referralRewardTokens")]);
  const referees = await User.find({ _id: { $in: refs.map((r) => r.refereeId) } }).select("name email createdAt").lean();
  const byId = new Map(referees.map((u) => [String(u._id), u]));
  const subs = await Subscription.find({ userId: { $in: refs.map((r) => r.refereeId) }, status: "active", kind: "monthly" }).select("userId planSlug").lean();
  const planOf = new Map(subs.map((s) => [String(s.userId), s.planSlug]));
  const verified = refs.filter((r) => r.status === "verified");
  const myReferral = await Referral.findOne({ refereeId: user._id }).lean();
  const canEnterCode = !myReferral && Date.now() - new Date(user.createdAt).getTime() < REFERRAL_CODE_WINDOW_DAYS * 86_400_000;

  res.json({
    code: user.referralCode,
    link: `${env.APP_URL}/register?ref=${user.referralCode}`,
    rewardTokens: reward,
    verifyVia: telegramEnabled() ? "telegram" : "email",
    stats: {
      invited: refs.length,
      verified: verified.length,
      pending: refs.length - verified.length,
      tokensEarned: verified.reduce((n, r) => n + (r.rewardTokens ?? 0), 0),
    },
    referrals: refs.map((r) => {
      const u = byId.get(String(r.refereeId));
      return {
        id: String(r._id),
        name: u?.name || "Developer",
        email: u ? maskEmail(u.email) : "",
        joinedAt: r.createdAt,
        plan: planOf.get(String(r.refereeId)) ?? "free",
        status: r.status,
        rewardTokens: r.rewardTokens,
        verifiedAt: r.verifiedAt,
      };
    }),
    earnings: verified
      .filter((r) => r.verifiedAt)
      .sort((a, b) => new Date(a.verifiedAt!).getTime() - new Date(b.verifiedAt!).getTime())
      .map((r) => ({ at: r.verifiedAt, tokens: r.rewardTokens })),
    canEnterCode,
    referredBy: myReferral ? myReferral.code : null,
  });
});

// ── Notifications ───────────────────────────────────────
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const userId = me(req)._id;
  const filter: Record<string, unknown> = { userId };
  if (req.query.unread === "1") filter.readAt = null;
  if (typeof req.query.type === "string" && req.query.type) filter.type = req.query.type;
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const [rows, unread] = await Promise.all([Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(), Notification.countDocuments({ userId, readAt: null })]);
  res.json({
    unread,
    notifications: rows.map((n) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt, createdAt: n.createdAt })),
  });
});

notificationsRouter.post("/read", async (req, res) => {
  const body = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }).parse(req.body);
  const filter: Record<string, unknown> = { userId: me(req)._id, readAt: null };
  if (!body.all) filter._id = { $in: body.ids ?? [] };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  res.json({ ok: true });
});

notificationsRouter.delete("/:id", async (req, res) => {
  await Notification.deleteOne({ _id: req.params.id, userId: me(req)._id });
  res.json({ ok: true });
});

// ── Support tickets ─────────────────────────────────────
export const supportRouter = Router();
supportRouter.use(requireAuth);

export const serializeTicket = (t: any, full = false) => ({
  id: String(t._id),
  number: t.number,
  subject: t.subject,
  category: t.category,
  status: t.status,
  priority: t.priority,
  lastActivityAt: t.lastActivityAt,
  createdAt: t.createdAt,
  messageCount: t.messages?.length ?? 0,
  lastMessage: t.messages?.length ? { from: t.messages[t.messages.length - 1].from, body: String(t.messages[t.messages.length - 1].body).slice(0, 140) } : null,
  ...(full ? { messages: (t.messages ?? []).map((m: any) => ({ id: String(m._id), from: m.from, authorName: m.authorName, body: m.body, createdAt: m.createdAt })) } : {}),
});

supportRouter.get("/", async (req, res) => {
  const rows = await Ticket.find({ userId: me(req)._id }).sort({ lastActivityAt: -1 }).limit(100).lean();
  res.json({ tickets: rows.map((t) => serializeTicket(t)), supportEmail: await getSetting("supportEmail") });
});

supportRouter.post("/", async (req, res) => {
  const user = me(req);
  const body = z
    .object({ subject: z.string().trim().min(3, "Add a short subject").max(140), category: z.enum(TICKET_CATEGORIES).default("other"), message: z.string().trim().min(5, "Describe the issue").max(10_000) })
    .parse(req.body);
  const open = await Ticket.countDocuments({ userId: user._id, status: { $ne: "closed" } });
  if (open >= 10) throw badRequest("You have too many open tickets. Please close some first.");
  const t = await Ticket.create({
    userId: user._id,
    number: await nextSequence("ticket"),
    subject: body.subject,
    category: body.category,
    messages: [{ from: "user", authorId: user._id, authorName: user.name || user.email, body: body.message }],
  });
  await notifyAdmins({ type: "support", title: `New ticket #${t.number}: ${t.subject}`, body: body.message.slice(0, 200), link: `/admin/tickets?id=${t._id}` });
  res.status(201).json({ ticket: serializeTicket(t.toObject(), true) });
});

supportRouter.get("/:id", async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.id, userId: me(req)._id }).lean();
  if (!t) throw notFound("Ticket not found");
  res.json({ ticket: serializeTicket(t, true) });
});

supportRouter.post("/:id/reply", async (req, res) => {
  const user = me(req);
  const { message } = z.object({ message: z.string().trim().min(1).max(10_000) }).parse(req.body);
  const t = await Ticket.findOne({ _id: req.params.id, userId: user._id });
  if (!t) throw notFound("Ticket not found");
  t.messages.push({ from: "user", authorId: user._id, authorName: user.name || user.email, body: message, createdAt: new Date() });
  t.status = "open";
  t.lastActivityAt = new Date();
  await t.save();
  await notifyAdmins({ type: "support", title: `Reply on ticket #${t.number}`, body: message.slice(0, 200), link: `/admin/tickets?id=${t._id}` });
  res.json({ ticket: serializeTicket(t.toObject(), true) });
});

supportRouter.post("/:id/close", async (req, res) => {
  const t = await Ticket.findOneAndUpdate({ _id: req.params.id, userId: me(req)._id }, { $set: { status: "closed", lastActivityAt: new Date() } }, { new: true }).lean();
  if (!t) throw notFound("Ticket not found");
  res.json({ ticket: serializeTicket(t, true) });
});

// ── Feedback ────────────────────────────────────────────
export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);

feedbackRouter.post("/", async (req, res) => {
  const body = z
    .object({ type: z.enum(FEEDBACK_TYPES).default("idea"), rating: z.number().int().min(1).max(5).nullable().optional(), message: z.string().trim().min(3, "Tell us a bit more").max(5000), page: z.string().max(200).optional() })
    .parse(req.body);
  await Feedback.create({ userId: me(req)._id, ...body });
  res.status(201).json({ ok: true });
});

feedbackRouter.get("/", async (req, res) => {
  const rows = await Feedback.find({ userId: me(req)._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ feedback: rows.map((f) => ({ id: String(f._id), type: f.type, rating: f.rating, message: f.message, status: f.status, createdAt: f.createdAt })) });
});
