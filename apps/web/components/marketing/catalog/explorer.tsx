"use client";

import * as React from "react";
import Link from "next/link";
import { Brain, Braces, Calculator, Eye, LayoutGrid, Lock, Rows3, Search, Sparkles, Wrench, X } from "lucide-react";
import { formatTokenPrice, formatTokens, formatUsd } from "@nova/shared";
import { Badge, CopyButton, Input, Kbd, NativeSelect, Skeleton } from "@/components/ui/primitives";
import { Segmented, Switch } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { VendorMark } from "@/components/model-meta";
import { VendorLogo } from "@/components/vendor-logo";
import { useModels, usePlans } from "@/lib/queries";
import type { ModelInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSession } from "../session";

type TypeFilter = "all" | ModelInfo["type"];
type Sort = "price-asc" | "price-desc" | "context" | "name";
type Cap = "reasoning" | "vision" | "tools" | "json";

const CAPS: { id: Cap; label: string; icon: typeof Brain }[] = [
  { id: "reasoning", label: "Reasoning", icon: Brain },
  { id: "vision", label: "Vision", icon: Eye },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "json", label: "JSON mode", icon: Braces },
];

const TYPE_RANK: Record<ModelInfo["type"], number> = { chat: 0, embedding: 1, image: 2 };

/** Comparable price: input per 1M for text models, cheapest image tier for image models. */
const priceOf = (m: ModelInfo) => (m.type === "image" ? Math.min(...Object.values(m.pricing.perImage ?? {}).filter((v) => v > 0), Infinity) : m.pricing.inputPer1M);

const pill = (on: boolean) =>
  cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
    on ? "border-accent/50 bg-accent-soft text-accent" : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
  );

