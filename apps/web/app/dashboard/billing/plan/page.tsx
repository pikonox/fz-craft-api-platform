"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Gauge, ImageIcon, Layers, Repeat, RotateCcw, ShieldCheck, Sparkles, Star, Timer, Undo2, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";
import { formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, PageHeader, Progress, Skeleton } from "@/components/ui/primitives";
import { Segmented, Switch } from "@/components/ui/controls";
import { Callout, ConfirmDialog, MiniTile, SectionHeading } from "@/components/account/common";
import { ACCESS_LABEL, PassCard, PlanCard, PurchaseDialog, yearlySaving, type BuyIntent, type Cycle } from "@/components/account/plans";
import { api, errorMessage } from "@/lib/api";
import { useMe, usePlans, useRefreshAccount } from "@/lib/queries";
import type { SubSummary } from "@/lib/types";
import { cn, daysUntil, formatDate, formatDateTime, relativeTime } from "@/lib/utils";

export default function PlansPage() {
  const { data: me } = useMe();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const refresh = useRefreshAccount();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [buy, setBuy] = useState<BuyIntent | null>(null);

  const e = me?.entitlement;
  const current = e?.plan ?? null;
  const balance = me?.user.mainBalance ?? 0;

  // Open on the cycle the user is already paying for
  useEffect(() => {
    if (current?.cycle === "yearly") setCycle("yearly");
  }, [current?.cycle]);

  const monthly = useMemo(() => (plans ?? []).filter((p) => p.kind === "monthly" && !p.isFree), [plans]);
  const free = plans?.find((p) => p.isFree);
  const passes = useMemo(() => (plans ?? []).filter((p) => p.kind === "pass"), [plans]);
  const maxSaving = Math.max(0, ...monthly.map(yearlySaving));

  const hasPaidMonthly = Boolean(current && !current.isFree && current.priceMicros > 0);
  const passBlocked = hasPaidMonthly
    ? `Not available on a paid monthly plan`
    : e?.pass
      ? `Your ${e.pass.name} is active until ${formatDateTime(e.pass.termEndsAt)}`
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Plans"
        description="Pick the monthly allowance that fits, or grab a 24-hour pass for a short burst. Switch any time — unused time is credited back."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/billing/balance">
              <Wallet /> Balance <span className="tabular">{me ? formatUsd(balance) : "—"}</span>
            </Link>
          </Button>
        }
      />

      <CurrentPlanCard current={current} pass={e?.pass ?? null} bonus={e?.bonusTokens ?? 0} rpm={e?.rpm ?? 0} balance={balance} loading={!me} onRefresh={refresh} />

      {/* Monthly plans */}
      <section className="space-y-4">
        <SectionHeading
          title="Monthly plans"
          description="Tokens reset every 30 days. Renewals are charged from your balance."
          action={
            <Segmented
              value={cycle}
              onChange={setCycle}
              options={[
                { value: "monthly", label: "Monthly" },
                {
                  value: "yearly",
                  label: (
                    <span className="flex items-center gap-1.5">
                      Yearly
                      {maxSaving > 0 && <span className="rounded bg-success-soft px-1.5 py-px text-[10.5px] font-semibold text-success">Save ~{maxSaving}%</span>}
                    </span>
                  ),
                },
              ]}
            />
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plansLoading || !me
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[380px] rounded-2xl" />)
            : monthly.map((p) => <PlanCard key={p.id} plan={p} cycle={cycle} current={current} balance={balance} onChoose={setBuy} />)}
        </div>
        {free && (
          <Card className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Layers className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {free.name}
                  <span className="font-normal text-muted-foreground">· $0</span>
                  {current?.isFree && <Badge tone="success">Current</Badge>}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {formatTokens(free.tokens)} tokens / month · {free.rpm} req/min · {ACCESS_LABEL[free.modelAccess].toLowerCase()}. Applied automatically whenever no paid plan is active.
                </p>
              </div>
            </div>
          </Card>
        )}
      </section>

      {/* Passes */}
      {passes.length > 0 && (
        <section className="space-y-4">
          <SectionHeading title="24-hour passes" description="A short boost on top of the Free plan — no subscription, nothing renews." />
          {hasPaidMonthly && (
            <Callout tone="info" title={`Passes can't be stacked on your ${current?.name} plan`}>
              Passes are meant for Free-tier users who need a burst for a day. Your plan already includes {formatTokens(current?.tokensLimit ?? 0)} tokens per cycle at {current?.rpm} req/min — upgrade the plan instead if you need more.
            </Callout>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {passes.map((p) => (
              <PassCard key={p.id} plan={p} balance={balance} blockedReason={passBlocked} onChoose={setBuy} />
            ))}
            <Card className="flex flex-col justify-center gap-3 border-dashed bg-transparent p-5 md:col-span-2 lg:col-span-1">
              <p className="text-sm font-semibold">How passes work</p>
              <ul className="space-y-2.5 text-[13px] text-muted-foreground">
                <li className="flex gap-2.5">
                  <Timer className="mt-0.5 size-4 shrink-0 text-subtle-foreground" /> Active for 24 hours from purchase, then it simply ends.
                </li>
                <li className="flex gap-2.5">
                  <Zap className="mt-0.5 size-4 shrink-0 text-subtle-foreground" /> Pass tokens are used first; your free allowance is kept for later.
                </li>
                <li className="flex gap-2.5">
                  <Gauge className="mt-0.5 size-4 shrink-0 text-subtle-foreground" /> The higher rate limit and model access apply right away.
                </li>
              </ul>
            </Card>
          </div>
        </section>
      )}

      <GoodToKnow />

      <PurchaseDialog intent={buy} onClose={() => setBuy(null)} current={current} balance={balance} />
    </div>
  );
}

