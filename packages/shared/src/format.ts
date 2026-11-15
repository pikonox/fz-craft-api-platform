/** 1234 -> "1.2K", 2_000_000 -> "2M" */
export function formatTokens(n: number): string {
  const v = Math.abs(n || 0);
  const sign = n < 0 ? "-" : "";
  if (v >= 1_000_000_000) return `${sign}${trim(v / 1_000_000_000)}B`;
  if (v >= 1_000_000) return `${sign}${trim(v / 1_000_000)}M`;
  if (v >= 1_000) return `${sign}${trim(v / 1_000)}K`;
  return `${sign}${Math.round(v)}`;
}

function trim(x: number): string {
  const s = x >= 100 ? x.toFixed(0) : x.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatNumber(n: number): string {
  return (n || 0).toLocaleString("en-US");
}

export function formatPercent(ratio: number, digits = 1): string {
  if (!isFinite(ratio)) return "0%";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatMs(ms: number): string {
  if (!ms) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

/** Percentage change vs previous period; null when there is no baseline. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? 1 : null;
  return (current - previous) / previous;
}
