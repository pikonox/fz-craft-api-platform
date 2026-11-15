import { EventEmitter } from "node:events";
import { Types, type PipelineStage } from "mongoose";
import { RequestLog, UsageRollup } from "../db/models";
import { listModels } from "../gateway/registry";
import { logger } from "../lib/logger";

// ── Ranges & buckets ────────────────────────────────────

export type RangeKey = "1h" | "24h" | "7d" | "30d" | "90d" | "custom";
const DUR: Record<Exclude<RangeKey, "custom">, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

export type Range = { from: Date; to: Date; prevFrom: Date; unit: "minute" | "hour" | "day"; unitMs: number; tz: string };

export function parseRange(q: { range?: string; from?: string; to?: string }, tz = "UTC"): Range {
  let from: Date;
  let to: Date;
  if (q.range === "custom" && q.from && q.to) {
    from = new Date(q.from);
    to = new Date(q.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
      to = new Date();
      from = new Date(to.getTime() - DUR["7d"]);
    }
    const max = DUR["90d"];
    if (to.getTime() - from.getTime() > max) from = new Date(to.getTime() - max);
  } else {
    const d = DUR[(q.range as keyof typeof DUR) ?? "7d"] ?? DUR["7d"];
    to = new Date();
    from = new Date(to.getTime() - d);
  }
  const span = to.getTime() - from.getTime();
  const unit = span <= 2 * 3_600_000 ? "minute" : span <= 2 * 86_400_000 ? "hour" : "day";
  const unitMs = unit === "minute" ? 60_000 : unit === "hour" ? 3_600_000 : 86_400_000;
  return { from, to, prevFrom: new Date(from.getTime() - span), unit, unitMs, tz: safeTz(tz) };
}

function safeTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function tzOffsetMs(ts: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

export function truncTs(ts: number, unitMs: number, tz: string) {
  const off = tzOffsetMs(ts, tz);
  return Math.floor((ts + off) / unitMs) * unitMs - off;
}

export function bucketList(r: Range): number[] {
  const out: number[] = [];
  let t = truncTs(r.from.getTime(), r.unitMs, r.tz);
  const end = r.to.getTime();
  while (t <= end && out.length < 2000) {
    out.push(t);
    // re-truncate after stepping so DST shifts don't drift
    t = truncTs(t + r.unitMs + (r.unit === "day" ? 3_600_000 : 0), r.unitMs, r.tz);
  }
  return out;
}

// ── Filters ─────────────────────────────────────────────

export type Filters = { keyId?: string; model?: string; vendor?: string; status?: "success" | "error"; source?: string };

async function modelsForVendor(vendor: string) {
  return (await listModels()).filter((m) => (m.vendor || "Other") === vendor).map((m) => m.publicId);
}

export async function buildMatch(userId: Types.ObjectId | null, f: Filters, timeField: "createdAt" | "bucket", from: Date, to: Date) {
  const match: Record<string, unknown> = { [timeField]: { $gte: from, $lt: to } };
  if (userId) match.userId = userId;
  if (f.keyId && Types.ObjectId.isValid(f.keyId)) match.apiKeyId = new Types.ObjectId(f.keyId);
  else if (f.keyId === "playground") match.apiKeyId = null;
  if (f.model) match.model = f.model;
  else if (f.vendor) match.model = { $in: await modelsForVendor(f.vendor) };
  if (f.source) match.source = f.source;
  if (f.status && timeField === "createdAt") match.status = f.status;
  return match;
}

/** Rollups can't filter by status and are hourly, so use raw logs for short ranges and status filters. */
function useRollups(r: Range, f: Filters) {
  return !f.status && r.unit === "day";
}

// ── Totals ──────────────────────────────────────────────

export type Totals = {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  billedTokens: number;
  images: number;
  costMicros: number;
  latencyAvgMs: number;
};

const emptyTotals = (): Totals => ({ requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, billedTokens: 0, images: 0, costMicros: 0, latencyAvgMs: 0 });

async function totals(userId: Types.ObjectId | null, f: Filters, from: Date, to: Date, rollups: boolean): Promise<Totals> {
  if (rollups) {
    const match = await buildMatch(userId, f, "bucket", from, to);
    const [row] = await UsageRollup.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          requests: { $sum: "$requests" },
          errors: { $sum: "$errorCount" },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          cachedTokens: { $sum: "$cachedTokens" },
          reasoningTokens: { $sum: "$reasoningTokens" },
          billedTokens: { $sum: "$billedTokens" },
          images: { $sum: "$images" },
          costMicros: { $sum: "$costMicros" },
          latencySum: { $sum: "$latencyMsSum" },
        },
      },
    ]);
    if (!row) return emptyTotals();
    return { ...row, latencyAvgMs: row.requests ? row.latencySum / row.requests : 0 };
  }
  const match = await buildMatch(userId, f, "createdAt", from, to);
  const [row] = await RequestLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        requests: { $sum: 1 },
        errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        cachedTokens: { $sum: "$cachedTokens" },
        reasoningTokens: { $sum: "$reasoningTokens" },
        billedTokens: { $sum: "$billedTokens" },
        images: { $sum: "$images" },
        costMicros: { $sum: "$costMicros" },
        latencyAvgMs: { $avg: "$latencyMs" },
      },
    },
  ]);
  return row ? { ...emptyTotals(), ...row } : emptyTotals();
}