function CurrentPlanCard({ current, pass, bonus, rpm, balance, loading, onRefresh }: { current: SubSummary | null; pass: SubSummary | null; bonus: number; rpm: number; balance: number; loading: boolean; onRefresh: () => void }) {
  const [renewBusy, setRenewBusy] = useState(false);
  const [autoRenew, setAutoRenew] = useState<boolean | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refunding, setRefunding] = useState(false);

  if (loading || !current) {
    return (
      <Card className="hero-surface p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-4 h-9 w-56" />
        <Skeleton className="mt-6 h-2 w-full" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  const paid = !current.isFree && current.priceMicros > 0;
  const renew = autoRenew ?? current.autoRenew;
  const pct = current.tokensLimit ? (current.tokensUsed / current.tokensLimit) * 100 : 0;
  const left = Math.max(0, current.tokensLimit - current.tokensUsed);
  const refundable = paid && current.refundableUntil && new Date(current.refundableUntil).getTime() > Date.now();
  const yearly = current.cycle === "yearly";
  const termDiffers = yearly && new Date(current.termEndsAt).getTime() - new Date(current.periodEndsAt).getTime() > 86_400_000;

  const toggleRenew = async (v: boolean) => {
    setAutoRenew(v);
    setRenewBusy(true);
    try {
      await api("/api/billing/auto-renew", { body: { enabled: v } });
      toast.success(v ? "Auto-renew is on" : "Auto-renew is off", { description: v ? `We'll renew from your balance on ${formatDate(current.termEndsAt)}.` : `Your plan stays active until ${formatDate(current.termEndsAt)}, then moves to Free.` });
      onRefresh();
    } catch (e) {
      setAutoRenew(!v);
      toast.error(errorMessage(e));
    } finally {
      setRenewBusy(false);
    }
  };

  const refund = async () => {
    setRefunding(true);
    try {
      await api("/api/billing/refund", { method: "POST" });
      toast.success("Plan refunded", { description: `${formatUsd(current.priceMicros)} is back in your balance. You're on the Free plan now.` });
      setRefundOpen(false);
      onRefresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRefunding(false);
    }
  };

  const tone = pct >= 90 ? "danger" : pct >= 75 ? "warning" : "accent";
  const shortForRenewal = paid && renew && balance < current.priceMicros;

  return (
    <Card className="hero-surface relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="outline" className="bg-card/60">
            <Star className="size-3" /> Current plan
          </Badge>
          {paid ? (
            <Badge tone="success" dot>
              {yearly ? "Yearly" : "Monthly"}
            </Badge>
          ) : (
            <Badge tone="neutral">Free tier</Badge>
          )}
          {pass && (
            <Badge tone="accent">
              <Zap className="size-3" /> {pass.name} active
            </Badge>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{current.name}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {paid ? (
                <>
                  <span className="font-medium text-foreground tabular">{formatUsd(current.priceMicros)}</span> / {yearly ? "year" : "month"} ·{" "}
                  {renew ? "renews" : "ends"} {formatDate(current.termEndsAt)}
                </>
              ) : (
                <>Free forever · tokens reset {formatDate(current.periodEndsAt)}</>
              )}
            </p>
          </div>
          <div className="w-full lg:max-w-md">
            <div className="mb-2 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-muted-foreground">Used this cycle</span>
              <span className="tabular">
                <span className="font-semibold">{formatTokens(current.tokensUsed)}</span>
                <span className="text-muted-foreground"> / {formatTokens(current.tokensLimit)}</span>
              </span>
            </div>
            <Progress value={pct} tone={tone} className="h-2" />
            <p className="mt-2 text-xs text-muted-foreground tabular">
              {formatTokens(left)} left · resets {relativeTime(current.periodEndsAt)}
              {termDiffers ? ` · term ends ${formatDate(current.termEndsAt)}` : ""}
            </p>
          </div>
        </div>

        {pass && (
          <div className="mt-5 flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent-soft/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-[13px] font-medium">
              <Zap className="size-4 text-accent" /> {pass.name}
              <span className="font-normal text-muted-foreground">· ends {relativeTime(pass.termEndsAt)}</span>
            </p>
            <div className="flex min-w-0 items-center gap-3 sm:w-64">
              <Progress value={pass.tokensLimit ? (pass.tokensUsed / pass.tokensLimit) * 100 : 0} className="flex-1" />
              <span className="shrink-0 text-xs text-muted-foreground tabular">
                {formatTokens(pass.tokensUsed)} / {formatTokens(pass.tokensLimit)}
              </span>
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniTile label="Rate limit" value={`${rpm.toLocaleString("en-US")} req/min`} />
          <MiniTile label="Model access" value={ACCESS_LABEL[current.modelAccess]} />
          <MiniTile label={paid ? (renew ? "Next renewal" : "Plan ends") : "Next reset"} value={formatDate(paid ? current.termEndsAt : current.periodEndsAt, { year: undefined })} sub={`in ${daysUntil(paid ? current.termEndsAt : current.periodEndsAt)} days`} />
          <MiniTile label="Bonus tokens" value={formatTokens(bonus)} sub={bonus ? "Used after plan tokens" : "Earn more in Rewards"} />
        </div>

        {paid && (
          <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5 lg:flex-row lg:items-center lg:justify-between">
            <label htmlFor="auto-renew" className="flex min-w-0 cursor-pointer items-start gap-3">
              <Switch id="auto-renew" checked={renew} onCheckedChange={toggleRenew} disabled={renewBusy} className="mt-0.5" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <Repeat className="size-3.5 text-muted-foreground" /> Auto-renew from balance
                </span>
                <span className="block text-xs text-muted-foreground">
                  {renew
                    ? `${formatUsd(current.priceMicros)} will be charged on ${formatDate(current.termEndsAt)}.${shortForRenewal ? ` Your balance (${formatUsd(balance)}) is short — top up before then to keep ${current.name}.` : ""}`
                    : `You'll move to the Free plan on ${formatDate(current.termEndsAt)}.`}
                </span>
              </span>
            </label>
            {refundable && (
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/70 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Undo2 className="size-3.5 shrink-0" />
                  <span>
                    Full refund available until <span className="font-medium text-foreground">{formatDateTime(current.refundableUntil)}</span>
                  </span>
                </p>
                <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>
                  Request refund
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        title={`Refund your ${current.name} plan?`}
        confirmLabel={`Refund ${formatUsd(current.priceMicros)}`}
        variant="danger"
        loading={refunding}
        onConfirm={refund}
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground tabular">{formatUsd(current.priceMicros)}</span> goes back to your main balance and your account moves to the Free plan right away.
          </p>
          <p>Refunds are available once, for your first paid plan, within 24 hours of buying it. This can&apos;t be undone.</p>
        </div>
      </ConfirmDialog>
    </Card>
  );
}

function GoodToKnow() {
  const items = [
    { icon: RotateCcw, title: "Switch any time", body: "Changing plans credits unused time on your current paid plan back to your balance (by time or tokens left, whichever is smaller)." },
    { icon: Undo2, title: "24-hour refund", body: "Your first paid plan can be refunded to your balance within 24 hours of buying it." },
    { icon: CalendarClock, title: "Tokens reset every 30 days", body: "Plan tokens don't roll over. Yearly plans are billed once and still reset monthly." },
    { icon: Repeat, title: "Renewals use your balance", body: "If your balance is short at renewal, you simply move to Free — your keys and history stay." },
    { icon: ShieldCheck, title: "Pay your way", body: "Binance Pay and USDT verify instantly. JazzCash, Easypaisa and bank transfers are reviewed in about 30 minutes." },
    { icon: ImageIcon, title: "Images are billed separately", body: "Image Studio uses image credits, not plan tokens. Add them from Balance & top-up." },
  ];
  return (
    <Card>
      <CardHeader
        title="Good to know"
        description="How plans, passes and payments work"
        action={
          <Button size="sm" variant="ghost" asChild>
            <Link href="/dashboard/support">
              <Sparkles /> Ask a question
            </Link>
          </Button>
        }
      />
      <CardBody className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div key={it.title} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
              <it.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{it.title}</p>
              <p className={cn("mt-0.5 text-[13px] leading-relaxed text-muted-foreground")}>{it.body}</p>
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

