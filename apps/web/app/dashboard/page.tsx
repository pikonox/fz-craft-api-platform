"use client";

import { VsCodeCard } from "@/components/marketing/vscode";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, CircleDot, CodeXml, Eye, EyeOff, Plus, Star, Zap } from "lucide-react";
import { formatMs, formatNumber, formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CopyButton, EmptyState, Skeleton, StatusDot } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { TimeSeriesChart, RankedBars, Legend, usePalette, type Series } from "@/components/charts";
import { Ring, StatTile } from "@/components/dashboard/stat";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { useCheckout } from "@/lib/stores";
import type { ApiKeyInfo, BreakdownRow, LogRow, Summary, Timeseries } from "@/lib/types";
import { API_BASE_URL, cn, daysUntil, formatDate, greeting, relativeTime } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";

type Overview = { summary: Summary; timeseries: Timeseries; topModels: BreakdownRow[]; recent: LogRow[] };
type Range = "24h" | "7d" | "30d";
type Metric = "tokens" | "requests" | "spend";

export default function OverviewPage() {
  const { data: me } = useMe();
  const [range, setRange] = useState<Range>("7d");
  const [metric, setMetric] = useState<Metric>("tokens");
  const start = useCheckout((s) => s.start);
  const { data, isLoading } = useQuery({ queryKey: ["overview", range], queryFn: () => api<Overview>(`/api/usage/overview?range=${range}`), refetchInterval: 30_000 });
  const { data: keys } = useQuery({ queryKey: ["keys"], queryFn: () => api<{ keys: ApiKeyInfo[] }>("/api/keys") });
  const palette = usePalette();
  const mounted = useMounted();

  const e = me?.entitlement;
  const pct = e?.totalTokens ? (e.usedTokens / e.totalTokens) * 100 : 0;
  const cur = data?.summary.current;
  const prev = data?.summary.previous;
  const pts = data?.timeseries.points ?? [];
  const unit = data?.timeseries.unit ?? "day";
  const firstName = (me?.user.name || "").split(" ")[0];
  const activeKey = keys?.keys.find((k) => k.status === "active");
  const successRate = cur?.requests ? (cur.requests - cur.errors) / cur.requests : 1;
  const prevSuccess = prev?.requests ? (prev.requests - prev.errors) / prev.requests : 1;

  const series: Record<Metric, Series[]> = {
    tokens: [
      { key: "input", label: "Input", color: "--chart-1" },
      { key: "output", label: "Output", color: "--chart-2" },
    ],
    requests: [
      { key: "ok", label: "Successful", color: "--chart-1" },
      { key: "errors", label: "Errors", color: "--chart-5" },
    ],
    spend: [{ key: "spend", label: "Cost at model price", color: "--chart-1" }],
  };
  const chartData = pts.map((p) => ({
    t: p.t,
    input: Math.max(0, p.inputTokens - p.cachedTokens),
    output: p.outputTokens,
    ok: p.requests - p.errors,
    errors: p.errors,
    spend: p.costMicros,
  }));

  const onboarding = [
    { done: Boolean(keys?.keys.length), label: "Create an API key", href: "/dashboard/api-keys" },
    { done: (cur?.requests ?? 0) > 0 || (prev?.requests ?? 0) > 0, label: "Make your first request", href: "/docs" },
    { done: Boolean(me?.user.telegram.verified), label: "Verify Telegram to unlock rewards", href: "/dashboard/settings?tab=security" },
    { done: Boolean(e?.isPaid), label: "Pick a plan that fits", href: "/dashboard/billing/plan" },
  ];
  const showOnboarding = me && onboarding.filter((o) => o.done).length < onboarding.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight sm:text-[28px]">
            {mounted ? greeting() : "Welcome"}
            {firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your API today.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/playground">
              <CodeXml /> Playground
            </Link>
          </Button>
          <Button variant="primary" asChild>
            <Link href="/dashboard/api-keys?create=1">
              <Plus /> Create API key
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
        {/* Plan */}
        <Card className="hero-surface relative overflow-hidden">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
          <div className="relative p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="outline" className="bg-card/60">
                  <Star className="size-3" /> {e?.plan?.name ?? "Free"} plan
                </Badge>
                {e?.pass && (
                  <Badge tone="accent">
                    <Zap className="size-3" /> {e.pass.name} · ends {relativeTime(e.pass.termEndsAt)}
                  </Badge>
                )}
                <Badge tone="success" dot>
                  {e?.isPaid ? "Paid" : "Free tier"}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="bg-card/60" onClick={() => start({ purpose: "balance" })}>
                  Top up
                </Button>
                <Button size="sm" variant="primary" asChild>
                  <Link href="/dashboard/billing/plan">{e?.isPaid ? "Manage" : "Upgrade"}</Link>
                </Button>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-6">
              <Ring value={pct}>
                <span className="text-lg font-semibold tabular">{pct < 1 && pct > 0 ? "<1" : Math.round(pct)}%</span>
              </Ring>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Used this cycle</p>
                {e ? (
                  <p className="mt-1 text-3xl font-semibold tracking-tight tabular sm:text-4xl">
                    {formatTokens(e.usedTokens)}
                    <span className="ml-1.5 text-base font-normal text-muted-foreground">/ {formatTokens(e.totalTokens)} tokens</span>
                  </p>
                ) : (
                  <Skeleton className="mt-2 h-9 w-48" />
                )}
                <p className="mt-1 text-sm text-muted-foreground">{e?.rpm ?? 60} requests / min</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MiniTile label="Tokens left" value={e ? formatTokens(e.remainingTokens) : "—"} sub={e?.bonusTokens ? `incl. ${formatTokens(e.bonusTokens)} bonus` : undefined} />
              <MiniTile
                label={e?.plan?.isFree ? "Free tokens reset" : "Renews"}
                value={e?.plan ? formatDate(e.plan.periodEndsAt, { year: undefined }) : "—"}
                sub={e?.plan ? `in ${daysUntil(e.plan.periodEndsAt)}d` : undefined}
              />
              <MiniTile label="Balance" value={me ? formatUsd(me.user.mainBalance) : "—"} sub={me ? `Images: ${formatUsd(me.user.imageBalance)}` : undefined} />
            </div>
          </div>
        </Card>

        {/* Endpoint */}
        <Card className="flex flex-col">
          <CardHeader
            title="Your endpoint"
            description="Drop-in for any OpenAI SDK"
            action={
              <Badge tone="success">
                <StatusDot tone="success" /> Online
              </Badge>
            }
          />
          <CardBody className="flex flex-1 flex-col gap-3">
            <EndpointRow value={API_BASE_URL} />
            {activeKey ? <KeyRow keyInfo={activeKey} /> : <Skeleton className="h-12" />}
            <div className="mt-auto flex items-center justify-between pt-2">
              <Link href="/docs" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
                <BookOpen className="size-4" /> Quickstart guide
              </Link>
              <Link href="/dashboard/api-keys" className="text-[13px] text-muted-foreground hover:text-foreground">
                Manage keys →
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      {showOnboarding && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Get started</p>
            <p className="text-xs text-muted-foreground">
              {onboarding.filter((o) => o.done).length} of {onboarding.length} done
            </p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {onboarding.map((o) => (
              <Link
                key={o.label}
                href={o.href}
                className={cn("flex items-center gap-3 rounded-xl border border-border px-3.5 py-3 text-[13px] transition-colors hover:bg-muted/50", o.done && "text-muted-foreground")}
              >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", o.done ? "border-success bg-success text-white" : "border-border-strong")}>
                  {o.done ? <Check className="size-3" /> : <CircleDot className="size-3 text-subtle-foreground" />}
                </span>
                <span className={cn(o.done && "line-through")}>{o.label}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <VsCodeCard />

      {/* Activity */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            Activity
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <StatusDot tone="success" pulse /> Live
            </span>
          </h2>
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "24h", label: "24h" },
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Requests"
            loading={isLoading}
            value={formatNumber(cur?.requests ?? 0)}
            delta={cur && prev ? { current: cur.requests, previous: prev.requests } : undefined}
            spark={pts.map((p) => ({ t: p.t, v: p.requests }))}
            unit={unit}
            sparkFormat={formatNumber}
          />
          <StatTile
            label="Billed tokens"
            loading={isLoading}
            value={formatTokens(cur?.billedTokens ?? 0)}
            delta={cur && prev ? { current: cur.billedTokens, previous: prev.billedTokens } : undefined}
            spark={pts.map((p) => ({ t: p.t, v: p.billedTokens }))}
            unit={unit}
          />
          <StatTile
            label="Cost at model price"
            loading={isLoading}
            value={formatUsd(cur?.costMicros ?? 0)}
            delta={cur && prev ? { current: cur.costMicros, previous: prev.costMicros } : undefined}
            spark={pts.map((p) => ({ t: p.t, v: p.costMicros }))}
            unit={unit}
            sparkFormat={(v) => formatUsd(v)}
          />
          <StatTile
            label="Success rate"
            loading={isLoading}
            value={`${(successRate * 100).toFixed(1)}%`}
            delta={cur && prev && prev.requests ? { current: successRate, previous: prevSuccess } : undefined}
            sub={cur ? `p50 ${formatMs(data?.summary.latency.p50 ?? 0)} · p95 ${formatMs(data?.summary.latency.p95 ?? 0)}` : undefined}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader
            title="Usage over time"
            description={`${range === "24h" ? "Last 24 hours, hourly" : range === "7d" ? "Last 7 days, daily" : "Last 30 days, daily"}`}
            action={
              <Segmented
                size="sm"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "tokens", label: "Tokens" },
                  { value: "requests", label: "Requests" },
                  { value: "spend", label: "Spend" },
                ]}
              />
            }
          />
          <CardBody className="pt-4">
            <Legend series={series[metric]} palette={palette} className="mb-3" />
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <TimeSeriesChart
                data={chartData}
                series={series[metric]}
                unit={unit}
                kind="bar"
                height={260}
                format={metric === "spend" ? (v) => formatUsd(v) : metric === "requests" ? formatNumber : formatTokens}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Top models"
            description="Share of billed tokens"
            action={
              <Link href="/dashboard/usage" className="text-[13px] font-medium text-accent hover:underline">
                Details
              </Link>
            }
          />
          <CardBody>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : (
              <RankedBars
                rows={(data?.topModels ?? []).filter((m) => m.billedTokens > 0 || m.images > 0).map((m) => ({ name: m.name, value: m.billedTokens, sub: `${formatNumber(m.requests)} requests${m.images ? ` · ${m.images} images` : ""}` }))}
                empty={<EmptyState icon={<Zap />} title="No usage yet" description="Make a request and your top models show up here." className="py-8" />}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent requests"
          description="The latest calls across all keys"
          action={
            <Button size="sm" variant="ghost" asChild>
              <Link href="/dashboard/usage?tab=logs">
                All logs <ArrowRight />
              </Link>
            </Button>
          }
        />
        <div className="overflow-x-auto">
          {data && !data.recent.length ? (
            <EmptyState icon={<CodeXml />} title="No requests yet" description="Try the Playground or call the API with your key." action={<Button variant="outline" size="sm" asChild><Link href="/dashboard/playground">Open Playground</Link></Button>} />
          ) : (
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-subtle-foreground">
                  <th className="px-5 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Model</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tokens</th>
                  <th className="px-3 py-2.5 text-right font-medium">Latency</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent ?? []).map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-5 py-3 text-muted-foreground">{relativeTime(l.createdAt)}</td>
                    <td className="px-3 py-3 font-medium">{l.model}</td>
                    <td className="px-3 py-3 text-muted-foreground">{l.keyName}</td>
                    <td className="px-3 py-3 text-right tabular">{l.images ? `${l.images} img` : formatNumber(l.billedTokens)}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular">{formatMs(l.latencyMs)}</td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={l.status === "success" ? "success" : "danger"}>{l.status === "success" ? l.httpStatus : `${l.httpStatus} error`}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

function MiniTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 px-4 py-3 backdrop-blur">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-[15px] font-semibold tabular">{value}</p>
      {sub && <p className="text-[11px] text-subtle-foreground">{sub}</p>}
    </div>
  );
}

function EndpointRow({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 py-1.5 pl-3.5 pr-1.5">
      <code className="truncate text-[13px]">{value}</code>
      <CopyButton value={value} label="Base URL" />
    </div>
  );
}

function KeyRow({ keyInfo }: { keyInfo: ApiKeyInfo }) {
  const [secret, setSecret] = useState<string | null>(null);
  const reveal = async () => {
    if (secret) return setSecret(null);
    const r = await api<{ secret: string }>(`/api/keys/${keyInfo.id}/reveal`);
    setSecret(r.secret);
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 py-1.5 pl-3.5 pr-1.5">
      <code className="truncate text-[13px]">{secret ?? keyInfo.preview}</code>
      <span className="flex shrink-0">
        <button onClick={reveal} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={secret ? "Hide key" : "Reveal key"}>
          {secret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
        <KeyCopy id={keyInfo.id} />
      </span>
    </div>
  );
}

function KeyCopy({ id }: { id: string }) {
  const [value, setValue] = useState<string | null>(null);
  if (value) return <CopyButton value={value} label="API key" />;
  return (
    <button
      onClick={async () => {
        const r = await api<{ secret: string }>(`/api/keys/${id}/reveal`);
        setValue(r.secret);
        await navigator.clipboard.writeText(r.secret).catch(() => {});
        (await import("sonner")).toast.success("API key copied");
      }}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Copy key"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="14" height="14" x="8" y="8" rx="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
    </button>
  );
}
