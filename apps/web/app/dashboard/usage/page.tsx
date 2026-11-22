"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Radio, RefreshCw, ScrollText } from "lucide-react";
import { formatMs, formatNumber, formatPercent, formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, NativeSelect, PageHeader, Skeleton, StatusDot } from "@/components/ui/primitives";
import { Segmented, UnderlineTabs } from "@/components/ui/controls";
import { Dialog, DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from "@/components/ui/overlay";
import { Legend, TimeSeriesChart, usePalette, type Series } from "@/components/charts";
import { StatTile } from "@/components/dashboard/stat";
import { api } from "@/lib/api";
import type { BreakdownRow, LogRow, Summary, Timeseries } from "@/lib/types";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

type Range = "1h" | "24h" | "7d" | "30d" | "90d" | "custom";
type Tab = "overview" | "logs" | "model" | "key" | "vendor";
type Filters = { keyId: string; model: string; vendor: string; status: string };

function UsagePage() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const palette = usePalette();
  const [range, setRange] = useState<Range>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [f, setF] = useState<Filters>({ keyId: "", model: "", vendor: "", status: "" });
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "overview");
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(false);
  const [liveRows, setLiveRows] = useState<LogRow[]>([]);
  const [detail, setDetail] = useState<LogRow | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ range });
    if (range === "custom" && from && to) {
      p.set("from", new Date(from).toISOString());
      p.set("to", new Date(`${to}T23:59:59`).toISOString());
    }
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    return p.toString();
  }, [range, from, to, f]);

  useEffect(() => setPage(1), [qs]);

  const opts = { placeholderData: keepPreviousData, refetchInterval: live ? 15_000 : false as const };
  const filters = useQuery({ queryKey: ["usage", "filters"], queryFn: () => api<{ keys: { id: string; name: string }[]; models: string[]; vendors: string[] }>("/api/usage/filters") });
  const summary = useQuery({ queryKey: ["usage", "summary", qs], queryFn: () => api<Summary>(`/api/usage/summary?${qs}`).then((r) => (setUpdatedAt(new Date()), r)), ...opts });
  const series = useQuery({ queryKey: ["usage", "ts", qs], queryFn: () => api<Timeseries>(`/api/usage/timeseries?${qs}`), ...opts, enabled: tab === "overview" });
  const logs = useQuery({ queryKey: ["usage", "logs", qs, page], queryFn: () => api<{ logs: LogRow[]; total: number; page: number; limit: number }>(`/api/usage/logs?${qs}&page=${page}&limit=25`), ...opts });
  const by = tab === "model" || tab === "key" || tab === "vendor" ? tab : null;
  const breakdown = useQuery({ queryKey: ["usage", "by", by, qs], queryFn: () => api<{ rows: BreakdownRow[] }>(`/api/usage/breakdown?${qs}&by=${by}`), enabled: Boolean(by), ...opts });

  // Live tail over server-sent events
  useEffect(() => {
    if (!live) return;
    const es = new EventSource("/api/usage/live");
    es.addEventListener("log", (e) => {
      const row = JSON.parse((e as MessageEvent).data) as LogRow;
      setLiveRows((rows) => [row, ...rows].slice(0, 50));
    });
    return () => es.close();
  }, [live]);

  const cur = summary.data?.current;
  const prev = summary.data?.previous;
  const lat = summary.data?.latency;
  const unit = series.data?.unit ?? "day";
  const points = series.data?.points ?? [];
  const tokenSeries: Series[] = [
    { key: "input", label: "Input", color: "--chart-1" },
    { key: "output", label: "Output", color: "--chart-2" },
    { key: "cached", label: "Cached input", color: "--chart-3" },
  ];
  const reqSeries: Series[] = [
    { key: "ok", label: "Successful", color: "--chart-1" },
    { key: "errors", label: "Errors", color: "--chart-5" },
  ];
  const data = points.map((p) => ({ t: p.t, input: Math.max(0, p.inputTokens - p.cachedTokens), output: p.outputTokens, cached: p.cachedTokens, ok: p.requests - p.errors, errors: p.errors }));
  const cacheHit = cur?.inputTokens ? cur.cachedTokens / cur.inputTokens : 0;
  const exportUrl = (fmt: "csv" | "xlsx") => `/api/usage/export?${qs}&format=${fmt}`;

  return (
    <>
      <PageHeader
        title="Usage & logs"
        description="Every request, token and cent — per key, model and provider. History is kept for 90 days."
        actions={
          <>
            <Button variant="ghost" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["usage"] })} aria-label="Refresh">
              <RefreshCw className={cn(summary.isFetching && "animate-spin")} />
            </Button>
            <DropdownMenu>
              <DropdownTrigger asChild>
                <Button variant="outline">
                  <Download /> Export
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownItem asChild>
                  <a href={exportUrl("xlsx")}>
                    <FileSpreadsheet /> Excel (.xlsx)
                  </a>
                </DropdownItem>
                <DropdownItem asChild>
                  <a href={exportUrl("csv")}>
                    <FileText /> CSV
                  </a>
                </DropdownItem>
              </DropdownContent>
            </DropdownMenu>
            <Button variant={live ? "accent" : "outline"} onClick={() => setLive((l) => !l)}>
              {live ? <StatusDot tone="success" pulse /> : <Radio />} {live ? "Live" : "Go live"}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "1h", label: "1h" },
            { value: "24h", label: "24h" },
            { value: "7d", label: "7d" },
            { value: "30d", label: "30d" },
            { value: "90d", label: "90d" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-40" aria-label="From" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-40" aria-label="To" />
          </div>
        )}
        <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
          <NativeSelect value={f.keyId} onChange={(e) => setF({ ...f, keyId: e.target.value })} aria-label="API key">
            <option value="">All API keys</option>
            <option value="playground">Playground & Studio</option>
            {filters.data?.keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value, model: "" })} aria-label="Provider">
            <option value="">All providers</option>
            {filters.data?.vendors.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </NativeSelect>
          <NativeSelect value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} aria-label="Model">
            <option value="">All models</option>
            {filters.data?.models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </NativeSelect>
          <NativeSelect value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
            <option value="">Any status</option>
            <option value="success">Success</option>
            <option value="error">Errors</option>
          </NativeSelect>
        </div>
      </div>
      <p className="mt-2 text-right text-xs text-subtle-foreground">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : " "}</p>

      <div className="mt-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Requests"
          loading={summary.isLoading}
          value={formatNumber(cur?.requests ?? 0)}
          delta={cur && prev ? { current: cur.requests, previous: prev.requests } : undefined}
        />
        <StatTile
          label="Billed tokens"
          loading={summary.isLoading}
          value={formatTokens(cur?.billedTokens ?? 0)}
          delta={cur && prev ? { current: cur.billedTokens, previous: prev.billedTokens } : undefined}
        />
        <StatTile
          label="Cost at model price"
          loading={summary.isLoading}
          value={formatUsd(cur?.costMicros ?? 0)}
          delta={cur && prev ? { current: cur.costMicros, previous: prev.costMicros } : undefined}
        />
        <StatTile label="Latency p50 / p95" loading={summary.isLoading} value={<>{formatMs(lat?.p50 ?? 0)}<span className="ml-1 text-base font-normal text-muted-foreground">/ {formatMs(lat?.p95 ?? 0)}</span></>} sub={`avg ${formatMs(cur?.latencyAvgMs ?? 0)} · first token ${formatMs(lat?.ttftAvg ?? 0)}`} />
      </div>
      {cur && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 px-1 text-xs text-muted-foreground tabular">
          <span>errors <b className="text-foreground">{formatNumber(cur.errors)}</b></span>
          <span>success <b className="text-foreground">{formatPercent(cur.requests ? (cur.requests - cur.errors) / cur.requests : 1)}</b></span>
          <span>input <b className="text-foreground">{formatTokens(cur.inputTokens)}</b></span>
          <span>output <b className="text-foreground">{formatTokens(cur.outputTokens)}</b></span>
          <span>cached <b className="text-foreground">{formatTokens(cur.cachedTokens)}</b></span>
          <span>reasoning <b className="text-foreground">{formatTokens(cur.reasoningTokens)}</b></span>
          <span>images <b className="text-foreground">{formatNumber(cur.images)}</b></span>
          <span>avg / request <b className="text-foreground">{formatUsd(cur.requests ? cur.costMicros / cur.requests : 0)}</b></span>
        </div>
      )}

      <UnderlineTabs
        className="mt-8"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Overview" },
          { value: "logs", label: "Request logs", count: logs.data?.total },
          { value: "model", label: "By model" },
          { value: "key", label: "By key" },
          { value: "vendor", label: "By provider" },
        ]}
      />

      <div className="mt-5">
        {tab === "overview" && (
          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader title="Token usage trend" description="Input, output and cached input per interval" action={<Legend series={tokenSeries} palette={palette} />} />
              <CardBody>{series.isLoading ? <Skeleton className="h-[300px]" /> : <TimeSeriesChart data={data} series={tokenSeries} unit={unit} kind="area" height={300} />}</CardBody>
            </Card>
            <div className="grid gap-4">
              <Card>
                <CardHeader title="Requests" description="Successful vs errors" action={<Legend series={reqSeries} palette={palette} />} />
                <CardBody>{series.isLoading ? <Skeleton className="h-[160px]" /> : <TimeSeriesChart data={data} series={reqSeries} unit={unit} kind="bar" height={160} format={formatNumber} />}</CardBody>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Cache hit rate</p>
                  <p className="font-mono text-sm tabular">{formatPercent(cacheHit)}</p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-muted-2">
                  <div className="h-2 rounded-full bg-chart-3" style={{ width: `${Math.max(cacheHit * 100, cacheHit ? 1 : 0)}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Cached input counts like normal input. Long chats and coding sessions resend earlier messages on every step, so start a new chat when you change topic to use fewer tokens.</p>
              </Card>
            </div>
          </div>
        )}

        {tab === "logs" && (
          <Card>
            {live && (
              <div className="border-b border-border">
                <div className="flex items-center justify-between px-5 py-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <StatusDot tone="success" pulse /> Live tail
                  </p>
                  <span className="text-xs text-muted-foreground">{liveRows.length ? `${liveRows.length} new` : "Waiting for requests…"}</span>
                </div>
                {liveRows.length > 0 && <LogTable rows={liveRows} onOpen={setDetail} highlight />}
              </div>
            )}
            {logs.isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            ) : !logs.data?.logs.length ? (
              <EmptyState icon={<ScrollText />} title="No requests in this range" description="Change the filters or make a request with your API key." />
            ) : (
              <>
                <LogTable rows={logs.data.logs} onOpen={setDetail} />
                <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
                  <span className="tabular">
                    {(page - 1) * 25 + 1}–{Math.min(page * 25, logs.data.total)} of {formatNumber(logs.data.total)}
                  </span>
                  <div className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                      <ChevronLeft />
                    </Button>
                    <Button size="icon-sm" variant="ghost" disabled={page * 25 >= logs.data.total} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        )}

        {by && <BreakdownTable rows={breakdown.data?.rows} loading={breakdown.isLoading} label={by === "model" ? "Model" : by === "key" ? "API key" : "Provider"} />}
      </div>

      <LogDetail row={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function LogTable({ rows, onOpen, highlight }: { rows: LogRow[]; onOpen: (r: LogRow) => void; highlight?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-subtle-foreground">
            <th className="px-5 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Model</th>
            <th className="px-3 py-2.5 font-medium">Key</th>
            <th className="px-3 py-2.5 font-medium">Endpoint</th>
            <th className="px-3 py-2.5 text-right font-medium">In / Out</th>
            <th className="px-3 py-2.5 text-right font-medium">Cost</th>
            <th className="px-3 py-2.5 text-right font-medium">Latency</th>
            <th className="px-5 py-2.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} onClick={() => onOpen(l)} className={cn("cursor-pointer border-t border-border transition-colors hover:bg-muted/50", highlight && "animate-fade-in")}>
              <td className="whitespace-nowrap px-5 py-2.5 text-muted-foreground" title={formatDateTime(l.createdAt)}>
                {new Date(l.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </td>
              <td className="px-3 py-2.5 font-medium">{l.model}</td>
              <td className="max-w-40 truncate px-3 py-2.5 text-muted-foreground">{l.keyName}</td>
              <td className="px-3 py-2.5">
                <span className="font-mono text-xs text-muted-foreground">
                  {l.endpoint}
                  {l.stream ? " · stream" : ""}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular">
                {l.images ? `${l.images} img` : `${formatNumber(l.inputTokens)} / ${formatNumber(l.outputTokens)}`}
              </td>
              <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{formatUsd(l.costMicros)}</td>
              <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{formatMs(l.latencyMs)}</td>
              <td className="px-5 py-2.5 text-right">
                <Badge tone={l.status === "success" ? "success" : "danger"}>{l.httpStatus}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownTable({ rows, loading, label }: { rows?: BreakdownRow[]; loading: boolean; label: string }) {
  const total = (rows ?? []).reduce((n, r) => n + r.billedTokens, 0);
  if (loading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!rows?.length) return <Card><EmptyState icon={<ScrollText />} title="No usage in this range" /></Card>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-subtle-foreground">
            <th className="px-5 py-3 font-medium">{label}</th>
            <th className="px-3 py-3 text-right font-medium">Requests</th>
            <th className="px-3 py-3 text-right font-medium">Error rate</th>
            <th className="px-3 py-3 text-right font-medium">Input</th>
            <th className="px-3 py-3 text-right font-medium">Output</th>
            <th className="px-3 py-3 font-medium">Billed tokens</th>
            <th className="px-3 py-3 text-right font-medium">Cost</th>
            <th className="px-5 py-3 text-right font-medium">Avg latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? "none"} className="border-t border-border">
              <td className="px-5 py-3 font-medium">{r.name}</td>
              <td className="px-3 py-3 text-right tabular">{formatNumber(r.requests)}</td>
              <td className={cn("px-3 py-3 text-right tabular", r.errors ? "text-danger" : "text-muted-foreground")}>{formatPercent(r.requests ? r.errors / r.requests : 0)}</td>
              <td className="px-3 py-3 text-right tabular text-muted-foreground">{formatTokens(r.inputTokens)}</td>
              <td className="px-3 py-3 text-right tabular text-muted-foreground">{formatTokens(r.outputTokens)}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-14 text-right tabular">{r.images ? `${r.images} img` : formatTokens(r.billedTokens)}</span>
                  <div className="h-1.5 w-24 rounded-full bg-muted-2">
                    <div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${total ? Math.max(2, (r.billedTokens / total) * 100) : 0}%` }} />
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-right tabular">{formatUsd(r.costMicros)}</td>
              <td className="px-5 py-3 text-right tabular text-muted-foreground">{formatMs(r.latencyAvgMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LogDetail({ row, onClose }: { row: LogRow | null; onClose: () => void }) {
  if (!row) return null;
  const items: [string, React.ReactNode][] = [
    ["Request id", <code key="id" className="text-xs">{row.id}</code>],
    ["Time", formatDateTime(row.createdAt)],
    ["Model", row.model],
    ["Provider", row.vendor || "—"],
    ["Endpoint", `${row.endpoint}${row.stream ? " (stream)" : ""}`],
    ["Source", row.keyName],
    ["Status", <Badge key="s" tone={row.status === "success" ? "success" : "danger"}>{row.httpStatus} {row.status}</Badge>],
    ["Input tokens", formatNumber(row.inputTokens)],
    ["Cached input", formatNumber(row.cachedTokens)],
    ["Output tokens", formatNumber(row.outputTokens)],
    ["Reasoning tokens", formatNumber(row.reasoningTokens)],
    ["Billed tokens", formatNumber(row.billedTokens)],
    ...(row.images ? ([["Images", formatNumber(row.images)]] as [string, React.ReactNode][]) : []),
    ["Cost at model price", formatUsd(row.costMicros)],
    ["Latency", formatMs(row.latencyMs)],
    ["Time to first token", row.ttftMs != null ? formatMs(row.ttftMs) : "—"],
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Request details" description={relativeTime(row.createdAt)} size="md">
      <div className="overflow-hidden rounded-xl border border-border">
        {items.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 text-[13px] last:border-0">
            <span className="text-muted-foreground">{k}</span>
            <span className="text-right font-medium tabular">{v}</span>
          </div>
        ))}
      </div>
      {row.estimated && <p className="mt-3 text-xs text-muted-foreground">The provider didn&apos;t report usage for this request, so tokens were estimated.</p>}
      {row.errorMessage && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger-soft p-3.5">
          <p className="text-xs font-medium text-danger">{row.errorCode || "Error"}</p>
          <p className="mt-1 text-[13px]">{row.errorMessage}</p>
        </div>
      )}
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense>
      <UsagePage />
    </Suspense>
  );
}