async function latencyPercentiles(userId: Types.ObjectId | null, f: Filters, from: Date, to: Date) {
  const match = await buildMatch(userId, f, "createdAt", from, to);
  match.status = "success";
  try {
    const [row] = await RequestLog.aggregate([
      { $match: match },
      { $group: { _id: null, p: { $percentile: { input: "$latencyMs", p: [0.5, 0.95], method: "approximate" } }, ttft: { $avg: "$ttftMs" } } },
    ] as PipelineStage[]);
    return { p50: row?.p?.[0] ?? 0, p95: row?.p?.[1] ?? 0, ttftAvg: row?.ttft ?? 0 };
  } catch {
    // Older MongoDB without $percentile: compute from a sample
    const rows = await RequestLog.find(match).sort({ createdAt: -1 }).limit(5000).select("latencyMs ttftMs").lean();
    const l = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
    const pick = (p: number) => (l.length ? l[Math.min(l.length - 1, Math.floor(p * l.length))] : 0);
    const t = rows.filter((r) => r.ttftMs != null);
    return { p50: pick(0.5), p95: pick(0.95), ttftAvg: t.length ? t.reduce((n, r) => n + (r.ttftMs ?? 0), 0) / t.length : 0 };
  }
}

export async function summary(userId: Types.ObjectId | null, f: Filters, r: Range) {
  const ro = useRollups(r, f);
  const [cur, prev, lat] = await Promise.all([totals(userId, f, r.from, r.to, ro), totals(userId, f, r.prevFrom, r.from, ro), latencyPercentiles(userId, f, r.from, r.to)]);
  return { current: cur, previous: prev, latency: lat };
}

// ── Time series ─────────────────────────────────────────

export async function timeseries(userId: Types.ObjectId | null, f: Filters, r: Range) {
  const ro = useRollups(r, f);
  const timeField = ro ? "bucket" : "createdAt";
  const match = await buildMatch(userId, f, timeField, r.from, r.to);
  const bucketExpr = { $dateTrunc: { date: `$${timeField}`, unit: r.unit, binSize: 1, timezone: r.tz } };
  const group = ro
    ? {
        _id: bucketExpr,
        requests: { $sum: "$requests" },
        errors: { $sum: "$errorCount" },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        cachedTokens: { $sum: "$cachedTokens" },
        billedTokens: { $sum: "$billedTokens" },
        images: { $sum: "$images" },
        costMicros: { $sum: "$costMicros" },
      }
    : {
        _id: bucketExpr,
        requests: { $sum: 1 },
        errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        cachedTokens: { $sum: "$cachedTokens" },
        billedTokens: { $sum: "$billedTokens" },
        images: { $sum: "$images" },
        costMicros: { $sum: "$costMicros" },
      };
  const rows = await (ro ? UsageRollup : RequestLog).aggregate([{ $match: match }, { $group: group } as PipelineStage]);
  const byTs = new Map(rows.map((row: any) => [new Date(row._id).getTime(), row]));
  return {
    unit: r.unit,
    points: bucketList(r).map((t) => {
      const row: any = byTs.get(t) ?? {};
      return {
        t,
        requests: row.requests ?? 0,
        errors: row.errors ?? 0,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        cachedTokens: row.cachedTokens ?? 0,
        billedTokens: row.billedTokens ?? 0,
        images: row.images ?? 0,
        costMicros: row.costMicros ?? 0,
      };
    }),
  };
}

