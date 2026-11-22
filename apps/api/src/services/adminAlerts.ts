/**
 * Emails (plus in-app and Telegram notes) to the platform admins:
 *  - a sale on every plan / pass purchase and renewal,
 *  - the shared upstream account (FreeModel.in) nearing the end of its plan or image balance,
 *  - the upstream rejecting our key or saying the account is out of credit.
 *
 * Every paid model is served from one upstream account. It has no usage API, so the pool is tracked
 * from our own records: the tokens and images we sent to that provider (UsageRollup).
 */
import type { Types } from "mongoose";
import { formatTokens, formatUsd, type NotificationType } from "@nova/shared";
import { Notification, Provider, ProviderKey, Setting, Subscription, UsageRollup, User } from "../db/models";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { sendMail } from "./mail";
import { getSettings, type UpstreamPoolSettings } from "./settings";
import { sendTelegramMessage } from "./telegram";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STATE_KEY = "upstreamPoolState";

// ── Sending ─────────────────────────────────────────────

type Topic = "sales" | "upstream";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function rows(items: [string, string][]) {
  return `<table style="width:100%;border-collapse:collapse;margin:4px 0 8px">${items
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 12px 7px 0;color:#71717a;white-space:nowrap;vertical-align:top;border-bottom:1px solid #26262d">${esc(k)}</td><td style="padding:7px 0;color:#f4f4f5;border-bottom:1px solid #26262d">${v}</td></tr>`,
    )
    .join("")}</table>`;
}

function bar(pct: number) {
  const p = Math.max(0, Math.min(100, pct));
  const color = p >= 100 ? "#ef4444" : p >= 80 ? "#f59e0b" : "#8b5cf6";
  return `<div style="height:8px;border-radius:99px;background:#26262d;margin:6px 0 4px"><div style="width:${p.toFixed(1)}%;height:8px;border-radius:99px;background:${color}"></div></div>`;
}

const button = (link: string, label = "Open admin") =>
  `<p style="margin:22px 0 0"><a href="${env.APP_URL}${link}" style="display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">${esc(label)} →</a></p>`;

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function recipients(configured: string, admins: { email: string }[]) {
  const list = configured
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return [...new Set(list.length ? list : admins.map((a) => a.email).filter(Boolean))];
}

/**
 * In-app notification for every admin always; email + Telegram unless that topic is switched off
 * in Admin settings (`force` ignores the switch, for test emails).
 */
async function alertAdmins(a: { topic: Topic; type: NotificationType; subject: string; title: string; text: string; html: string; link: string; force?: boolean }) {
  const [{ adminAlerts }, admins] = await Promise.all([
    getSettings(),
    User.find({ role: "admin", status: "active" }).select("_id email telegram notificationPrefs").lean(),
  ]);
  if (admins.length) {
    await Notification.insertMany(admins.map((u) => ({ userId: u._id, type: a.type, title: a.title, body: a.text, link: a.link })));
  }
  if (!a.force && !(a.topic === "sales" ? adminAlerts.sales : adminAlerts.upstream)) return { to: [] as string[], results: [] as string[] };

  const to = recipients(adminAlerts.email, admins);
  const results = await Promise.all(to.map((addr) => sendMail(addr, a.subject, a.title, a.html + button(a.link))));
  await Promise.all(
    admins
      .filter((u) => u.telegram?.id && u.notificationPrefs?.telegram !== false)
      .map((u) => sendTelegramMessage(u.telegram!.id!, a.title, a.text)),
  );
  return { to, results };
}

/** Fire-and-forget wrapper: alerts must never break a purchase or a request. */
function background(what: string, fn: () => Promise<unknown>) {
  fn().catch((err) => logger.error({ err }, `admin alert failed: ${what}`));
}

// ── Pool status ─────────────────────────────────────────

/** The upstream plan's current period: periodStart rolled forward by whole periods. */
export function currentWindow(p: Pick<UpstreamPoolSettings, "periodStart" | "periodDays">, now = Date.now()) {
  const start0 = Date.parse(`${p.periodStart}T00:00:00Z`);
  if (!p.periodStart || !Number.isFinite(start0)) return null;
  const len = Math.max(1, Math.round(p.periodDays || 30)) * DAY;
  const k = now < start0 ? 0 : Math.floor((now - start0) / len);
  const start = start0 + k * len;
  return { start: new Date(start), end: new Date(start + len) };
}

const hourFloor = (d: Date) => new Date(Math.floor(d.getTime() / HOUR) * HOUR);

async function sentSince(providerId: Types.ObjectId, since: Date) {
  const [r] = await UsageRollup.aggregate<{ tokens: number; images: number; requests: number }>([
    { $match: { providerId, bucket: { $gte: hourFloor(since) } } },
    { $group: { _id: null, tokens: { $sum: "$billedTokens" }, images: { $sum: "$images" }, requests: { $sum: "$requests" } } },
  ]);
  return { tokens: r?.tokens ?? 0, images: r?.images ?? 0, requests: r?.requests ?? 0 };
}

export type PoolStatus = Awaited<ReturnType<typeof poolStatus>>;

export async function poolStatus(now = Date.now()) {
  const { upstreamPool: p } = await getSettings();
  const provider = await Provider.findOne({ slug: p.providerSlug }).select("_id name slug").lean();

  // Plans customers have bought that are running now (each one can draw on the pool)
  const soldRows = await Subscription.aggregate<{ _id: string; tokens: number; count: number }>([
    { $match: { status: "active", cycle: { $ne: "free" }, termEndsAt: { $gt: new Date(now) } } },
    { $group: { _id: "$kind", tokens: { $sum: "$tokensLimit" }, count: { $sum: 1 } } },
  ]);
  const sold = {
    tokens: soldRows.reduce((n, r) => n + r.tokens, 0),
    plans: soldRows.find((r) => r._id === "monthly")?.count ?? 0,
    passes: soldRows.find((r) => r._id === "pass")?.count ?? 0,
  };
  if (!provider) return { settings: p, provider: null, tokens: null, images: null, sold, keyProblem: null };

  let tokens: {
    used: number;
    limit: number;
    pct: number;
    requests: number;
    windowStart: Date;
    windowEnd: Date;
    /** When the plan runs out at the current pace, if that's before the period ends */
    runsOutAt: Date | null;
  } | null = null;
  const win = p.tokens > 0 ? currentWindow(p, now) : null;
  if (win) {
    const used = await sentSince(provider._id, win.start);
    const elapsed = Math.max(HOUR, now - win.start.getTime());
    const perMs = used.tokens / elapsed;
    const outAt = perMs > 0 && used.tokens < p.tokens ? now + (p.tokens - used.tokens) / perMs : null;
    tokens = {
      used: used.tokens,
      limit: p.tokens,
      pct: (used.tokens / p.tokens) * 100,
      requests: used.requests,
      windowStart: win.start,
      windowEnd: win.end,
      runsOutAt: outAt && outAt < win.end.getTime() ? new Date(outAt) : null,
    };
  }

  let images: { count: number; spentMicros: number; budgetMicros: number; pct: number; since: Date } | null = null;
  const since = Date.parse(`${p.imageBudgetSince}T00:00:00Z`);
  if (p.imageBudgetMicros > 0 && Number.isFinite(since)) {
    const used = await sentSince(provider._id, new Date(since));
    const spent = used.images * p.imageCostMicros;
    images = { count: used.images, spentMicros: spent, budgetMicros: p.imageBudgetMicros, pct: (spent / p.imageBudgetMicros) * 100, since: new Date(since) };
  }

  // The most recent "key rejected / out of credit" error on this provider in the last day
  const bad = await ProviderKey.findOne({ providerId: provider._id, lastErrorAt: { $gte: new Date(now - DAY) }, lastError: /^(40[123]\b|429\b.*(insufficient|quota|exhaust|balance|credit|billing))/i })
    .sort({ lastErrorAt: -1 })
    .select("lastError lastErrorAt cooldownUntil")
    .lean();
  const keyProblem = bad ? { message: bad.lastError, at: bad.lastErrorAt!, coolingDown: Boolean(bad.cooldownUntil && bad.cooldownUntil.getTime() > now) } : null;

  return { settings: p, provider: { id: String(provider._id), name: provider.name, slug: provider.slug }, tokens, images, sold, keyProblem };
}

function poolSummaryHtml(st: PoolStatus) {
  if (!st.provider) return "";
  const name = esc(st.provider.name);
  const parts: string[] = [`<p style="margin:18px 0 4px;color:#f4f4f5;font-weight:600">Your ${name} pool</p>`];
  const soldLine = `${formatTokens(st.sold.tokens)} tokens across ${st.sold.plans} plan${st.sold.plans === 1 ? "" : "s"}${st.sold.passes ? ` and ${st.sold.passes} pass${st.sold.passes === 1 ? "" : "es"}` : ""}`;
  const items: [string, string][] = [["Sold & active", soldLine]];
  if (st.tokens) {
    items.push([`${name} plan`, `${formatTokens(st.tokens.limit)} tokens · ${formatTokens(st.tokens.used)} used (${st.tokens.pct.toFixed(0)}%)${bar(st.tokens.pct)}`]);
    if (st.sold.tokens > st.tokens.limit) {
      items.push(["Note", `<span style="color:#fbbf24">You've sold more tokens than your ${name} plan holds. That's fine while customers don't use their full allowance; watch the usage above.</span>`]);
    }
  } else {
    items.push([`${name} plan`, `<span style="color:#a1a1aa">Not set. Add your plan size in Admin → Overview to get usage warnings.</span>`]);
  }
  parts.push(rows(items));
  return parts.join("");
}

