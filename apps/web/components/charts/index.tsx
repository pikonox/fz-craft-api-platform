"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatTokens } from "@nova/shared";
import { cn } from "@/lib/utils";

/**
 * Chart conventions (validated palette, see globals.css):
 *  - categorical hues in fixed order chart-1..5, colour follows the series, never the rank
 *  - 2px lines, 4px rounded bar ends, 2px gaps, recessive grid, single y-axis
 *  - a legend for ≥2 series, hover tooltip on every chart
 */
const VARS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-grid", "--chart-axis", "--card", "--elevated"] as const;
type Palette = Record<(typeof VARS)[number], string>;

const FALLBACK: Palette = {
  "--chart-1": "#8b7dff",
  "--chart-2": "#059669",
  "--chart-3": "#d97706",
  "--chart-4": "#0284c7",
  "--chart-5": "#db2777",
  "--chart-grid": "rgba(255,255,255,.06)",
  "--chart-axis": "#6e6e7c",
  "--card": "#101014",
  "--elevated": "#141419",
};

/** Recharts needs concrete colours, so read the CSS tokens and re-read on theme change. */
export function usePalette(): Palette {
  const { resolvedTheme } = useTheme();
  const [p, setP] = useState<Palette>(FALLBACK);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const next = { ...FALLBACK };
    for (const v of VARS) next[v] = cs.getPropertyValue(v).trim() || FALLBACK[v];
    setP(next);
  }, [resolvedTheme]);
  return p;
}

export const SERIES_COLORS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"] as const;

export type Series = { key: string; label: string; color: (typeof SERIES_COLORS)[number] };

export function tickFormatter(unit: "minute" | "hour" | "day") {
  return (t: number) => {
    const d = new Date(t);
    if (unit === "day") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: unit === "minute" ? "2-digit" : undefined });
  };
}

function tooltipTitle(t: number, unit: "minute" | "hour" | "day") {
  const d = new Date(t);
  if (unit === "day") return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Legend({ series, palette, className }: { series: Series[]; palette: Palette; className?: string }) {
  if (series.length < 2) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: palette[s.color] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label, series, palette, unit, format }: any) {
  if (!active || !payload?.length) return null;
  const total = series.length > 1 ? payload.reduce((n: number, p: any) => n + (Number(p.value) || 0), 0) : null;
  return (
    <div className="min-w-44 rounded-xl border border-border bg-elevated px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-foreground">{tooltipTitle(label, unit)}</p>
      <div className="space-y-1">
        {series.map((s: Series) => {
          const item = payload.find((p: any) => p.dataKey === s.key);
          return (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-[2px]" style={{ background: palette[s.color] }} />
                {s.label}
              </span>
              <span className="font-medium text-foreground tabular">{format(item?.value ?? 0)}</span>
            </div>
          );
        })}
        {total !== null && (
          <div className="mt-1 flex justify-between border-t border-border pt-1">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold text-foreground tabular">{format(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Time series as stacked areas or stacked bars, one y-axis. */
export function TimeSeriesChart({
  data,
  series,
  unit,
  kind = "area",
  height = 280,
  format = formatTokens,
  yFormat,
}: {
  data: Record<string, number>[];
  series: Series[];
  unit: "minute" | "hour" | "day";
  kind?: "area" | "bar" | "line";
  height?: number;
  format?: (v: number) => string;
  yFormat?: (v: number) => string;
}) {
  const p = usePalette();
  // An all-zero series in a stack would draw its line over the series below it — leave it out.
  const nonZero = series.filter((s) => data.some((d) => (d[s.key] ?? 0) > 0));
  series = nonZero.length ? nonZero : series.slice(0, 1);
  const axis = { stroke: p["--chart-axis"], fontSize: 11, tickLine: false, axisLine: false } as const;
  const common = (
    <>
      <CartesianGrid vertical={false} stroke={p["--chart-grid"]} strokeDasharray="3 4" />
      <XAxis dataKey="t" tickFormatter={tickFormatter(unit)} minTickGap={28} tickMargin={10} {...axis} />
      <YAxis tickFormatter={yFormat ?? format} width={52} tickMargin={6} allowDecimals={false} {...axis} />
      <Tooltip
        cursor={kind === "bar" ? { fill: p["--chart-grid"] } : { stroke: p["--chart-axis"], strokeWidth: 1, strokeDasharray: "3 3" }}
        content={<ChartTooltip series={series} palette={p} unit={unit} format={format} />}
        isAnimationActive={false}
      />
    </>
  );

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
            {common}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="a"
                fill={p[s.color]}
                stroke={p["--card"]}
                strokeWidth={series.length > 1 ? 1 : 0}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : kind === "line" ? (
          <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            {common}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={p[s.color]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: p["--card"] }} isAnimationActive={false} />
            ))}
          </LineChart>
        ) : (
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={p[s.color]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={p[s.color]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            {common}
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stackId="a"
                stroke={p[s.color]}
                strokeWidth={2}
                fill={`url(#fill-${s.key})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: p["--card"] }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny trend line for stat tiles (single series, hover shows the value). */
export function Sparkline({ data, color = "--chart-1", height = 44, format = formatTokens, unit = "day" }: { data: { t: number; v: number }[]; color?: (typeof SERIES_COLORS)[number]; height?: number; format?: (v: number) => string; unit?: "minute" | "hour" | "day" }) {
  const p = usePalette();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p[color]} stopOpacity={0.25} />
              <stop offset="100%" stopColor={p[color]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: p["--chart-axis"], strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-border bg-elevated px-2 py-1 text-[11px] shadow-lg">
                  <span className="text-muted-foreground">{tooltipTitle(payload[0].payload.t, unit)} · </span>
                  <span className="font-semibold tabular">{format(payload[0].value)}</span>
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="v" stroke={p[color]} strokeWidth={2} fill={`url(#spark-${color})`} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked share list: a readable alternative to a donut for "top N". */
export function RankedBars({ rows, format = formatTokens, color = "--chart-1", empty }: { rows: { name: string; value: number; sub?: string }[]; format?: (v: number) => string; color?: (typeof SERIES_COLORS)[number]; empty?: React.ReactNode }) {
  const p = usePalette();
  const total = rows.reduce((n, r) => n + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <>{empty}</>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.name} className="group" title={`${r.name}: ${format(r.value)}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium">{r.name}</span>
            <span className="shrink-0 text-muted-foreground tabular">
              {format(r.value)} <span className="text-subtle-foreground">· {total ? Math.round((r.value / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted-2">
            <div className="h-2 rounded-full transition-[width] duration-500 group-hover:brightness-110" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: p[color] }} />
          </div>
          {r.sub && <p className="mt-1 text-[11px] text-subtle-foreground">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