// ── Breakdowns ──────────────────────────────────────────

export async function breakdown(userId: Types.ObjectId | null, f: Filters, r: Range, by: "model" | "key" | "vendor" | "source") {
  const ro = useRollups(r, f);
  const timeField = ro ? "bucket" : "createdAt";
  const match = await buildMatch(userId, f, timeField, r.from, r.to);
  const keyField = by === "key" ? "$apiKeyId" : by === "source" ? "$source" : "$model";
  const rows = await (ro ? UsageRollup : RequestLog).aggregate([
    { $match: match },
    {
      $group: ro
        ? {
            _id: keyField,
            requests: { $sum: "$requests" },
            errors: { $sum: "$errorCount" },
            inputTokens: { $sum: "$inputTokens" },
            outputTokens: { $sum: "$outputTokens" },
            cachedTokens: { $sum: "$cachedTokens" },
            billedTokens: { $sum: "$billedTokens" },
            images: { $sum: "$images" },
            costMicros: { $sum: "$costMicros" },
            latencySum: { $sum: "$latencyMsSum" },
          }
        : {
            _id: keyField,
            requests: { $sum: 1 },
            errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
            inputTokens: { $sum: "$inputTokens" },
            outputTokens: { $sum: "$outputTokens" },
            cachedTokens: { $sum: "$cachedTokens" },
            billedTokens: { $sum: "$billedTokens" },
            images: { $sum: "$images" },
            costMicros: { $sum: "$costMicros" },
            latencySum: { $sum: "$latencyMs" },
          },
    } as PipelineStage,
    { $sort: { billedTokens: -1, requests: -1 } },
  ]);
  const out = rows.map((row: any) => ({
    id: row._id === null ? null : String(row._id),
    requests: row.requests,
    errors: row.errors,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cachedTokens: row.cachedTokens,
    billedTokens: row.billedTokens,
    images: row.images,
    costMicros: row.costMicros,
    latencyAvgMs: row.requests ? row.latencySum / row.requests : 0,
  }));
  if (by !== "vendor") return out;
  // Fold models into their vendor
  const models = new Map((await listModels()).map((m) => [m.publicId, m.vendor || "Other"]));
  const acc = new Map<string, (typeof out)[number]>();
  for (const row of out) {
    const v = models.get(row.id ?? "") ?? "Other";
    const cur = acc.get(v);
    if (!cur) acc.set(v, { ...row, id: v, latencyAvgMs: row.latencyAvgMs * row.requests });
    else {
      for (const k of ["requests", "errors", "inputTokens", "outputTokens", "cachedTokens", "billedTokens", "images", "costMicros"] as const) cur[k] += row[k];
      cur.latencyAvgMs += row.latencyAvgMs * row.requests;
    }
  }
  return [...acc.values()].map((r) => ({ ...r, latencyAvgMs: r.requests ? r.latencyAvgMs / r.requests : 0 })).sort((a, b) => b.billedTokens - a.billedTokens);
}

// ── Live tail ───────────────────────────────────────────

export const liveBus = new EventEmitter();
liveBus.setMaxListeners(0);
let changeStreamActive = false;

/** One change stream for the whole process; falls back to in-process events without a replica set. */
export function startLiveFeed() {
  try {
    const stream = RequestLog.watch([{ $match: { operationType: "insert" } }], { fullDocument: "default" });
    stream.on("change", (c: any) => {
      const doc = c.fullDocument;
      if (doc?.userId) liveBus.emit(`log:${doc.userId}`, doc);
      if (doc) liveBus.emit("log:*", doc);
    });
    stream.on("error", (err) => {
      changeStreamActive = false;
      logger.warn({ err: err.message }, "RequestLog change stream closed; live tail falls back to in-process events");
    });
    changeStreamActive = true;
  } catch (err) {
    logger.warn({ err }, "Change streams unavailable");
  }
}

export function emitLocalLog(doc: { userId: unknown }) {
  if (changeStreamActive) return;
  liveBus.emit(`log:${doc.userId}`, doc);
  liveBus.emit("log:*", doc);
}
