"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, Gauge, ImageIcon, Layers, Sparkles, Zap } from "lucide-react";
import { formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { useModels, usePlans } from "@/lib/queries";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSession } from "./session";

export type Cycle = "monthly" | "yearly";

const ACCESS_LABEL: Record<Plan["modelAccess"], string> = {
  free: "Free models",
  paid: "All models",
  early: "All models + early access",
};

function savingsPct(p: Plan) {
  if (!p.priceMonthly || !p.priceYearly) return 0;
  return Math.max(0, Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100));
}

function perMillion(priceMicros: number, tokens: number) {
  if (!priceMicros || !tokens) return null;
  return formatUsd(priceMicros / (tokens / 1_000_000));
}

function usePlanHref() {
  const { signedIn } = useSession();
  return { signedIn, paid: signedIn ? "/dashboard/billing/plan" : "/register", free: signedIn ? "/dashboard" : "/register" };
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

// ── Monthly plans ──────────────────────────────────────

export function PricingPlans({ className, showFree = true }: { className?: string; showFree?: boolean }) {
  const { data, isPending, isError } = usePlans();
  const [cycle, setCycle] = React.useState<Cycle>("monthly");
  const monthly = (data ?? []).filter((p) => p.kind === "monthly");
  const free = monthly.filter((p) => p.isFree);
  const paid = monthly.filter((p) => !p.isFree);
  const bestSave = Math.max(0, ...paid.map(savingsPct));
  const cols = paid.length >= 4 ? "lg:grid-cols-4" : paid.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      <div className="flex justify-center">
        <Segmented<Cycle>
          value={cycle}
          onChange={setCycle}
          options={[
            { value: "monthly", label: "Monthly" },
            {
              value: "yearly",
              label: (
                <span className="flex items-center gap-1.5">
                  Yearly
                  {bestSave > 0 && <span className="rounded bg-success-soft px-1.5 py-px text-[10.5px] font-semibold text-success">−{bestSave}%</span>}
                </span>
              ),
            },
          ]}
        />
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[440px] rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorNote>Plans couldn&apos;t be loaded right now. Please refresh in a moment.</ErrorNote>
      ) : (
        <>
          {paid.length > 0 && (
            <div className={cn("grid items-stretch gap-4 sm:grid-cols-2", cols)}>
              {paid.map((p) => (
                <PlanCard key={p.id} plan={p} cycle={cycle} />
              ))}
            </div>
          )}
          {showFree && free.map((p) => <FreePlanRow key={p.id} plan={p} />)}
        </>
      )}
    </div>
  );
}