// ── Sales ───────────────────────────────────────────────

export type SaleInfo = {
  userId: Types.ObjectId | string;
  planName: string;
  kind: "monthly" | "pass";
  cycle: string;
  priceMicros: number;
  tokens: number;
  rpm: number;
  termEndsAt: Date;
  /** How it was paid: a payment method name, "Balance", or "Auto-renewal from balance" */
  via: string;
  renewal?: boolean;
};

type AlertMessage = { subject: string; title: string; text: string; html: string; link: string };

/** The sale email, without sending it. */
export function composeSaleEmail(a: SaleInfo, user: { name?: string | null; email?: string | null } | null, st: PoolStatus): AlertMessage {
  const what = a.kind === "pass" ? `${a.planName} pass` : `${a.planName} plan`;
  const price = formatUsd(a.priceMicros);
  const title = a.renewal ? `Renewal: ${what} · ${price}` : `New sale: ${what} · ${price}`;
  const html =
    rows([
      ["Customer", `${esc(user?.name || "—")}<br><span style="color:#a1a1aa">${esc(user?.email ?? "")}</span>`],
      [a.kind === "pass" ? "Pass" : "Plan", `${esc(a.planName)} · ${esc(a.kind === "pass" ? "24 hours" : a.cycle)}`],
      ["Includes", `${formatTokens(a.tokens)} tokens · ${a.rpm} requests/min`],
      ["Price", `<b>${price}</b>`],
      ["Paid with", esc(a.via)],
      ["Active until", esc(day(a.termEndsAt))],
    ]) + poolSummaryHtml(st);
  return {
    subject: `💰 ${title}`,
    title,
    text: `${user?.name || user?.email || "A user"} · ${a.via}`,
    html,
    link: user?.email ? `/admin/users?q=${encodeURIComponent(user.email)}` : "/admin/users",
  };
}

