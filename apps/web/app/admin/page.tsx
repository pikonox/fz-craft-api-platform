"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Server, Zap } from "lucide-react";
import { formatMs, formatNumber, formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, StatusDot } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { Legend, RankedBars, TimeSeriesChart, usePalette, type Series } from "@/components/charts";
import { StatTile } from "@/components/dashboard/stat";
import { useAdminStats } from "@/components/admin/queries";
import { UpstreamPoolCard } from "@/components/admin/upstream-pool";
import { Table, TD } from "@/components/admin/ui";
import type { AdminBreakdownRow } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Range = "7d" | "30d" | "90d";
type Metric = "tokens" | "requests";

const RANGE_LABEL: Record<Range, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days" };

export default function AdminOverviewPage() {
  const [range, setRange] = useState<Range>("30d");
  const [metric, setMetric] = useState<Metric>("tokens");
  const [rank, setRank] = useState<"tokens" | "requests">("tokens");
  const { data, isLoading } = useAdminStats(range);
  const { data: top, isLoading: topLoading } = useQuery({
    queryKey: ["admin", "breakdown", "model", range],
    queryFn: () => api<{ rows: AdminBreakdownRow[] }>(`/api/admin/usage/breakdown?by=model&range=${range}`).then((r) => r.rows),
  });
  const palette = usePalette();

  const unit = data?.series.unit ?? "day";
  const points = data?.series.points ?? [];

  // revenue & signup series only contain days with data: align them to the full day buckets
  const daily = useMemo(() => {
    const rev = new Map((data?.revenueSeries ?? []).map((p) => [p.t, p.value]));
    const sig = new Map((data?.signupSeries ?? []).map((p) => [p.t, p.value]));
    return points.map((p) => ({ t: p.t, revenue: rev.get(p.t) ?? 0, signups: sig.get(p.t) ?? 0 }));
  }, [data, points]);

  const usageSeries: Record<Metric, Series[]> = {
    tokens: [
      { key: "input", label: "Input", color: "--chart-1" },
      { key: "output", label: "Output", color: "--chart-2" },
    ],
    requests: [
      { key: "ok", label: "Successful", color: "--chart-1" },
      { key: "errors", label: "Errors", color: "--chart-5" },
    ],
  };
  const usageData = points.map((p) => ({ t: p.t, input: Math.max(0, p.inputTokens - p.cachedTokens), output: p.outputTokens, ok: p.requests - p.errors, errors: p.errors }));
  const cur = data?.usage.current;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Platform health, revenue and what needs your attention."
        actions={
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
            ]}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Users" loading={isLoading} value={formatNumber(data?.users ?? 0)} sub={data ? `${formatNumber(daily.reduce((n, d) => n + d.signups, 0))} joined in the last ${RANGE_LABEL[range]}` : undefined} />
        <StatTile label="New users · 24h" loading={isLoading} value={formatNumber(data?.newUsers24h ?? 0)} sub="Accounts created since yesterday" />
        <StatTile label="Paying users" loading={isLoading} value={formatNumber(data?.payingUsers ?? 0)} sub={data?.users ? `${((data.payingUsers / data.users) * 100).toFixed(1)}% of all users` : undefined} />
        <StatTile label={`Revenue · ${RANGE_LABEL[range]}`} loading={isLoading} value={formatUsd(data?.revenueMicros ?? 0)} sub={data ? `${formatNumber(data.deposits)} deposit${data.deposits === 1 ? "" : "s"}` : undefined} />
        <LinkTile href="/admin/payments" attention={(data?.pendingPayments ?? 0) > 0}>
          <StatTile
            label="Pending payments"
            loading={isLoading}
            value={formatNumber(data?.pendingPayments ?? 0)}
            sub={
              data ? (
                data.pendingPayments ? (
                  <span className="inline-flex items-center gap-1.5 text-warning">
                    <StatusDot tone="warning" pulse /> Waiting for review
                  </span>
                ) : (
                  "All caught up"
                )
              ) : undefined
            }
            className="h-full"
          />
        </LinkTile>
        <LinkTile href="/admin/tickets" attention={(data?.openTickets ?? 0) > 0}>
          <StatTile label="Open tickets" loading={isLoading} value={formatNumber(data?.openTickets ?? 0)} sub={data ? (data.openTickets ? "Users waiting for a reply" : "No open tickets") : undefined} className="h-full" />
        </LinkTile>
      </div>

      <UpstreamPoolCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue" description={`Approved deposits per day · last ${RANGE_LABEL[range]}`} />
          <CardBody className="pt-4">
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <TimeSeriesChart data={daily} series={[{ key: "revenue", label: "Revenue", color: "--chart-1" }]} unit="day" kind="bar" height={220} format={(v) => formatUsd(v)} yFormat={compactUsd} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Signups" description={`New accounts per day · last ${RANGE_LABEL[range]}`} />
          <CardBody className="pt-4">
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <TimeSeriesChart data={daily} series={[{ key: "signups", label: "Signups", color: "--chart-1" }]} unit="day" kind="bar" height={220} format={formatNumber} />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader
            title="Platform usage"
            description={cur ? `${formatNumber(cur.requests)} requests · ${formatTokens(cur.billedTokens)} billed tokens · p50 ${formatMs(data?.usage.latency.p50 ?? 0)}` : "All users, all keys"}
            action={
              <Segmented
                size="sm"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "tokens", label: "Tokens" },
                  { value: "requests", label: "Requests" },
                ]}
              />
            }
          />
          <CardBody className="pt-4">
            <Legend series={usageSeries[metric]} palette={palette} className="mb-3" />
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <TimeSeriesChart data={usageData} series={usageSeries[metric]} unit={unit} kind="bar" height={260} format={metric === "requests" ? formatNumber : formatTokens} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Top models"
            description={rank === "tokens" ? "Share of billed tokens" : "Share of requests"}
            action={
              <Segmented
                size="sm"
                value={rank}
                onChange={setRank}
                options={[
                  { value: "tokens", label: "Tokens" },
                  { value: "requests", label: "Requests" },
                ]}
              />
            }
          />
          <CardBody>
            {topLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : (
              <RankedBars
                rows={(top ?? [])
                  .map((m) => ({ name: m.name, value: rank === "tokens" ? m.billedTokens : m.requests, sub: `${formatNumber(m.requests)} requests${m.images ? ` · ${m.images} images` : ""} · ${formatUsd(m.costMicros)}` }))
                  .filter((r) => r.value > 0)
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 8)}
                format={rank === "tokens" ? formatTokens : formatNumber}
                empty={<EmptyState icon={<Zap />} title="No traffic yet" description="Model usage shows up here once requests come in." className="py-8" />}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Provider health"
          description="Upstream pools and keys currently cooling down after errors"
          action={
            <Button size="sm" variant="ghost" asChild>
              <Link href="/admin/providers">
                Manage <ArrowRight />
              </Link>
            </Button>
          }
        />
        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : !data?.providers.length ? (
          <EmptyState icon={<Server />} title="No providers" description="Add an upstream provider to start routing requests." action={<Button size="sm" variant="outline" asChild><Link href="/admin/providers">Add provider</Link></Button>} />
        ) : (
          <Table head={["Provider", "Status", "Keys", "Cooling down", "Available"]} minWidth={560}>
            {data.providers.map((p) => {
              const available = p.keys - p.cooling;
              const tone = !p.enabled ? "muted" : p.keys === 0 || available === 0 ? "danger" : p.cooling > 0 ? "warning" : "success";
              const label = !p.enabled ? "Disabled" : p.keys === 0 ? "No keys" : available === 0 ? "All keys cooling" : p.cooling > 0 ? "Degraded" : "Healthy";
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className={cn(TD, "font-medium")}>{p.name}</td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <StatusDot tone={tone} pulse={tone === "danger" || tone === "warning"} />
                      {label}
                    </span>
                  </td>
                  <td className={cn(TD, "tabular")}>{p.keys}</td>
                  <td className={cn(TD, "tabular")}>{p.cooling ? <Badge tone="warning">{p.cooling}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                  <td className={cn(TD, "w-[30%]")}>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted-2">
                        <div className={cn("h-full rounded-full", tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-danger")} style={{ width: `${p.keys ? (available / p.keys) * 100 : 0}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs text-muted-foreground tabular">
                        {available}/{p.keys}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

/** Axis ticks: whole dollars once values are large, cents below $10. */
function compactUsd(micros: number) {
  const usd = micros / 1_000_000;
  if (usd >= 1000) return `$${(usd / 1000).toFixed(usd >= 10_000 ? 0 : 1)}K`;
  if (usd >= 10) return `$${Math.round(usd)}`;
  return `$${usd.toFixed(2)}`;
}

function LinkTile({ href, attention, children }: { href: string; attention?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("group relative block rounded-2xl transition-shadow hover:ring-1 hover:ring-border-strong focus-visible:ring-2 focus-visible:ring-ring", attention && "ring-1 ring-warning/40")}>
      {children}
      <ArrowRight className="absolute right-4 top-4 size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}
