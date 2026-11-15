"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Clock, ImageIcon, Layers, Plus, Receipt, ShieldCheck, Wallet } from "lucide-react";
import { formatNumber, formatPkr, formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CopyButton, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { StatTile } from "@/components/dashboard/stat";
import { STATUS_META } from "@/components/billing/payment-panel";
import { usePaymentMethods } from "@/components/billing/checkout-dialog";
import { METHOD_ICON, PENDING_STATUSES, Pager, TH, TX_META, TX_STATUS_TONE, paymentTitle, shortId, type Transaction } from "@/components/account/common";
import { api } from "@/lib/api";
import { useMe, useModels } from "@/lib/queries";
import { useCheckout } from "@/lib/stores";
import type { Entitlement, Payment } from "@/lib/types";
import { cn, formatDate, formatDateTime, relativeTime } from "@/lib/utils";

type BillingSummary = {
  mainBalance: number;
  imageBalance: number;
  entitlement: Entitlement;
  stats: { totalDeposited: number; imageDeposited: number; spentOnPlans: number; pendingPayments: number; transactions: number };
  pkrPerUsd: number;
};
type TxFilter = "all" | "deposits" | "plans" | "rewards" | "images";
const QUICK = [5, 10, 25, 50];
const PAGE_SIZE = 10;

export default function BalancePage() {
  const { data: me } = useMe();
  const start = useCheckout((s) => s.start);
  const { data: summary, isLoading } = useQuery({ queryKey: ["billing", "summary"], queryFn: () => api<BillingSummary>("/api/billing/summary") });
  const { data: models } = useModels();

  const main = summary?.mainBalance ?? me?.user.mainBalance;
  const image = summary?.imageBalance ?? me?.user.imageBalance;
  const s = summary?.stats;

  // Cheapest 1K image across image models, for the "≈ N images" hint
  const cheapestImage = useMemo(() => {
    const prices = (models ?? []).filter((m) => m.type === "image" && m.pricing.perImage?.["1K"] > 0).map((m) => m.pricing.perImage["1K"]);
    return prices.length ? Math.min(...prices) : 0;
  }, [models]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Balance & top-up"
        description="Your balance pays for plans and passes. Top up with Binance Pay, USDT or local Pakistani methods."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/dashboard/billing/plan">
                <Layers /> View plans
              </Link>
            </Button>
            <Button variant="primary" onClick={() => start({ purpose: "balance" })}>
              <Plus /> Add funds
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
        {/* Balances */}
        <Card className="hero-surface relative overflow-hidden">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
          <div className="relative flex h-full flex-col p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <Badge tone="outline" className="bg-card/60">
                <Wallet className="size-3" /> Main balance
              </Badge>
              <span className="text-xs text-muted-foreground">Never expires</span>
            </div>
            {main === undefined ? (
              <Skeleton className="mt-5 h-12 w-48" />
            ) : (
              <p className="mt-4 text-[44px] font-semibold leading-none tracking-tight tabular sm:text-5xl">{formatUsd(main)}</p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">Used for plans, passes and renewals.</p>
            <RenewalHint balance={main} />

            <div className="my-6">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">Quick top-up</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {QUICK.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => start({ purpose: "balance", amountUsd: v })}
                    className="h-11 rounded-xl border border-border bg-card/70 text-sm font-semibold tabular backdrop-blur transition-colors hover:border-accent hover:bg-accent-soft"
                  >
                    +${v}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => start({ purpose: "balance" })}
                  className="h-11 rounded-xl border border-dashed border-border-strong text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                >
                  Custom
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card/70 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:mt-auto">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <ImageIcon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground">
                    Image credits
                    <span className="text-lg font-semibold text-foreground tabular">{image === undefined ? "—" : formatUsd(image)}</span>
                  </p>
                  <p className="text-xs text-subtle-foreground">
                    {cheapestImage && image ? `≈ ${formatNumber(Math.floor(image / cheapestImage))} images · ` : ""}Separate wallet, only used by Image Studio
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="bg-card" onClick={() => start({ purpose: "image_wallet" })}>
                <Plus /> Add image credits
              </Button>
            </div>
          </div>
        </Card>

        <MethodsCard />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total deposited" loading={isLoading} value={formatUsd(s?.totalDeposited ?? 0)} sub={s?.imageDeposited ? `+ ${formatUsd(s.imageDeposited)} in image credits` : "Approved top-ups, all time"} />
        <StatTile label="Spent on plans" loading={isLoading} value={formatUsd(s?.spentOnPlans ?? 0)} sub="Plans and passes, net of refunds" />
        <StatTile
          label="Pending payments"
          loading={isLoading}
          value={formatNumber(s?.pendingPayments ?? 0)}
          sub={s?.pendingPayments ? <span className="text-warning">Waiting for payment or review</span> : "Nothing waiting"}
        />
        <StatTile label="Transactions" loading={isLoading} value={formatNumber(s?.transactions ?? 0)} sub="Every credit and charge" />
      </div>

      <PaymentsCard />
      <TransactionsCard />
    </div>
  );
}

/** One line about the next charge on the balance, so people know whether a top-up is needed. */
function RenewalHint({ balance }: { balance: number | undefined }) {
  const { data: me } = useMe();
  const plan = me?.entitlement.plan;
  if (!plan || balance === undefined) return null;
  if (plan.isFree || !plan.priceMicros) {
    return (
      <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground">
        <Layers className="size-3.5" /> On the Free plan — nothing is charged automatically.
      </p>
    );
  }
  if (!plan.autoRenew) {
    return (
      <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" /> Auto-renew is off — {plan.name} ends {formatDate(plan.termEndsAt)}.
      </p>
    );
  }
  const covered = balance >= plan.priceMicros;
  return (
    <p
      className={cn(
        "mt-3 inline-flex w-fit flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
        covered ? "border-border bg-card/60 text-muted-foreground" : "border-warning/30 bg-warning-soft text-warning",
      )}
    >
      {covered ? <ShieldCheck className="size-3.5 text-success" /> : <Clock className="size-3.5" />}
      Next charge: {plan.name} renewal <span className="font-medium text-foreground tabular">{formatUsd(plan.priceMicros)}</span> on {formatDate(plan.termEndsAt, { year: undefined })}
      {covered ? " · covered" : ` · top up ${formatUsd(plan.priceMicros - balance)} to keep it`}
    </p>
  );
}

function MethodsCard() {
  const { data, isLoading } = usePaymentMethods();
  return (
    <Card className="flex flex-col">
      <CardHeader title="Payment methods" description="Pick one at checkout" />
      <CardBody className="flex flex-1 flex-col gap-1 py-3">
        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : !data?.methods.length ? (
          <EmptyState icon={<Wallet />} title="No methods enabled" description="Payments are temporarily unavailable. Contact support." className="py-8" />
        ) : (
          <ul className="divide-y divide-border">
            {data.methods.map((m) => {
              const Icon = METHOD_ICON[m.method];
              return (
                <li key={m.method} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      Pay in {m.currency} · min ${m.minUsd}
                    </span>
                  </span>
                  {m.auto ? (
                    <Badge tone="success">
                      <ShieldCheck className="size-3" /> Instant
                    </Badge>
                  ) : (
                    <Badge tone="neutral">
                      <Clock className="size-3" /> Manual review
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {data && (
          <p className="mt-auto rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            PKR payments use <span className="font-medium text-foreground tabular">Rs {data.pkrPerUsd}</span> per $1 — the exact rupee amount is shown at checkout. Manual reviews usually take about 30 minutes.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function PaymentsCard() {
  const { data, isLoading } = useQuery({ queryKey: ["billing", "payments"], queryFn: () => api<{ payments: Payment[] }>("/api/billing/payments") });
  const [showAll, setShowAll] = useState(false);
  const payments = data?.payments ?? [];
  const pending = payments.filter((p) => PENDING_STATUSES.includes(p.status));
  const rest = payments.filter((p) => !PENDING_STATUSES.includes(p.status));
  const visible = showAll ? rest : rest.slice(0, 5);

  return (
    <Card>
      <CardHeader
        title="Your payments"
        description="Orders started with Binance Pay, USDT or PKR methods"
        action={payments.length ? <span className="text-xs text-muted-foreground tabular">{payments.length} total</span> : undefined}
      />
      {isLoading ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : !payments.length ? (
        <EmptyState icon={<Receipt />} title="No payments yet" description="Top-ups and plan payments you start show up here so you can track them." />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="border-b border-border bg-warning-soft/40 px-3 py-3 sm:px-5">
              <p className="mb-2 flex items-center gap-2 px-2 text-xs font-medium text-warning sm:px-0">
                <Clock className="size-3.5" /> {pending.length} in progress
              </p>
              <ul className="space-y-2">
                {pending.map((p) => (
                  <PaymentRow key={p.id} payment={p} prominent />
                ))}
              </ul>
            </div>
          )}
          {rest.length > 0 && (
            <ul className="divide-y divide-border">
              {visible.map((p) => (
                <PaymentRow key={p.id} payment={p} />
              ))}
            </ul>
          )}
          {rest.length > 5 && (
            <div className="border-t border-border px-5 py-2.5 text-center">
              <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : `Show all ${rest.length}`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function PaymentRow({ payment: p, prominent }: { payment: Payment; prominent?: boolean }) {
  const Icon = METHOD_ICON[p.method] ?? Wallet;
  const meta = STATUS_META[p.status];
  const href = `/dashboard/billing/payments/${p.id}`;
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group flex items-center gap-3 px-5 py-3 transition-colors",
          prominent ? "rounded-xl border border-warning/25 bg-card px-3.5 hover:border-warning/50" : "hover:bg-muted/40",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium">{paymentTitle(p)}</span>
            <span className="hidden font-mono text-[11px] text-subtle-foreground sm:inline">{shortId(p.id)}</span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {p.methodLabel}
            {p.amountPkr != null ? ` · ${formatPkr(p.amountPkr)}` : ""} · {prominent ? relativeTime(p.createdAt) : formatDateTime(p.createdAt)}
          </span>
        </span>
        <span className="hidden text-right text-[13px] font-semibold tabular sm:block">{formatUsd(p.amountMicros)}</span>
        <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-[13px] font-semibold tabular sm:hidden">{formatUsd(p.amountMicros)}</span>
          <Badge tone={meta.tone} dot={p.status === "verifying" || p.status === "pending_review"}>
            {meta.label}
          </Badge>
        </span>
        {prominent && p.status === "awaiting_payment" ? (
          <span className="hidden items-center gap-1 text-[13px] font-medium text-accent sm:flex">
            Continue <ArrowRight className="size-3.5" />
          </span>
        ) : (
          <ChevronRight className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
        )}
      </Link>
    </li>
  );
}

function TransactionsCard() {
  const [filter, setFilter] = useState<TxFilter>("all");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["billing", "transactions", filter, page],
    queryFn: () => api<{ transactions: Transaction[]; total: number; page: number; limit: number }>(`/api/billing/transactions?type=${filter}&page=${page}&limit=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });
  const rows = data?.transactions ?? [];

  return (
    <Card>
      <CardHeader
        title="Transactions"
        description="Every credit and charge on your wallets"
        action={
          <Segmented
            size="sm"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "deposits", label: "Deposits" },
              { value: "plans", label: "Plans" },
              { value: "rewards", label: "Rewards" },
              { value: "images", label: "Images" },
            ]}
            className="hidden md:inline-flex"
          />
        }
      />
      <div className="border-b border-border px-4 py-3 md:hidden">
        <Segmented
          size="sm"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "deposits", label: "Deposits" },
            { value: "plans", label: "Plans" },
            { value: "rewards", label: "Rewards" },
            { value: "images", label: "Images" },
          ]}
        />
      </div>
      {isLoading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !rows.length ? (
        <EmptyState
          icon={<Receipt />}
          title={filter === "all" ? "No transactions yet" : "Nothing here"}
          description={filter === "all" ? "Deposits, plan purchases and rewards will be listed here." : "No transactions match this filter."}
        />
      ) : (
        <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr>
                <th className={cn(TH, "pl-5")}>Date</th>
                <th className={TH}>Description</th>
                <th className={TH}>Reference</th>
                <th className={TH}>Method</th>
                <th className={cn(TH, "text-right")}>Amount</th>
                <th className={cn(TH, "pr-5 text-right")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const meta = TX_META[t.type] ?? TX_META.admin_adjust;
                const positive = t.amountMicros > 0;
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="whitespace-nowrap py-3 pl-5 pr-3 text-muted-foreground">
                      <span title={formatDateTime(t.createdAt)}>{formatDate(t.createdAt)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <meta.icon className="size-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[280px] truncate font-medium" title={t.description}>
                            {t.description}
                          </span>
                          <span className="text-[11px] text-subtle-foreground">
                            {meta.label}
                            {t.wallet === "image" ? " · image wallet" : ""}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-0.5">
                        {t.paymentId ? (
                          <Link href={`/dashboard/billing/payments/${t.paymentId}`} className="max-w-[150px] truncate font-mono text-xs text-muted-foreground hover:text-accent hover:underline">
                            {t.reference}
                          </Link>
                        ) : (
                          <span className="max-w-[150px] truncate font-mono text-xs text-muted-foreground">{t.reference}</span>
                        )}
                        <CopyButton value={t.reference} label="Reference" size="xs" />
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{t.method || "—"}</td>
                    <td className={cn("whitespace-nowrap px-3 py-3 text-right font-medium tabular", positive && "text-success")}>
                      {t.amountMicros !== 0 ? formatUsd(t.amountMicros, { sign: true }) : t.tokens ? `+${formatTokens(t.tokens)} tokens` : formatUsd(0)}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right">
                      <Badge tone={TX_STATUS_TONE[t.status]}>{t.status[0].toUpperCase() + t.status.slice(1)}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} limit={PAGE_SIZE} total={data.total} onPage={setPage} />}
    </Card>
  );
}