/** Email the admins about a plan or pass that was just bought or renewed. */
export function saleAlert(a: SaleInfo) {
  background("sale", async () => {
    const [user, st] = await Promise.all([User.findById(a.userId).select("name email").lean(), poolStatus()]);
    await alertAdmins({ topic: "sales", type: "billing", ...composeSaleEmail(a, user, st) });
  });
}

// ── Upstream pool warnings (cron) ───────────────────────

/** The "plan is N% used" email, without sending it. `level` is the threshold crossed (or 100). */
export function composeTokenWarning(st: PoolStatus, level: number): AlertMessage {
  const t = st.tokens!;
  const name = st.provider?.name ?? "Upstream";
  const full = level >= 100;
  const title = full ? `${name} plan is used up (${t.pct.toFixed(0)}%)` : `${name} plan is ${t.pct.toFixed(0)}% used`;
  return {
    subject: `${full ? "🛑" : "⚠️"} ${title}`,
    title,
    text: `${formatTokens(t.used)} of ${formatTokens(t.limit)} tokens since ${day(t.windowStart)}. Resets ${day(t.windowEnd)}.`,
    html:
      `<p style="margin:0 0 8px">${
        full ? `Your paid models may start failing for customers. Upgrade or top up your ${esc(name)} plan now.` : `Upgrade your ${esc(name)} plan or keep an eye on it before it runs out.`
      }</p>` +
      rows([
        ["Used", `${formatTokens(t.used)} of ${formatTokens(t.limit)} tokens (${t.pct.toFixed(1)}%)${bar(t.pct)}`],
        ["Period", `${esc(day(t.windowStart))} → resets ${esc(day(t.windowEnd))}`],
        ...(t.runsOutAt && !full ? ([["At this pace", `runs out around <b>${esc(day(t.runsOutAt))}</b>`]] as [string, string][]) : []),
        ["Sold & active", `${formatTokens(st.sold.tokens)} tokens across ${st.sold.plans + st.sold.passes} plans/passes`],
      ]) +
      `<p style="margin:8px 0 0;font-size:12px;color:#71717a">Counted by ${esc(env.BRAND_NAME)} from the requests it sent to ${esc(name)}. Compare with ${esc(name)}'s own dashboard now and then.</p>`,
    link: "/admin",
  };
}