export function CatalogExplorer() {
  const { data, isPending, isError } = useModels();
  const all = React.useMemo(() => data ?? [], [data]);
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<TypeFilter>("all");
  const [vendor, setVendor] = React.useState<string | null>(null);
  const [caps, setCaps] = React.useState<Cap[]>([]);
  const [sort, setSort] = React.useState<Sort>("price-asc");
  const [view, setView] = React.useState<"grid" | "table">("grid");
  const [showMaint, setShowMaint] = React.useState(true);
  const [estimateId, setEstimateId] = React.useState<string | null>(null);
  const search = React.useRef<HTMLInputElement>(null);

  // Deep links from the homepage, e.g. /models?provider=Anthropic or /models?type=image
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const provider = sp.get("provider");
    if (provider) setVendor(provider);
    const t = sp.get("type");
    if (t === "chat" || t === "image" || t === "embedding") setType(t);
  }, []);

  // "/" focuses search, like most docs sites
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = all.filter((m) => m.status !== "maintenance");
  const vendors = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of all) if (m.vendor) counts.set(m.vendor, (counts.get(m.vendor) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [all]);
  const textModels = active.filter((m) => m.type !== "image" && m.pricing.inputPer1M > 0);
  const cheapest = textModels.length ? Math.min(...textModels.map((m) => m.pricing.inputPer1M)) : 0;
  const maxCtx = Math.max(0, ...active.map((m) => m.contextLength));

  const needle = q.trim().toLowerCase();
  const list = all
    .filter((m) => (type === "all" ? true : m.type === type))
    .filter((m) => (vendor ? m.vendor === vendor : true))
    .filter((m) => caps.every((c) => m.capabilities.includes(c)))
    .filter((m) => (showMaint ? true : m.status !== "maintenance"))
    .filter((m) => !needle || `${m.name} ${m.id} ${m.vendor}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      const maint = Number(a.status === "maintenance") - Number(b.status === "maintenance");
      if (maint) return maint;
      if (sort === "name") return a.name.localeCompare(b.name);
      // Per-image and per-token prices aren't comparable: chat first, then embeddings, then images
      const typeOrder = TYPE_RANK[a.type] - TYPE_RANK[b.type];
      if (typeOrder) return typeOrder;
      if (sort === "context") return b.contextLength - a.contextLength;
      return sort === "price-asc" ? priceOf(a) - priceOf(b) : priceOf(b) - priceOf(a);
    });

  const filtered = Boolean(needle || vendor || caps.length || type !== "all" || !showMaint);
  const reset = () => {
    setQ("");
    setVendor(null);
    setCaps([]);
    setType("all");
    setShowMaint(true);
  };
  const estimate = (id: string) => {
    setEstimateId(id);
    document.getElementById("estimator")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const typeOptions = (
    [
      { value: "all", label: "All", count: all.length },
      { value: "chat", label: "Chat", count: all.filter((m) => m.type === "chat").length },
      { value: "image", label: "Images", count: all.filter((m) => m.type === "image").length },
      { value: "embedding", label: "Embeddings", count: all.filter((m) => m.type === "embedding").length },
    ] as { value: TypeFilter; label: string; count: number }[]
  ).filter((o) => o.value === "all" || o.count);

  return (
    <div className="space-y-12">
      {/* Headline numbers */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
        {[
          ["Active models", isPending ? "—" : String(active.length)],
          ["Providers", isPending ? "—" : String(vendors.length)],
          ["Context up to", isPending ? "—" : formatTokens(maxCtx)],
          ["From", isPending ? "—" : `${formatTokenPrice(cheapest)} / 1M`],
        ].map(([k, v]) => (
          <div key={k} className="bg-card px-5 py-4">
            <dt className="text-[12.5px] text-muted-foreground">{k}</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-5">
        {/* Search + sort + view */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, id or provider…" className="h-10 pl-9 pr-10" aria-label="Search models" />
            <Kbd className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
          </div>
          <div className="flex items-center gap-2">
            <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort models" className="h-10 min-w-[190px]">
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="context">Largest context</option>
              <option value="name">Name A–Z</option>
            </NativeSelect>
            <Segmented<"grid" | "table">
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: <LayoutGrid className="size-4" aria-label="Grid" /> },
                { value: "table", label: <Rows3 className="size-4" aria-label="Table" /> },
              ]}
            />
          </div>
        </div>

        {/* Type + capability filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented<TypeFilter> value={type} onChange={setType} options={typeOptions} />
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
            {CAPS.map((c) => {
              const on = caps.includes(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => setCaps((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id]))} className={pill(on)}>
                  <c.icon className="size-3.5" /> {c.label}
                </button>
              );
            })}
            <label className="ml-1 inline-flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
              <Switch checked={showMaint} onCheckedChange={setShowMaint} /> Maintenance
            </label>
          </div>
        </div>

        {/* Providers */}
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" aria-pressed={!vendor} onClick={() => setVendor(null)} className={pill(!vendor)}>
            All providers <span className="text-subtle-foreground">{all.length}</span>
          </button>
          {vendors.map(([v, n]) => (
            <button key={v} type="button" aria-pressed={vendor === v} onClick={() => setVendor(vendor === v ? null : v)} className={pill(vendor === v)}>
              <VendorLogo vendor={v} className="size-4" />
              {v} <span className="text-subtle-foreground">{n}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-[13px] text-muted-foreground">
          <p>
            Showing <b className="font-medium text-foreground">{list.length}</b> of {all.length} models
          </p>
          {filtered && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              <X className="size-3.5" /> Clear filters
            </button>
          )}
        </div>

        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-[248px] rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">The model catalog couldn&apos;t be loaded right now.</p>
        ) : !list.length ? (
          <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            No models match these filters.{" "}
            <button type="button" onClick={reset} className="font-medium text-accent hover:underline">
              Clear filters
            </button>
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <CatalogCard key={m.id} m={m} onEstimate={estimate} />
            ))}
          </div>
        ) : (
          <CatalogTable list={list} onEstimate={estimate} />
        )}
      </div>

      <CostEstimator models={all.filter((m) => m.type === "chat")} selected={estimateId} onSelect={setEstimateId} />
    </div>
  );
}

function StatusBadges({ m }: { m: ModelInfo }) {
  if (m.status === "maintenance")
    return (
      <Badge tone="outline">
        <Wrench className="size-3" /> Maintenance
      </Badge>
    );
  if (m.access !== "free")
    return (
      <Badge tone="warning">
        <Lock className="size-3" /> {m.access === "early" ? "Top plan" : "Paid plans"}
      </Badge>
    );
  if (m.featured)
    return (
      <Badge tone="accent">
        <Sparkles className="size-3" /> Featured
      </Badge>
    );
  return <Badge tone="success">Free plan</Badge>;
}

function TryLink({ m, className }: { m: ModelInfo; className?: string }) {
  const { signedIn } = useSession();
  const target = m.type === "image" ? `/dashboard/image-studio?model=${encodeURIComponent(m.id)}` : `/dashboard/playground?model=${encodeURIComponent(m.id)}`;
  const disabled = m.status === "maintenance" || m.type === "embedding";
  if (disabled)
    return (
      <Button size="sm" variant="secondary" className={className} disabled>
        {m.type === "embedding" ? "API only" : "Unavailable"}
      </Button>
    );
  return (
    <Button size="sm" variant="secondary" className={className} asChild>
      <Link href={signedIn ? target : `/register?next=${encodeURIComponent(target)}`}>Try it</Link>
    </Button>
  );
}

function CatalogCard({ m, onEstimate }: { m: ModelInfo; onEstimate: (id: string) => void }) {
  const maint = m.status === "maintenance";
  return (
    <div className={cn("group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-border-strong", maint && "opacity-75")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <VendorMark vendor={m.vendor} type={m.type} modelId={m.id} className="size-10 rounded-xl" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{m.name}</p>
            <p className="truncate text-[12.5px] text-muted-foreground">{m.vendor || "—"}</p>
          </div>
        </div>
        <StatusBadges m={m} />
      </div>
      <p className="mt-3 flex items-center gap-1 font-mono text-[12px] text-muted-foreground">
        <span className="truncate">{m.id}</span>
        <CopyButton value={m.id} label="Model id" size="xs" />
      </p>
      <p className="mt-2 line-clamp-2 min-h-[40px] text-[13px] leading-relaxed text-muted-foreground">{m.description}</p>
      <div className="mt-3 flex min-h-[22px] flex-wrap gap-1.5">
        {CAPS.filter((c) => m.capabilities.includes(c.id)).map((c) => (
          <span key={c.id} className="inline-flex h-[22px] items-center gap-1 rounded-md bg-muted px-1.5 text-[11.5px] text-muted-foreground">
            <c.icon className="size-3" /> {c.label}
          </span>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3.5 text-[12px]">
        {m.type === "image" ? (
          <>
            {(["1K", "2K", "4K"] as const).map((t) => (
              <div key={t}>
                <dt className="text-subtle-foreground">{t} image</dt>
                <dd className="mt-0.5 font-medium tabular">{formatUsd(m.pricing.perImage?.[t] ?? 0)}</dd>
              </div>
            ))}
          </>
        ) : (
          <>
            <div>
              <dt className="text-subtle-foreground">Context</dt>
              <dd className="mt-0.5 font-medium tabular">{formatTokens(m.contextLength)}</dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">In / 1M</dt>
              <dd className="mt-0.5 font-medium tabular">{formatTokenPrice(m.pricing.inputPer1M)}</dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Out / 1M</dt>
              <dd className="mt-0.5 font-medium tabular">{formatTokenPrice(m.pricing.outputPer1M)}</dd>
            </div>
          </>
        )}
      </dl>
      <div className="mt-4 flex gap-2">
        {m.type === "chat" && (
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onEstimate(m.id)}>
            <Calculator /> Estimate
          </Button>
        )}
        <TryLink m={m} className="flex-1" />
      </div>
    </div>
  );
}

function CatalogTable({ list, onEstimate }: { list: ModelInfo[]; onEstimate: (id: string) => void }) {
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[860px] text-left text-[13px]">
        <thead className="border-b border-border text-[12px] text-muted-foreground">
          <tr>
            {["Model", "Provider", "Context", "In / 1M", "Out / 1M", "Capabilities", "Access", ""].map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((m) => (
            <tr key={m.id} className={cn("border-b border-border last:border-0 hover:bg-muted/40", m.status === "maintenance" && "opacity-70")}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <VendorMark vendor={m.vendor} type={m.type} modelId={m.id} className="size-8 rounded-lg text-xs" />
                  <div className="min-w-0">
                    <p className="font-medium">{m.name}</p>
                    <p className="flex items-center gap-1 font-mono text-[11.5px] text-muted-foreground">
                      {m.id} <CopyButton value={m.id} label="Model id" size="xs" />
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{m.vendor || "—"}</td>
              <td className="px-4 py-3 tabular">{m.contextLength ? formatTokens(m.contextLength) : "—"}</td>
              <td className="px-4 py-3 tabular">{m.type === "image" ? `${formatUsd(priceOf(m))} / img` : formatTokenPrice(m.pricing.inputPer1M)}</td>
              <td className="px-4 py-3 tabular">{m.type === "chat" ? formatTokenPrice(m.pricing.outputPer1M) : "—"}</td>
              <td className="px-4 py-3">
                <span className="flex gap-1.5 text-muted-foreground">
                  {CAPS.filter((c) => m.capabilities.includes(c.id)).map((c) => (
                    <c.icon key={c.id} className="size-3.5" aria-label={c.label} />
                  ))}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusBadges m={m} />
              </td>
              <td className="px-4 py-3 text-right">
                {m.type === "chat" && m.status !== "maintenance" && (
                  <Button size="xs" variant="ghost" onClick={() => onEstimate(m.id)}>
                    <Calculator /> Estimate
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Cost estimator ──────────────────────────────────────

function NumberField({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step: number }) {
  return (
    <label className="block">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
        className="mt-1.5 h-10 tabular"
      />
    </label>
  );
}

function CostEstimator({ models, selected, onSelect }: { models: ModelInfo[]; selected: string | null; onSelect: (id: string) => void }) {
  const { data: plans } = usePlans();
  const usable = models.filter((m) => m.status !== "maintenance");
  const model = usable.find((m) => m.id === selected) ?? usable[0];
  const [inTok, setIn] = React.useState(2000);
  const [outTok, setOut] = React.useState(800);
  const [perDay, setPerDay] = React.useState(200);

  const perRequestTokens = inTok + outTok;
  const monthlyTokens = perRequestTokens * perDay * 30;
  const perRequestValue = model ? (inTok * model.pricing.inputPer1M + outTok * model.pricing.outputPer1M) / 1_000_000 : 0;
  const monthlyValue = perRequestValue * perDay * 30;
  const monthly = (plans ?? []).filter((p) => p.kind === "monthly").sort((a, b) => a.tokens - b.tokens);
  const fit = monthly.find((p) => p.tokens >= monthlyTokens && (!model || model.access === "free" || !p.isFree));

  return (
    <section id="estimator" className="scroll-mt-24 rounded-3xl border border-border bg-card p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Calculator className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Cost estimator</h2>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">Plans are sold in tokens. See how many you&apos;d use, which plan covers it, and what that usage is worth at model price.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-[12.5px] text-muted-foreground">Model</span>
            <NativeSelect value={model?.id ?? ""} onChange={(e) => onSelect(e.target.value)} className="mt-1.5 h-10 w-full">
              {usable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {formatTokenPrice(m.pricing.inputPer1M)} in · {formatTokenPrice(m.pricing.outputPer1M)} out
                </option>
              ))}
            </NativeSelect>
          </label>
          <NumberField label="Input tokens per request" value={inTok} onChange={setIn} step={100} />
          <NumberField label="Output tokens per request" value={outTok} onChange={setOut} step={100} />
          <div className="sm:col-span-2">
            <NumberField label="Requests per day" value={perDay} onChange={setPerDay} step={10} />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-muted/40 p-5">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-[12.5px] text-muted-foreground">Tokens / month</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight tabular">{formatTokens(monthlyTokens)}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-muted-foreground">Value at model price</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight tabular">{formatUsd(Math.round(monthlyValue))}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-muted-foreground">Per request</dt>
              <dd className="mt-1 font-medium tabular">
                {formatTokens(perRequestTokens)} tokens · {formatUsd(Math.round(perRequestValue))}
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-muted-foreground">Per day</dt>
              <dd className="mt-1 font-medium tabular">{formatTokens(perRequestTokens * perDay)} tokens</dd>
            </div>
          </dl>
          <div className="rounded-xl border border-border bg-card p-4">
            {fit ? (
              <p className="text-[13.5px]">
                <b className="font-semibold">{fit.name}</b> covers this{fit.isFree ? " for free" : ` for ${formatUsd(fit.priceMonthly)} / month`} — {formatTokens(fit.tokens)} tokens included.
              </p>
            ) : monthly.length ? (
              <p className="text-[13.5px]">That&apos;s more than our largest plan includes — add 24h passes or contact us for a custom plan.</p>
            ) : (
              <p className="text-[13.5px] text-muted-foreground">Loading plans…</p>
            )}
            <Link href="/pricing" className="mt-1.5 inline-block text-[13px] font-medium text-accent hover:underline">
              Compare all plans →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
