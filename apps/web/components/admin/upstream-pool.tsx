"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellRing, Coins, Image as ImageIcon, Mail, Settings2, Users } from "lucide-react";
import { formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Field, Input, NativeSelect, Progress, Skeleton } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { qk, useAdminSettings } from "@/components/admin/queries";
import { ToggleRow, num, useAction } from "@/components/admin/ui";
import type { AdminAlerts, UpstreamPoolSettings, UpstreamPoolStatus } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn, formatDate, relativeTime } from "@/lib/utils";

const POOL_KEY = ["admin", "upstream-pool"] as const;
const M = 1_000_000;

/** FreeModel.in's monthly plans, for one-click filling. */
const PRESETS = [
  { label: "Starter", tokens: 30 * M },
  { label: "Basic", tokens: 100 * M },
  { label: "Pro", tokens: 200 * M },
  { label: "Scale", tokens: 500 * M },
];

const toneFor = (pct: number) => (pct >= 100 ? "danger" : pct >= 80 ? "warning" : "accent");
const today = () => new Date().toISOString().slice(0, 10);

export function useUpstreamPool() {
  return useQuery({ queryKey: POOL_KEY, queryFn: () => api<UpstreamPoolStatus>("/api/admin/upstream-pool"), refetchInterval: 60_000 });
}

