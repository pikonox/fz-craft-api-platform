"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Brain, Braces, Eye, ImageIcon, Sparkles, Wrench } from "lucide-react";
import { formatTokenPrice, formatTokens, formatUsd } from "@nova/shared";
import { CopyButton, Skeleton } from "@/components/ui/primitives";
import { VendorMark } from "@/components/model-meta";
import { useModels } from "@/lib/queries";
import type { ModelInfo } from "@/lib/types";
import { API_BASE_URL, cn } from "@/lib/utils";
import { useInView, useReducedMotion } from "../motion";

/** Providers shown first, in this order; others follow by model count. */
const PREFERRED = ["Anthropic", "OpenAI", "Google", "DeepSeek", "xAI", "Alibaba", "Moonshot", "Zhipu", "ByteDance"];
const MAX_PROVIDER_TABS = 9;
const ROWS = 6;
const ROTATE_MS = 5500;

type Group = { key: string; label: string; vendor?: string; models: ModelInfo[]; total: number; href: string };

const rank = (v: string) => {
  const i = PREFERRED.indexOf(v);
  return i === -1 ? 99 : i;
};

function buildGroups(all: ModelInfo[]): Group[] {
  const byVendor = new Map<string, ModelInfo[]>();
  for (const m of all.filter((x) => x.type === "chat")) {
    const v = m.vendor || "Other";
    byVendor.set(v, [...(byVendor.get(v) ?? []), m]);
  }
  // Flagships first, models under maintenance last
  const order = (list: ModelInfo[]) =>
    [...list].sort((a, b) => Number(a.status === "maintenance") - Number(b.status === "maintenance") || b.pricing.inputPer1M - a.pricing.inputPer1M);
  const vendors = [...byVendor.keys()]
    .filter((v) => byVendor.get(v)!.some((m) => m.status !== "maintenance"))
    .sort((a, b) => rank(a) - rank(b) || byVendor.get(b)!.length - byVendor.get(a)!.length)
    .slice(0, MAX_PROVIDER_TABS);
  const groups: Group[] = vendors.map((v) => ({
    key: v,
    label: v,
    vendor: v,
    models: order(byVendor.get(v)!),
    total: byVendor.get(v)!.length,
    href: `/models?provider=${encodeURIComponent(v)}`,
  }));
  const media = all.filter((m) => m.type !== "chat");
  if (media.length) groups.push({ key: "media", label: "Images & embeddings", models: media, total: media.length, href: "/models?type=image" });
  return groups;
}

const CAPS = [
  { id: "reasoning", label: "Reasoning", icon: Brain },
  { id: "vision", label: "Vision", icon: Eye },
  { id: "tools", label: "Tool calling", icon: Wrench },
  { id: "json", label: "JSON mode", icon: Braces },
] as const;

function Price({ m }: { m: ModelInfo }) {
  if (m.type === "image") {
    const min = Math.min(...Object.values(m.pricing.perImage ?? {}).filter((v) => v > 0));
    return (
      <>
        <p className="text-[14px] font-semibold tabular-nums">{isFinite(min) ? formatUsd(min) : "—"}</p>
        <p className="text-[11px] text-subtle-foreground">per image, from</p>
      </>
    );
  }
  if (m.type === "embedding") {
    return (
      <>
        <p className="text-[14px] font-semibold tabular-nums">{formatTokenPrice(m.pricing.inputPer1M)}</p>
        <p className="text-[11px] text-subtle-foreground">per 1M tokens</p>
      </>
    );
  }
  return (
    <>
      <p className="text-[14px] font-semibold tabular-nums">
        {formatTokenPrice(m.pricing.inputPer1M)} <span className="font-normal text-subtle-foreground">/</span> {formatTokenPrice(m.pricing.outputPer1M)}
      </p>
      <p className="text-[11px] text-subtle-foreground">in / out per 1M</p>
    </>
  );
}

function Status({ m }: { m: ModelInfo }) {
  const base = "hidden shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-medium sm:inline";
  if (m.status === "maintenance") return <span className={cn(base, "bg-muted text-muted-foreground")}>Maintenance</span>;
  if (m.access === "free") return <span className={cn(base, "bg-success-soft text-success")}>Free plan</span>;
  return <span className={cn(base, "bg-warning-soft text-warning")}>Paid plans</span>;
}

function Row({ m, index }: { m: ModelInfo; index: number }) {
  return (
    <li
      className={cn(
        "fz-row grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:px-5 md:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1fr)_auto]",
        m.status === "maintenance" && "opacity-60",
      )}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <VendorMark vendor={m.vendor} type={m.type} modelId={m.id} className="size-9 rounded-lg text-xs" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium">{m.name}</span>
          {m.featured && m.status !== "maintenance" && <Sparkles className="size-3.5 shrink-0 text-accent" aria-label="Featured" />}
          <Status m={m} />
        </div>
        <div className="flex items-center gap-0.5 font-mono text-[11.5px] text-muted-foreground">
          <span className="truncate">{m.id}</span>
          <CopyButton value={m.id} label="Model id" size="xs" />
        </div>
      </div>
      <div className="hidden items-center gap-3 text-[12px] text-muted-foreground md:flex">
        <span className="flex gap-1.5">
          {CAPS.map((c) => (
            <c.icon
              key={c.id}
              className={cn("size-3.5", m.capabilities.includes(c.id) ? "text-foreground/70" : "text-foreground/15")}
              aria-label={m.capabilities.includes(c.id) ? c.label : `No ${c.label.toLowerCase()}`}
            >
              <title>{c.label}</title>
            </c.icon>
          ))}
        </span>
        {m.contextLength > 0 && <span className="tabular-nums">{formatTokens(m.contextLength)} ctx</span>}
      </div>
      <div className="text-right">
        <Price m={m} />
      </div>
    </li>
  );
}

