import { Router, type Request } from "express";
import ExcelJS from "exceljs";
import { microsToUsd } from "@nova/shared";
import { ApiKey, RequestLog } from "../db/models";
import { me, requireAuth } from "../middleware/auth";
import { breakdown, buildMatch, liveBus, parseRange, summary, timeseries, type Filters } from "../services/analytics";
import { listModels } from "../gateway/registry";
import { sseHeaders } from "../gateway/stream";

export const usageRouter = Router();
usageRouter.use(requireAuth);

function filtersOf(req: Request): Filters {
  const q = req.query as Record<string, string | undefined>;
  return {
    keyId: q.keyId || undefined,
    model: q.model || undefined,
    vendor: q.vendor || undefined,
    status: q.status === "success" || q.status === "error" ? q.status : undefined,
    source: q.source || undefined,
  };
}

const rangeOf = (req: Request) => parseRange(req.query as Record<string, string>, me(req).defaults?.timezone || "UTC");

async function keyNames(userId: unknown) {
  const keys = await ApiKey.find({ userId }).select("name start last4").lean();
  return new Map(keys.map((k) => [String(k._id), k.name]));
}

export function serializeLog(l: any, names: Map<string, string>, vendors: Map<string, string>) {
  return {
    id: String(l._id),
    createdAt: l.createdAt,
    model: l.model,
    vendor: vendors.get(l.model) ?? "",
    endpoint: l.endpoint,
    source: l.source,
    keyId: l.apiKeyId ? String(l.apiKeyId) : null,
    keyName: l.apiKeyId ? (names.get(String(l.apiKeyId)) ?? "Deleted key") : l.source === "playground" ? "Playground" : l.source === "studio" ? "Image Studio" : "—",
    status: l.status,
    httpStatus: l.httpStatus,
    errorCode: l.errorCode,
    errorMessage: l.errorMessage,
    inputTokens: l.inputTokens,
    outputTokens: l.outputTokens,
    cachedTokens: l.cachedTokens,
    reasoningTokens: l.reasoningTokens,
    billedTokens: l.billedTokens,
    images: l.images,
    costMicros: l.costMicros,
    latencyMs: l.latencyMs,
    ttftMs: l.ttftMs,
    stream: l.stream,
    estimated: l.estimated,
  };
}

async function vendorMap() {
  return new Map((await listModels()).map((m) => [m.publicId, m.vendor || "Other"]));
}

usageRouter.get("/summary", async (req, res) => {
  res.json(await summary(me(req)._id, filtersOf(req), rangeOf(req)));
});

usageRouter.get("/timeseries", async (req, res) => {
  res.json(await timeseries(me(req)._id, filtersOf(req), rangeOf(req)));
});

usageRouter.get("/breakdown", async (req, res) => {
  const by = (["model", "key", "vendor", "source"] as const).find((b) => b === req.query.by) ?? "model";
  const rows = await breakdown(me(req)._id, filtersOf(req), rangeOf(req), by);
  if (by === "key") {
    const names = await keyNames(me(req)._id);
    res.json({ rows: rows.map((r) => ({ ...r, name: r.id ? (names.get(r.id) ?? "Deleted key") : "Playground & Studio" })) });
    return;
  }
  res.json({ rows: rows.map((r) => ({ ...r, name: r.id ?? "—" })) });
});

/** Everything the Overview page needs in one call. */
usageRouter.get("/overview", async (req, res) => {
  const userId = me(req)._id;
  const r = rangeOf(req);
  const [s, ts, models, recent, names, vendors] = await Promise.all([
    summary(userId, {}, r),
    timeseries(userId, {}, r),
    breakdown(userId, {}, r, "model"),
    RequestLog.find({ userId }).sort({ createdAt: -1 }).limit(6).lean(),
    keyNames(userId),
    vendorMap(),
  ]);
  res.json({ summary: s, timeseries: ts, topModels: models.slice(0, 6).map((m) => ({ ...m, name: m.id })), recent: recent.map((l) => serializeLog(l, names, vendors)) });
});

usageRouter.get("/logs", async (req, res) => {
  const userId = me(req)._id;
  const r = rangeOf(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 25));
  const match = await buildMatch(userId, filtersOf(req), "createdAt", r.from, r.to);
  const [rows, total, names, vendors] = await Promise.all([
    RequestLog.find(match).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    RequestLog.countDocuments(match),
    keyNames(userId),
    vendorMap(),
  ]);
  res.json({ logs: rows.map((l) => serializeLog(l, names, vendors)), total, page, limit });
});

usageRouter.get("/filters", async (req, res) => {
  const userId = me(req)._id;
  const [keys, models] = await Promise.all([ApiKey.find({ userId }).select("name status").sort({ createdAt: -1 }).lean(), RequestLog.distinct("model", { userId })]);
  const vendors = await vendorMap();
  res.json({
    keys: keys.map((k) => ({ id: String(k._id), name: k.name, status: k.status })),
    models: models.sort(),
    vendors: [...new Set(models.map((m) => vendors.get(m) ?? "Other"))].sort(),
  });
});

usageRouter.get("/export", async (req, res) => {
  const userId = me(req)._id;
  const r = rangeOf(req);
  const format = req.query.format === "xlsx" ? "xlsx" : "csv";
  const match = await buildMatch(userId, filtersOf(req), "createdAt", r.from, r.to);
  const [names, vendors] = await Promise.all([keyNames(userId), vendorMap()]);
  const cursor = RequestLog.find(match).sort({ createdAt: -1 }).limit(100_000).lean().cursor();
  const header = ["Time (UTC)", "Model", "Provider", "Endpoint", "Source", "Key", "Status", "HTTP", "Input tokens", "Output tokens", "Cached tokens", "Reasoning tokens", "Billed tokens", "Images", "Cost (USD)", "Latency (ms)", "TTFT (ms)", "Error"];
  const row = (l: any) => {
    const s = serializeLog(l, names, vendors);
    return [new Date(s.createdAt).toISOString(), s.model, s.vendor, s.endpoint, s.source, s.keyName, s.status, s.httpStatus, s.inputTokens, s.outputTokens, s.cachedTokens, s.reasoningTokens, s.billedTokens, s.images, microsToUsd(s.costMicros), s.latencyMs, s.ttftMs ?? "", s.errorMessage];
  };
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="usage-${stamp}.csv"`);
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    res.write(header.join(",") + "\n");
    for await (const l of cursor) res.write(row(l).map(esc).join(",") + "\n");
    res.end();
    return;
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="usage-${stamp}.xlsx"`);
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const ws = wb.addWorksheet("Requests");
  ws.columns = header.map((h) => ({ header: h, width: Math.max(12, h.length + 2) }));
  ws.getRow(1).font = { bold: true };
  for await (const l of cursor) ws.addRow(row(l)).commit();
  ws.commit();
  await wb.commit();
});

/** Server-sent events: one event per new request for this user. */
usageRouter.get("/live", async (req, res) => {
  const userId = String(me(req)._id);
  const [names, vendors] = await Promise.all([keyNames(userId), vendorMap()]);
  res.writeHead(200, sseHeaders());
  res.write(`event: ready\ndata: {}\n\n`);
  const onLog = (doc: any) => res.write(`event: log\ndata: ${JSON.stringify(serializeLog(doc, names, vendors))}\n\n`);
  liveBus.on(`log:${userId}`, onLog);
  const ping = setInterval(() => res.write(`: ping\n\n`), 20_000);
  res.on("close", () => {
    clearInterval(ping);
    liveBus.off(`log:${userId}`, onLog);
  });
});
