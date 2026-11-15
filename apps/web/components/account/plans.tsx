"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleCheck, Coins, CreditCard, Gauge, Sparkles, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";
import { formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { Badge, Card } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { useRefreshAccount } from "@/lib/queries";
import { useCheckout } from "@/lib/stores";
import type { Plan, SubSummary } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export type Cycle = "monthly" | "yearly";
export type BuyIntent = { plan: Plan; cycle: "monthly" | "yearly" | "daily" };

export const ACCESS_LABEL: Record<Plan["modelAccess"], string> = { free: "Free models", paid: "All models", early: "All + early access" };

export function planPriceFor(plan: Plan, cycle: "monthly" | "yearly" | "daily") {
  if (plan.kind === "pass") return plan.pricePass;
  return cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
}

/** Yearly saving vs 12 × monthly, as a whole percentage (0 when there's no yearly price). */
export function yearlySaving(plan: Plan) {
  if (!plan.priceYearly || !plan.priceMonthly) return 0;
  return Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100);
}

// Features that repeat what the chips already show are hidden to keep cards short.
const REDUNDANT = /^([\d.,]+\s*[KMB]?\s+tokens\b|[\d.,]+\s+requests\s*\/\s*min)/i;

function Chip({ icon, children, tone = "neutral" }: { icon: React.ReactNode; children: React.ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11.5px] font-medium tabular [&_svg]:size-3",
        tone === "accent" ? "border-transparent bg-accent-soft text-accent" : "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function PlanCard({ plan, cycle, current, balance, onChoose }: { plan: Plan; cycle: Cycle; current: SubSummary | null; balance: number; onChoose: (i: BuyIntent) => void }) {
  const effCycle: Cycle = cycle === "yearly" && plan.priceYearly ? "yearly" : "monthly";
  const price = planPriceFor(plan, effCycle);
  const isCurrentPlan = current?.slug === plan.slug;
  const isCurrent = isCurrentPlan && current?.cycle === effCycle;
  const upgrade = !current || current.isFree || plan.tokens > current.tokensLimit;
  const saving = yearlySaving(plan);
  const features = plan.features.filter((f) => !REDUNDANT.test(f));

  const label = isCurrent ? "Current plan" : isCurrentPlan ? `Switch to ${effCycle}` : upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`;

  return (
    <Card
      className={cn(
        "relative flex flex-col p-5 transition-shadow",
        plan.highlight && "hero-surface border-accent/50 shadow-lg shadow-accent/10 ring-1 ring-accent/30",
        isCurrent && !plan.highlight && "border-border-strong",
      )}
    >
      <div className="flex min-h-[22px] items-center justify-between gap-2">
        <p className="text-[15px] font-semibold tracking-tight">{plan.name}</p>
        <div className="flex gap-1.5">
          {isCurrent ? (
            <Badge tone="success">
              <CircleCheck className="size-3" /> Current
            </Badge>
          ) : plan.badge ? (
            <Badge tone="accent">
              <Sparkles className="size-3" /> {plan.badge}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <p className="flex items-baseline gap-1">
          <span className="text-[32px] font-semibold leading-none tracking-tight tabular">{formatUsd(price)}</span>
          <span className="text-[13px] text-muted-foreground">/ {effCycle === "yearly" ? "year" : "month"}</span>
        </p>
        <p className="mt-1.5 h-4 text-xs text-muted-foreground tabular">
          {effCycle === "yearly" ? (
            <>
              {formatUsd(Math.round(price / 12))}/mo ·{" "}
              <span className="font-medium text-success">save {formatUsd(plan.priceMonthly * 12 - price)}</span>
            </>
          ) : cycle === "yearly" ? (
            "Monthly billing only"
          ) : saving > 0 ? (
            `or ${formatUsd(plan.priceYearly)}/year (save ${saving}%)`
          ) : null}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Chip icon={<Coins />}>{formatTokens(plan.tokens)} tokens</Chip>
        <Chip icon={<Gauge />}>{plan.rpm.toLocaleString("en-US")} RPM</Chip>
      </div>

      <ul className="mt-4 flex-1 space-y-2 border-t border-border pt-4">
        {features.map((f) => (
          <li key={f} className="flex gap-2 text-[13px] leading-snug">
            <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
            <span className="text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>

      <Button
        className="mt-5 w-full"
        variant={isCurrent ? "secondary" : plan.highlight ? "accent" : upgrade ? "primary" : "outline"}
        disabled={isCurrent}
        onClick={() => onChoose({ plan, cycle: effCycle })}
      >
        {label}
      </Button>
      <p className="mt-2 h-4 text-center text-[11px] text-subtle-foreground">
        {isCurrent ? (current?.isFree ? "" : `Renews ${formatDate(current!.termEndsAt, { year: undefined })}`) : balance >= price ? "Covered by your balance" : "Pay with crypto or PKR"}
      </p>
    </Card>
  );
}

export function PassCard({ plan, blockedReason, balance, onChoose }: { plan: Plan; blockedReason: string | null; balance: number; onChoose: (i: BuyIntent) => void }) {
  const features = plan.features.filter((f) => !/tokens for 24 hours|requests \/ min/i.test(f));
  return (
    <Card className={cn("flex flex-col p-5", blockedReason && "opacity-75")}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Zap className="size-3.5" />
          </span>
          {plan.name}
        </p>
        {plan.badge && <Badge tone="accent">{plan.badge}</Badge>}
      </div>
      <p className="mt-4 flex items-baseline gap-1">
        <span className="text-[28px] font-semibold leading-none tracking-tight tabular">{formatUsd(plan.pricePass)}</span>
        <span className="text-[13px] text-muted-foreground">/ {plan.durationHours} hours</span>
      </p>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        <Chip icon={<Coins />}>{formatTokens(plan.tokens)} tokens</Chip>
        <Chip icon={<Gauge />}>{plan.rpm.toLocaleString("en-US")} RPM</Chip>
      </div>
      {features.length > 0 && (
        <ul className="mt-3.5 space-y-1.5">
          {features.map((f) => (
            <li key={f} className="flex gap-2 text-[13px] text-muted-foreground">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              {f}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-5">
        <Button className="w-full" variant="outline" disabled={Boolean(blockedReason)} onClick={() => onChoose({ plan, cycle: "daily" })}>
          {blockedReason ? "Not available right now" : `Get ${plan.name}`}
        </Button>
        <p className="mt-2 h-4 text-center text-[11px] text-subtle-foreground">{blockedReason ?? (balance >= plan.pricePass ? "Covered by your balance" : "Pay with crypto or PKR")}</p>
      </div>
    </Card>
  );
}

/** Confirm a purchase: pay from balance when it covers the price, or hand off to the global checkout. */
export function PurchaseDialog({ intent, onClose, current, balance }: { intent: BuyIntent | null; onClose: () => void; current: SubSummary | null; balance: number }) {
  const refresh = useRefreshAccount();
  const start = useCheckout((s) => s.start);
  const [busy, setBusy] = useState(false);
  const plan = intent?.plan;
  const cycle = intent?.cycle ?? "monthly";
  const price = plan ? planPriceFor(plan, cycle) : 0;
  const canAfford = balance >= price;
  const switching = plan?.kind === "monthly" && current && !current.isFree;

  const payFromBalance = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await api("/api/billing/purchase", { body: { planId: plan.id, cycle } });
      toast.success(`${plan.name} ${plan.kind === "pass" ? "pass" : "plan"} is active`, { description: `${formatUsd(price)} was paid from your balance.` });
      refresh();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const payExternally = () => {
    if (!plan) return;
    onClose();
    start({ purpose: "plan", planId: plan.id, cycle });
  };

  return (
    <Dialog
      open={Boolean(intent)}
      onOpenChange={(o) => !o && !busy && onClose()}
      title={plan ? `${plan.kind === "pass" ? "Get" : switching ? "Switch to" : "Upgrade to"} ${plan.name}` : ""}
      description={plan?.kind === "pass" ? "A 24-hour boost on top of the Free plan." : cycle === "yearly" ? "Billed once for 12 months. Tokens reset every 30 days." : "Billed monthly. Cancel auto-renew any time."}
      size="sm"
    >
      {plan && (
        <div className="space-y-4">
          <div className="hero-surface rounded-xl border border-border p-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {plan.name}
                  <span className="ml-1.5 font-normal text-muted-foreground">· {plan.kind === "pass" ? `${plan.durationHours}h pass` : cycle}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatTokens(plan.tokens)} tokens{plan.kind === "pass" ? "" : " / month"} · {plan.rpm.toLocaleString("en-US")} req/min
                </p>
              </div>
              <p className="text-2xl font-semibold tracking-tight tabular">{formatUsd(price)}</p>
            </div>
          </div>

          {switching && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Your <span className="font-medium text-foreground">{current!.name}</span> plan ends when the new one starts. Unused time is credited back to your balance (by time or tokens left, whichever is smaller).
            </p>
          )}

          <button
            type="button"
            disabled={!canAfford || busy}
            onClick={payFromBalance}
            className={cn(
              "group flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all",
              canAfford ? "border-accent/60 bg-accent-soft/50 hover:bg-accent-soft" : "cursor-not-allowed border-border opacity-70",
            )}
          >
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", canAfford ? "bg-accent text-white" : "bg-muted text-muted-foreground")}>
              <Wallet className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{busy ? "Activating…" : "Pay from balance"}</span>
              <span className="block text-xs text-muted-foreground tabular">
                {canAfford ? `${formatUsd(balance)} available · ${formatUsd(balance - price)} left after` : `You have ${formatUsd(balance)} · ${formatUsd(price - balance)} short`}
              </span>
            </span>
            {canAfford && <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={payExternally}
            className="group flex w-full items-center gap-3.5 rounded-xl border border-border p-3.5 text-left transition-all hover:border-border-strong hover:bg-muted/40"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <CreditCard className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Pay with Binance, USDT, JazzCash…</span>
              <span className="block text-xs text-muted-foreground">Activates automatically once the payment is confirmed</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>

          <p className="text-center text-xs text-subtle-foreground">
            Need more balance first?{" "}
            <Link href="/dashboard/billing/balance" onClick={onClose} className="font-medium text-accent hover:underline">
              Top up
            </Link>
          </p>
        </div>
      )}
    </Dialog>
  );
}