/** Copy-paste request for the provider's flagship model, pinned to the bottom of the panel. */
function UseIt({ m }: { m: ModelInfo }) {
  const cmd =
    m.type === "image"
      ? `curl ${API_BASE_URL}/images/generations -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '{"model":"${m.id}","prompt":"a red fox in the snow","size":"1024x1024"}'`
      : m.type === "embedding"
        ? `curl ${API_BASE_URL}/embeddings -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '{"model":"${m.id}","input":"Hello"}'`
        : `curl ${API_BASE_URL}/chat/completions -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '{"model":"${m.id}","messages":[{"role":"user","content":"Hello!"}]}'`;
  return (
    <div className="fz-row mt-auto border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-subtle-foreground">Use it</span>
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/80">
          <span className="text-accent">curl</span> {cmd.slice(5)}
        </code>
        <CopyButton value={cmd} label="curl command" size="xs" />
      </div>
    </div>
  );
}

export function ModelShowcase() {
  const { data, isPending, isError } = useModels();
  const groups = React.useMemo(() => buildGroups(data ?? []), [data]);
  const [active, setActive] = React.useState(0);
  const [auto, setAuto] = React.useState(true);
  const [paused, setPaused] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const running = auto && !paused && inView && !reduced && groups.length > 1;

  // Auto-advance through providers until the visitor picks one themselves
  React.useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % groups.length), ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [running, active, groups.length]);

  const pick = (i: number) => {
    setActive(i);
    setAuto(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    pick((active + dir + groups.length) % groups.length);
  };

  const all = data ?? [];
  const g = groups[Math.min(active, Math.max(0, groups.length - 1))];
  const activeModels = g?.models.filter((m) => m.status !== "maintenance") ?? [];
  const cheapest = activeModels.filter((m) => m.type !== "image" && m.pricing.inputPer1M > 0).reduce((min, m) => Math.min(min, m.pricing.inputPer1M), Infinity);

  if (isError) return <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">The model catalog couldn&apos;t be loaded right now.</p>;

  return (
    <div className="space-y-8">
      <style>{`
        @keyframes fz-row { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes fz-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        .fz-row { animation: fz-row .4s ease-out both }
        @media (prefers-reduced-motion: reduce) { .fz-row { animation: none } }
      `}</style>

      <div ref={ref} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* Providers */}
        <div role="tablist" aria-label="Model providers" aria-orientation="vertical" onKeyDown={onKey} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
          {isPending
            ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-14 w-44 shrink-0 rounded-xl lg:w-full" />)
            : groups.map((x, i) => {
                const selected = i === active;
                return (
                  <button
                    key={x.key}
                    role="tab"
                    type="button"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => pick(i)}
                    className={cn(
                      "relative flex shrink-0 items-center gap-3 overflow-hidden rounded-xl border px-3 py-2 text-left transition-all duration-200 lg:w-full",
                      selected ? "border-border bg-card shadow-sm" : "border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground",
                    )}
                  >
                    {x.vendor ? (
                      <VendorMark vendor={x.vendor} modelId={x.models[0]?.id} className="size-8 rounded-lg text-xs" />
                    ) : (
                      <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-muted text-accent">
                        <ImageIcon className="size-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[14px] font-medium", selected && "text-foreground")}>{x.label}</span>
                      <span className="block text-[12px] text-subtle-foreground">
                        {x.total} model{x.total === 1 ? "" : "s"}
                      </span>
                    </span>
                    {selected && auto && !reduced && (
                      <span
                        key={`p${active}`}
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent"
                        style={{ animation: `fz-progress ${ROTATE_MS}ms linear forwards`, animationPlayState: running ? "running" : "paused" }}
                      />
                    )}
                  </button>
                );
              })}
        </div>

        {/* Models of the selected provider */}
        <div role="tabpanel" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {isPending || !g ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-8 w-56" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div key={`h${g.key}`} className="fz-row flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
                {g.vendor ? (
                  <VendorMark vendor={g.vendor} modelId={g.models[0]?.id} className="size-10 rounded-xl text-sm" />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted text-accent">
                    <ImageIcon className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold tracking-tight">{g.label}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {activeModels.length} available{g.total > activeModels.length ? ` · ${g.total - activeModels.length} in maintenance` : ""}
                    {isFinite(cheapest) ? ` · from ${formatTokenPrice(cheapest)} / 1M` : ""}
                  </p>
                </div>
                <Link href={g.href} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                  See all {g.total} <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <ul key={g.key}>
                {g.models.slice(0, ROWS).map((m, i) => (
                  <Row key={m.id} m={m} index={i} />
                ))}
              </ul>
              {g.total > ROWS && (
                <Link href={g.href} className="flex items-center justify-center gap-1 border-t border-border py-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
                  +{g.total - ROWS} more {g.label} models <ArrowRight className="size-3.5" />
                </Link>
              )}
              {activeModels[0] && <UseIt key={`u${g.key}`} m={activeModels[0]} />}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <Link href="/models" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:border-border-strong">
          Browse all {all.length || ""} models <ArrowRight className="size-4" />
        </Link>
        <p className="text-[12.5px] text-subtle-foreground">Compare prices, filter by capability and estimate your monthly usage.</p>
      </div>
    </div>
  );
}