type PoolState = { tokensKey?: string; tokensWarned?: number; imagesKey?: string; imagesWarned?: number };

/** Warn once at alertPercent and once at 100%, per upstream period (tokens) or per balance entered (images). */
export async function checkUpstreamPool() {
  const st = await poolStatus();
  if (!st.provider || (!st.tokens && !st.images)) return;
  const { adminAlerts } = await getSettings();
  if (!adminAlerts.upstream) return;
  const doc = await Setting.findOne({ key: STATE_KEY }).lean();
  const state: PoolState = { ...((doc?.value as PoolState) ?? {}) };
  const threshold = Math.min(99, Math.max(1, st.settings.alertPercent || 80));
  const level = (pct: number) => (pct >= 100 ? 100 : pct >= threshold ? threshold : 0);
  const name = st.provider.name;
  let changed = false;

  if (st.tokens) {
    const t = st.tokens;
    const key = `${t.windowStart.toISOString()}|${t.limit}`;
    if (state.tokensKey !== key) {
      Object.assign(state, { tokensKey: key, tokensWarned: 0 });
      changed = true;
    }
    const lv = level(t.pct);
    if (lv > (state.tokensWarned ?? 0)) {
      await alertAdmins({ topic: "upstream", type: "usage", ...composeTokenWarning(st, lv) });
      state.tokensWarned = lv;
      changed = true;
    }
  }

  if (st.images) {
    const im = st.images;
    const key = `${im.since.toISOString()}|${im.budgetMicros}|${st.settings.imageCostMicros}`;
    if (state.imagesKey !== key) {
      Object.assign(state, { imagesKey: key, imagesWarned: 0 });
      changed = true;
    }
    const lv = level(im.pct);
    if (lv > (state.imagesWarned ?? 0)) {
      const full = lv >= 100;
      const title = full ? `${name} image balance is used up` : `${name} image balance is ${im.pct.toFixed(0)}% used`;
      await alertAdmins({
        topic: "upstream",
        type: "usage",
        subject: `${full ? "🛑" : "⚠️"} ${title}`,
        title,
        text: `${formatUsd(im.spentMicros)} of ${formatUsd(im.budgetMicros)} spent on ${im.count} images since ${day(im.since)}.`,
        html:
          `<p style="margin:0 0 8px">Top up your ${esc(name)} balance${full ? " now: Image Studio may start failing" : " soon"}, then enter the new balance in Admin → Overview.</p>` +
          rows([
            ["Spent", `${formatUsd(im.spentMicros)} of ${formatUsd(im.budgetMicros)} (${im.pct.toFixed(1)}%)${bar(im.pct)}`],
            ["Images", `${im.count} since ${esc(day(im.since))} at ${formatUsd(st.settings.imageCostMicros)} each`],
          ]),
        link: "/admin",
      });
      state.imagesWarned = lv;
      changed = true;
    }
  }

  if (changed) await Setting.updateOne({ key: STATE_KEY }, { $set: { value: state } }, { upsert: true });
}

