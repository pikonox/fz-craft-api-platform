"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { pctChange } from "@nova/shared";
import { Card, Skeleton } from "@/components/ui/primitives";
import { Sparkline, type SERIES_COLORS } from "@/components/charts";
import { cn } from "@/lib/utils";

export function Delta({ current, previous, inverse, className }: { current: number; previous: number; inverse?: boolean; className?: string }) {
  const c = pctChange(current, previous);
  if (c === null || !isFinite(c) || Math.abs(c) < 0.0005) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Minus className="size-3" /> no change
      </span>
    );
  }
  const up = c > 0;
  const good = inverse ? !up : up;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-success" : "text-danger", className)}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(c * 100) >= 1000 ? ">999" : Math.abs(c * 100).toFixed(Math.abs(c) < 0.1 ? 1 : 0)}%
      <span className="ml-1 font-normal text-muted-foreground">vs previous</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  delta,
  spark,
  color = "--chart-1",
  unit,
  sparkFormat,
  loading,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: { current: number; previous: number; inverse?: boolean };
  spark?: { t: number; v: number }[];
  color?: (typeof SERIES_COLORS)[number];
  unit?: "minute" | "hour" | "day";
  sparkFormat?: (v: number) => string;
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden p-5", className)}>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular">{value}</p>
      )}
      <div className="mt-2.5 min-h-4">{delta ? <Delta {...delta} /> : sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}</div>
      {spark && spark.length > 1 && (
        <div className="-mx-1 mt-3">
          <Sparkline data={spark} color={color} unit={unit} format={sparkFormat} height={40} />
        </div>
      )}
    </Card>
  );
}

/** Circular usage ring. */
export function Ring({ value, size = 104, stroke = 9, children }: { value: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (Math.max(v, v > 0 ? 1.5 : 0) / 100) * c}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