/** Admin overview card: how much of the shared upstream account (FreeModel) is used, and alert settings. */
export function UpstreamPoolCard() {
  const { data, isLoading } = useUpstreamPool();
  const { data: settings } = useAdminSettings();
  const [open, setOpen] = useState(false);
  const test = useAction(() => api<{ to: string[]; results: string[] }>("/api/admin/alerts/test", { method: "POST" }), {
    success: (r) =>
      !r.to.length
        ? "No recipient: add an email in alert settings"
        : r.results.every((x) => x === "logged")
          ? "No SMTP set up here, so the test email was printed in the API log"
          : r.results.includes("failed")
            ? `Couldn't send to some addresses: check the SMTP settings`
            : `Test email sent to ${r.to.join(", ")}`,
  });

  const name = data?.provider?.name ?? "Upstream";
  const alerts = settings?.settings.adminAlerts;

  return (
    <Card>
      <CardHeader
        title={`${name} pool`}
        description={`Every paid model runs on your ${name} account. We count what we send it, so you hear about problems before customers do.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
              <Mail /> Send test email
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Settings2 /> Settings
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-4 pt-4">
        {data?.keyProblem && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">
                {name} rejected a request {relativeTime(data.keyProblem.at)}
                {data.keyProblem.coolingDown ? " · that key is resting and will be retried automatically" : ""}
              </p>
              <p className="mt-0.5 break-words font-mono text-[12px] opacity-90">{data.keyProblem.message.slice(0, 220)}</p>
            </div>
          </div>
        )}
        {!isLoading && data && !data.provider && (
          <p className="rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
            No provider called &ldquo;{data.settings.providerSlug}&rdquo;. Pick the right one in Settings.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Block icon={Coins} label={`${name} plan tokens`} loading={isLoading}>
            {data?.tokens ? (
              <>
                <Big>
                  {formatTokens(data.tokens.used)} <span className="text-muted-foreground">/ {formatTokens(data.tokens.limit)}</span>
                </Big>
                <Progress value={data.tokens.pct} tone={toneFor(data.tokens.pct)} className="mt-2.5" />
                <Sub>
                  {data.tokens.pct.toFixed(0)}% used{data.tokens.windowEnd ? ` · resets ${formatDate(data.tokens.windowEnd, { day: "numeric", month: "short" })}` : ""}
                </Sub>
                <Sub className="text-[11.5px]">
                  {data.tokens.source === "live" ? `Live from ${name} · updated ${relativeTime(data.tokens.updatedAt)}` : `Our estimate from request logs`}
                </Sub>
                {data.tokens.runsOutAt && (
                  <Sub className="text-warning">At this pace it runs out around {formatDate(data.tokens.runsOutAt, { day: "numeric", month: "short" })}</Sub>
                )}
              </>
            ) : (
              <NotTracked onClick={() => setOpen(true)}>Shows up after the first paid request goes to {name}. You can also enter your plan size in Settings.</NotTracked>
            )}
          </Block>

          <Block icon={Users} label="Sold to customers · active now" loading={isLoading}>
            {data && (
              <>
                <Big>{formatTokens(data.sold.tokens)} tokens</Big>
                <Sub>
                  {data.sold.plans} plan{data.sold.plans === 1 ? "" : "s"}
                  {data.sold.passes ? ` · ${data.sold.passes} pass${data.sold.passes === 1 ? "" : "es"}` : ""}
                </Sub>
                {data.tokens && data.sold.tokens > data.tokens.limit && (
                  <Sub className="text-warning">More than your {name} plan holds. Fine while customers don&apos;t use it all; watch the bar.</Sub>
                )}
              </>
            )}
          </Block>

          <Block icon={ImageIcon} label={`${name} balance for images`} loading={isLoading}>
            {data?.images ? (
              <>
                <Big>
                  {formatUsd(data.images.spentMicros)} <span className="text-muted-foreground">/ {formatUsd(data.images.budgetMicros)}</span>
                </Big>
                <Progress value={data.images.pct} tone={toneFor(data.images.pct)} className="mt-2.5" />
                <Sub>
                  {data.images.count} image{data.images.count === 1 ? "" : "s"} since {formatDate(data.images.since, { day: "numeric", month: "short" })}
                </Sub>
              </>
            ) : (
              <NotTracked onClick={() => setOpen(true)}>Enter your {name} balance to get a warning before images stop.</NotTracked>
            )}
          </Block>
        </div>

        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-muted-foreground">
          <BellRing className="size-3.5" />
          {alerts ? (
            <>
              {alerts.sales ? "Sale emails on" : "Sale emails off"} · {alerts.upstream ? `warnings at ${data?.settings.alertPercent ?? 80}% and 100%` : "warnings off"} · to{" "}
              <span className="font-medium text-foreground">{alerts.email || "your admin account email"}</span>
            </>
          ) : (
            "Loading alert settings…"
          )}
        </p>
      </CardBody>

      {data && settings && <PoolDialog open={open} onOpenChange={setOpen} status={data} alerts={settings.settings.adminAlerts} />}
    </Card>
  );
}

function Block({ icon: Icon, label, loading, children }: { icon: typeof Coins; label: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-4">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <div className="mt-2">{loading ? <Skeleton className="h-12 w-full" /> : children}</div>
    </div>
  );
}

const Big = ({ children }: { children: React.ReactNode }) => <p className="text-[20px] font-semibold tracking-tight tabular-nums">{children}</p>;
const Sub = ({ children, className }: { children: React.ReactNode; className?: string }) => <p className={cn("mt-1.5 text-[12.5px] text-muted-foreground", className)}>{children}</p>;

function NotTracked({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div>
      <p className="text-[13px] text-muted-foreground">{children}</p>
      <Button variant="outline" size="xs" className="mt-2.5" onClick={onClick}>
        Set it up
      </Button>
    </div>
  );
}

// ── Settings dialog ─────────────────────────────────────

type Form = {
  providerSlug: string;
  tokensM: string;
  periodStart: string;
  periodDays: string;
  imageBudget: string;
  imageBudgetSince: string;
  imageCost: string;
  alertPercent: string;
  email: string;
  sales: boolean;
  upstream: boolean;
};

function toForm(p: UpstreamPoolSettings, a: AdminAlerts): Form {
  return {
    providerSlug: p.providerSlug,
    tokensM: p.tokens ? String(p.tokens / M) : "",
    periodStart: p.periodStart,
    periodDays: String(p.periodDays || 30),
    imageBudget: p.imageBudgetMicros ? String(p.imageBudgetMicros / M) : "",
    imageBudgetSince: p.imageBudgetSince,
    imageCost: String(p.imageCostMicros / M),
    alertPercent: String(p.alertPercent || 80),
    email: a.email,
    sales: a.sales,
    upstream: a.upstream,
  };
}

const EMAILS = /^([^\s@,;]+@[^\s@,;]+\.[^\s@,;]+)([,;\s]+[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+)*$/;

function PoolDialog({ open, onOpenChange, status, alerts }: { open: boolean; onOpenChange: (o: boolean) => void; status: UpstreamPoolStatus; alerts: AdminAlerts }) {
  const [f, setF] = useState<Form>(() => toForm(status.settings, alerts));
  useEffect(() => {
    if (open) setF(toForm(status.settings, alerts));
    // reset only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const tokens = Math.round(num(f.tokensM, Number.NaN) * M);
  const budget = Math.round(num(f.imageBudget, Number.NaN) * M);
  const errors = {
    tokens: f.tokensM.trim() && !(tokens >= 0) ? "Enter a number of millions, e.g. 30" : f.tokensM.trim() && tokens > 0 && !f.periodStart ? "Also pick the day your plan started" : null,
    days: !(num(f.periodDays, 0) >= 1 && num(f.periodDays, 0) <= 366) ? "1 to 366 days" : null,
    budget: f.imageBudget.trim() && !(budget >= 0) ? "Enter an amount in USD" : null,
    cost: !(num(f.imageCost, Number.NaN) >= 0) ? "Enter the price per image in USD" : null,
    pct: !(num(f.alertPercent, 0) >= 1 && num(f.alertPercent, 0) <= 99) ? "1 to 99" : null,
    email: f.email.trim() && !EMAILS.test(f.email.trim()) ? "Enter one or more emails, separated by commas" : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = useAction(
    () =>
      api("/api/admin/settings", {
        method: "PATCH",
        body: {
          upstreamPool: {
            providerSlug: f.providerSlug,
            tokens: f.tokensM.trim() ? tokens : 0,
            periodStart: f.periodStart,
            periodDays: Math.round(num(f.periodDays, 30)),
            imageBudgetMicros: f.imageBudget.trim() ? budget : 0,
            // A new balance counts images from today unless a day was picked
            imageBudgetSince: f.imageBudget.trim() ? f.imageBudgetSince || today() : "",
            imageCostMicros: Math.round(num(f.imageCost, 0.0018) * M),
            alertPercent: Math.round(num(f.alertPercent, 80)),
          },
          adminAlerts: { email: f.email.trim(), sales: f.sales, upstream: f.upstream },
        },
      }),
    { success: "Saved", invalidate: [POOL_KEY, qk.settings], onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`${status.provider?.name ?? "Upstream"} pool & alerts`}
      description="What your upstream plan holds, so we can warn you before it runs out. Nothing here changes what customers can use."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={invalid || save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <h3 className="text-[13px] font-semibold">Plan tokens</h3>
          <Field label="Provider to watch" hint="The account all paid models are sent to.">
            <NativeSelect value={f.providerSlug} onChange={(e) => set("providerSlug", e.target.value)}>
              {status.providers.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Tokens in your plan (millions)" hint="Only used if the provider stops reporting its tokens left (FreeModel reports them on every response)." error={errors.tokens}>
            <Input inputMode="decimal" value={f.tokensM} onChange={(e) => set("tokensM", e.target.value)} placeholder="e.g. 30" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => set("tokensM", String(p.tokens / M))}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[12px] transition-colors hover:bg-muted",
                    tokens === p.tokens ? "border-accent/50 bg-accent-soft text-accent" : "border-border text-muted-foreground",
                  )}
                >
                  {p.label} · {formatTokens(p.tokens)}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Day the plan started" hint="Optional. Shows when it resets and predicts when it runs out. Later periods roll forward by themselves.">
              <Input type="date" value={f.periodStart} onChange={(e) => set("periodStart", e.target.value)} max={today()} />
            </Field>
            <Field label="Period length (days)" error={errors.days}>
              <Input inputMode="numeric" value={f.periodDays} onChange={(e) => set("periodDays", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t border-border pt-5">
          <h3 className="text-[13px] font-semibold">Balance for images</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Balance (USD)" hint="Leave empty to stop tracking." error={errors.budget}>
              <Input inputMode="decimal" value={f.imageBudget} onChange={(e) => set("imageBudget", e.target.value)} placeholder="e.g. 5" />
            </Field>
            <Field label="Entered on" hint="Images are counted from this day.">
              <Input type="date" value={f.imageBudgetSince} onChange={(e) => set("imageBudgetSince", e.target.value)} max={today()} />
            </Field>
            <Field label="Cost per image (USD)" error={errors.cost}>
              <Input inputMode="decimal" value={f.imageCost} onChange={(e) => set("imageCost", e.target.value)} />
            </Field>
          </div>
          <p className="text-[12px] text-muted-foreground">After you top up, enter the new balance and today&apos;s date here.</p>
        </section>

        <section className="space-y-4 border-t border-border pt-5">
          <h3 className="text-[13px] font-semibold">Alerts</h3>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field label="Send alerts to" hint="One or more emails, separated by commas. Empty = your admin account email." error={errors.email}>
              <Input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
            </Field>
            <Field label="Warn at (%)" hint="And again at 100%." error={errors.pct}>
              <Input inputMode="numeric" value={f.alertPercent} onChange={(e) => set("alertPercent", e.target.value)} />
            </Field>
          </div>
          <ToggleRow label="Email me every sale" description="A plan or pass bought or renewed: who, what, price, how they paid." checked={f.sales} onChange={(v) => set("sales", v)} />
          <ToggleRow
            label="Email me upstream warnings"
            description="Plan or image balance nearly used up, or the upstream rejecting the key or saying it's out of credit."
            checked={f.upstream}
            onChange={(v) => set("upstream", v)}
          />
        </section>
      </div>
    </Dialog>
  );
}