function PlanCard({ plan, cycle }: { plan: Plan; cycle: Cycle }) {
  const { paid } = usePlanHref();
  const yearlyAvailable = plan.priceYearly > 0;
  const yearly = cycle === "yearly" && yearlyAvailable;
  const monthlyEquivalent = yearly ? plan.priceYearly / 12 : plan.priceMonthly;
  const save = savingsPct(plan);
  const ppm = perMillion(monthlyEquivalent, plan.tokens);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card p-6 transition-shadow",
        plan.highlight ? "border-accent/50 shadow-xl shadow-accent/10 ring-1 ring-accent/30" : "border-border hover:shadow-lg hover:shadow-black/5",
      )}
    >
      {plan.highlight && <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-accent/[0.07] to-transparent" aria-hidden />}
      <div className="relative flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{plan.name}</h3>
        {plan.badge && (
          <Badge tone="accent">
            <Sparkles className="size-3" /> {plan.badge}
          </Badge>
        )}
      </div>

      <div className="relative mt-5 flex items-baseline gap-1">
        <span className="text-[40px] font-semibold leading-none tracking-tight tabular">{formatUsd(monthlyEquivalent)}</span>
        <span className="text-sm text-muted-foreground">/ month</span>
      </div>
      <p className="relative mt-2 min-h-5 text-[12.5px] text-muted-foreground">
        {yearly ? (
          <>
            {formatUsd(plan.priceYearly)} billed yearly{save > 0 && <span className="ml-1.5 font-medium text-success">save {save}%</span>}
          </>
        ) : cycle === "yearly" && !yearlyAvailable ? (
          "Monthly billing only"
        ) : (
          "Billed monthly"
        )}
      </p>

      <div className="relative mt-5 rounded-xl border border-border bg-muted/40 p-3.5">
        <p className="text-[22px] font-semibold tracking-tight tabular">
          {formatTokens(plan.tokens)} <span className="text-[13px] font-normal text-muted-foreground">tokens / month</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="size-3.5" /> {plan.rpm.toLocaleString("en-US")} req/min
          </span>
          {ppm && <span className="tabular">≈ {ppm} / 1M tokens</span>}
        </div>
      </div>

      <Button variant={plan.highlight ? "accent" : "outline"} className="relative mt-5 w-full" asChild>
        <Link href={paid}>
          Choose {plan.name} <ArrowRight />
        </Link>
      </Button>

      <ul className="relative mt-6 space-y-2.5 text-[13.5px]">
        <li className="flex gap-2.5">
          <Check className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>{ACCESS_LABEL[plan.modelAccess]}</span>
        </li>
        {plan.features
          .filter((f) => !/tokens|requests|all models/i.test(f))
          .map((f) => (
            <li key={f} className="flex gap-2.5 text-muted-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{f}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

function FreePlanRow({ plan }: { plan: Plan }) {
  const { free } = usePlanHref();
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold">{plan.name}</h3>
          <Badge tone="success">$0 · forever</Badge>
        </div>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          {formatTokens(plan.tokens)} tokens every month, {plan.rpm} requests / min and {ACCESS_LABEL[plan.modelAccess].toLowerCase()}. No payment details needed.
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
          {plan.features.map((f) => (
            <li key={f} className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-success" /> {f}
            </li>
          ))}
        </ul>
      </div>
      <Button variant="secondary" asChild className="shrink-0">
        <Link href={free}>
          Start for free <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}

// ── 24h passes ─────────────────────────────────────────

export function PassCards({ className }: { className?: string }) {
  const { data, isPending } = usePlans();
  const { paid } = usePlanHref();
  const passes = (data ?? []).filter((p) => p.kind === "pass");
  if (isPending)
    return (
      <div className={cn("grid gap-4 md:grid-cols-2", className)}>
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    );
  if (!passes.length) return <ErrorNote>No passes are on sale right now.</ErrorNote>;
  return (
    <div className={cn("grid gap-4", passes.length > 1 && "md:grid-cols-2", className)}>
      {passes.map((p) => (
        <div key={p.id} className="hero-surface relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-border p-6 sm:flex-row sm:items-center">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-400 text-white shadow-lg shadow-accent/20">
            <Zap className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold">{p.name}</h3>
              {p.badge && <Badge tone="accent">{p.badge}</Badge>}
            </div>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              <span className="font-medium text-foreground tabular">{formatTokens(p.tokens)} tokens</span> for {p.durationHours} hours · {p.rpm} req/min · {ACCESS_LABEL[p.modelAccess].toLowerCase()}
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-2">
            <p className="text-2xl font-semibold tracking-tight tabular">
              {formatUsd(p.pricePass)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">/ {p.durationHours}h</span>
            </p>
            <Button size="sm" variant="primary" asChild>
              <Link href={paid}>Buy pass</Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Plan comparison ────────────────────────────────────

export function PlanCompare() {
  const { data, isPending } = usePlans();
  const plans = (data ?? []).filter((p) => p.kind === "monthly");
  if (isPending) return <Skeleton className="h-72 rounded-2xl" />;
  if (!plans.length) return null;
  const rows: { label: string; render: (p: Plan) => React.ReactNode }[] = [
    { label: "Monthly price", render: (p) => (p.isFree ? "Free" : formatUsd(p.priceMonthly)) },
    { label: "Yearly price", render: (p) => (p.isFree ? "Free" : p.priceYearly ? formatUsd(p.priceYearly) : "—") },
    { label: "Tokens every 30 days", render: (p) => formatTokens(p.tokens) },
    { label: "Requests per minute", render: (p) => p.rpm.toLocaleString("en-US") },
    { label: "Model access", render: (p) => ACCESS_LABEL[p.modelAccess] },
    { label: "Effective price / 1M tokens", render: (p) => (p.isFree ? "—" : (perMillion(p.priceMonthly, p.tokens) ?? "—")) },
  ];
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-[26%] px-5 py-4 font-medium text-muted-foreground">
              Compare plans
            </th>
            {plans.map((p) => (
              <th key={p.id} scope="col" className={cn("px-4 py-4 font-semibold", p.highlight && "text-accent")}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-0">
              <th scope="row" className="px-5 py-3.5 font-normal text-muted-foreground">
                {r.label}
              </th>
              {plans.map((p) => (
                <td key={p.id} className={cn("px-4 py-3.5 tabular", p.highlight && "bg-accent-soft/50")}>
                  {r.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Image pricing ──────────────────────────────────────

export function ImagePricing({ className }: { className?: string }) {
  const { data, isPending } = useModels();
  const models = (data ?? []).filter((m) => m.type === "image");
  if (isPending) return <Skeleton className={cn("h-40 rounded-2xl", className)} />;
  if (!models.length) return null;
  return (
    <div className={cn("scrollbar-thin overflow-x-auto rounded-2xl border border-border bg-card", className)}>
      <table className="w-full min-w-[480px] border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th scope="col" className="px-5 py-3.5 font-medium">
              Image model
            </th>
            {(["1K", "2K", "4K"] as const).map((q) => (
              <th key={q} scope="col" className="px-4 py-3.5 text-right font-medium">
                {q} <span className="font-normal text-subtle-foreground">/ image</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id} className="border-b border-border last:border-0">
              <th scope="row" className="px-5 py-3.5 font-normal">
                <span className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <ImageIcon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{m.name}</span>
                    <code className="block font-mono text-[11.5px] text-subtle-foreground">{m.id}</code>
                  </span>
                </span>
              </th>
              {(["1K", "2K", "4K"] as const).map((q) => (
                <td key={q} className="px-4 py-3.5 text-right font-medium tabular">
                  {formatUsd(m.pricing.perImage?.[q] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Payment methods ────────────────────────────────────

export const PAYMENT_METHODS = [
  { id: "binance_pay", label: "Binance Pay", currency: "USDT", auto: true, submit: "Binance Pay order ID" },
  { id: "usdt_bep20", label: "USDT · BEP-20", currency: "USDT", auto: true, submit: "Transaction hash" },
  { id: "jazzcash", label: "JazzCash", currency: "PKR", auto: false, submit: "Screenshot + TID" },
  { id: "easypaisa", label: "Easypaisa", currency: "PKR", auto: false, submit: "Screenshot + transaction ID" },
  { id: "bank_transfer", label: "Bank transfer", currency: "PKR", auto: false, submit: "Receipt + reference no." },
] as const;

export function PaymentMethodGrid({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-5", className)}>
      {PAYMENT_METHODS.map((m) => (
        <div key={m.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] font-semibold">{m.label}</span>
            <span className="rounded-md border border-border px-1.5 py-px font-mono text-[10.5px] text-muted-foreground">{m.currency}</span>
          </div>
          <div className="mt-auto flex flex-col gap-1.5">
            <Badge tone={m.auto ? "success" : "warning"} className="self-start">
              {m.auto ? <Zap className="size-3" /> : <Clock className="size-3" />}
              {m.auto ? "Auto-verified" : "Manual review"}
            </Badge>
            <span className="text-[12px] text-muted-foreground">You submit: {m.submit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Small "how pricing works" strip shown under plan cards. */
export function PricingFacts() {
  const facts = [
    { icon: Layers, title: "Tokens, not surprises", body: "Every plan is a fixed token allowance that refreshes every 30 days. Input and output tokens count; cached input counts at 10%." },
    { icon: Zap, title: "Top up with a 24h pass", body: "Ran out early? A pass adds tokens instantly and is used before your plan's allowance." },
    { icon: ImageIcon, title: "Images bill separately", body: "Image generations draw from a separate image wallet, per image. Images that fail are never charged." },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {facts.map((f) => (
        <div key={f.title} className="flex gap-3.5 rounded-2xl border border-border bg-card/60 p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <f.icon className="size-4" />
          </span>
          <div>
            <p className="text-[14px] font-semibold">{f.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