// ── Upstream rejected our key / out of credit (from the router) ─

const OUT_OF_CREDIT = /insufficient|quota|exhaust|out of (credit|tokens|balance)|balance|billing|payment required|credit/i;
const lastRejectAlert = new Map<string, number>();
const REJECT_ALERT_EVERY_MS = 6 * HOUR;

/** True when an upstream error means our account there needs attention (not a passing hiccup). */
export function isUpstreamAccountError(status: number, message: string) {
  return status === 401 || status === 402 || status === 403 || (status === 429 && OUT_OF_CREDIT.test(message));
}

/** Called by the router on every upstream failure; emails the admins at most every 6 hours per provider. */
export function upstreamFailed(provider: { _id: Types.ObjectId | string; name: string }, status: number, message: string) {
  if (!isUpstreamAccountError(status, message)) return;
  const id = String(provider._id);
  const last = lastRejectAlert.get(id) ?? 0;
  if (Date.now() - last < REJECT_ALERT_EVERY_MS) return;
  lastRejectAlert.set(id, Date.now());

  background("upstream rejected", () => alertAdmins({ topic: "upstream", type: "system", ...composeRejectedEmail(provider.name, status, message) }));
}

/** The "key rejected / out of credit" email, without sending it. */
export function composeRejectedEmail(name: string, status: number, message: string): AlertMessage {
  const credit = status === 402 || status === 429 || OUT_OF_CREDIT.test(message);
  const title = credit ? `${name} says your account is out of credit` : `${name} rejected your API key`;
  return {
    subject: `🛑 ${title}`,
    title,
    text: `${status}: ${message.slice(0, 200)}`,
    html:
      `<p style="margin:0 0 8px">${
        credit
          ? `Top up or upgrade your ${esc(name)} plan. Until then, models served only by ${esc(name)} fail for your customers.`
          : `Check the API key in your server's .env (UPSTREAM_API_KEYS) or in Admin → Providers, and that it hasn't been deleted at ${esc(name)}.`
      }</p>` +
      rows([
        ["Provider", esc(name)],
        ["Error", `<code style="color:#fca5a5">${esc(`${status}: ${message.slice(0, 300)}`)}</code>`],
        ["What happens now", "That key rests for 1 hour, then it's tried again automatically. You'll get this email at most every 6 hours."],
      ]),
    link: "/admin/providers",
  };
}

// ── Test ────────────────────────────────────────────────

/** Sends a sample alert to the configured recipients, ignoring the on/off switches. */
export async function sendTestAlert() {
  const st = await poolStatus();
  const r = await alertAdmins({
    topic: "upstream",
    type: "system",
    force: true,
    subject: `✅ Test alert from ${env.BRAND_NAME}`,
    title: "Admin alerts are working",
    text: "This is a test. Sale emails and upstream warnings will arrive like this.",
    html: `<p style="margin:0 0 8px">This is a test. Sale emails and ${esc(st.provider?.name ?? "upstream")} warnings will arrive like this one.</p>` + poolSummaryHtml(st),
    link: "/admin",
  });
  return r;
}
