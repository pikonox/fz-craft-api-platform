"use client";

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Clock, Coins, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { formatPkr, formatTokens, formatUsd, usdToMicros, microsToPkr } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { Badge, Input, Skeleton } from "@/components/ui/primitives";
import { PaymentPanel } from "./payment-panel";
import { api, errorMessage } from "@/lib/api";
import { useModels, usePlans } from "@/lib/queries";
import { useCheckout } from "@/lib/stores";
import type { Payment, PaymentMethodInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const METHOD_ICON: Record<PaymentMethodInfo["method"], typeof Coins> = {
  binance_pay: Zap,
  usdt_bep20: Coins,
  jazzcash: Smartphone,
  easypaisa: Smartphone,
  bank_transfer: Building2,
};

const PRESETS = { balance: [5, 10, 25, 50], image_wallet: [1, 2, 5, 10] };
/** Used for the "≈ N images" hint until the live model prices load. */
const IMAGE_PRICE_FALLBACK = 0.003;

export function usePaymentMethods() {
  return useQuery({
    queryKey: ["billing", "methods"],
    queryFn: () => api<{ pkrPerUsd: number; methods: PaymentMethodInfo[] }>("/api/billing/payment-methods"),
    staleTime: 60_000,
  });
}

export function CheckoutDialog() {
  const { open, intent, close } = useCheckout();
  const { data: methodsData, isLoading } = usePaymentMethods();
  const { data: plans } = usePlans();
  const { data: models } = useModels();
  // Cheapest live price per image (any quality), for the "≈ N images" hint
  const imagePrice = useMemo(() => {
    const prices = (models ?? []).filter((m) => m.type === "image").flatMap((m) => Object.values(m.pricing.perImage ?? {})).filter((p): p is number => typeof p === "number" && p > 0);
    return prices.length ? Math.min(...prices) / 1e6 : IMAGE_PRICE_FALLBACK;
  }, [models]);
  const [amount, setAmount] = useState<number>(10);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<PaymentMethodInfo["method"] | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !intent) return;
    setPayment(null);
    setError(null);
    setCustom("");
    setMethod(null);
    if (intent.purpose !== "plan") setAmount(intent.amountUsd ?? (intent.purpose === "image_wallet" ? 2 : 10));
  }, [open, intent]);

  const plan = intent?.purpose === "plan" ? plans?.find((p) => p.id === intent.planId) : null;
  const planPrice = plan && intent?.purpose === "plan" ? (plan.kind === "pass" ? plan.pricePass : intent.cycle === "yearly" ? plan.priceYearly : plan.priceMonthly) : 0;
  const usd = intent?.purpose === "plan" ? planPrice / 1e6 : custom ? Number(custom) : amount;
  const methods = methodsData?.methods ?? [];
  const selected = methods.find((m) => m.method === method) ?? null;
  const tooLow = selected && intent?.purpose !== "plan" && usd < selected.minUsd;

  const title = !intent ? "" : intent.purpose === "plan" ? `Get ${plan?.name ?? "plan"}` : intent.purpose === "image_wallet" ? "Add image credits" : "Add balance";
  const description = payment ? `${payment.methodLabel} · order #${payment.id.slice(-6).toUpperCase()}` : intent?.purpose === "image_wallet" ? "Image credits are separate from your main balance and only pay for Image Studio." : "Pay with Binance, USDT or local Pakistani methods.";

  const create = async () => {
    if (!intent || !method) return;
    setError(null);
    setCreating(true);
    try {
      const body =
        intent.purpose === "plan"
          ? { method, purpose: "plan", planId: intent.planId, cycle: intent.cycle }
          : { method, purpose: intent.purpose, amountUsd: usd };
      const r = await api<{ payment: Payment }>("/api/billing/payments", { body });
      setPayment(r.payment);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const onChange = useCallback((p: Payment) => setPayment(p), []);
  const pkr = useMemo(() => (methodsData ? microsToPkr(usdToMicros(usd || 0), methodsData.pkrPerUsd) : 0), [usd, methodsData]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={
        payment ? (
          <span className="flex items-center gap-2">
            {payment.status === "awaiting_payment" && (
              <button onClick={() => setPayment(null)} className="-ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Back">
                <ArrowLeft className="size-4" />
              </button>
            )}
            Complete your payment
          </span>
        ) : (
          title
        )
      }
      description={description}
      size="md"
    >
      {payment ? (
        <PaymentPanel payment={payment} method={methods.find((m) => m.method === payment.method) ?? null} onChange={onChange} />
      ) : (
        <div className="space-y-6">
          {intent?.purpose === "plan" ? (
            <div className="hero-surface rounded-xl border border-border p-4">
              {plan ? (
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{plan.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatTokens(plan.tokens)} tokens · {plan.rpm} req/min · {plan.kind === "pass" ? "24 hours" : intent.cycle === "yearly" ? "billed yearly" : "billed monthly"}
                    </p>
                  </div>
                  <p className="text-2xl font-semibold tabular">{formatUsd(planPrice)}</p>
                </div>
              ) : (
                <Skeleton className="h-10 w-full" />
              )}
              <p className="mt-3 text-xs text-muted-foreground">The payment goes to your balance and the plan activates automatically once it's confirmed.</p>
            </div>
          ) : (
            <div>
              <p className="mb-2.5 text-[13px] font-medium">Amount</p>
              <div className="grid grid-cols-4 gap-2">
                {(intent ? PRESETS[intent.purpose as "balance" | "image_wallet"] ?? PRESETS.balance : PRESETS.balance).map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setAmount(v);
                      setCustom("");
                    }}
                    className={cn(
                      "h-11 rounded-lg border text-sm font-semibold tabular transition-colors",
                      !custom && amount === v ? "border-accent bg-accent-soft text-foreground" : "border-border hover:border-border-strong",
                    )}
                  >
                    ${v}
                  </button>
                ))}
              </div>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input type="number" min={1} step="0.01" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom amount" className="pl-7 tabular" />
              </div>
              {intent?.purpose === "image_wallet" && usd > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">≈ {Math.floor(usd / imagePrice).toLocaleString()} images.</p>
              )}
            </div>
          )}

          <div>
            <p className="mb-2.5 text-[13px] font-medium">Payment method</p>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : (
              <div className="space-y-2">
                {methods.map((m) => {
                  const Icon = METHOD_ICON[m.method];
                  const active = method === m.method;
                  return (
                    <button
                      key={m.method}
                      onClick={() => setMethod(m.method)}
                      className={cn(
                        "flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all",
                        active ? "border-accent bg-accent-soft/60 ring-1 ring-accent/40" : "border-border hover:border-border-strong hover:bg-muted/40",
                      )}
                    >
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", active ? "bg-accent text-white" : "bg-muted text-muted-foreground")}>
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {m.label}
                          {m.auto ? (
                            <Badge tone="success">
                              <ShieldCheck className="size-3" /> Instant
                            </Badge>
                          ) : (
                            <Badge tone="neutral">
                              <Clock className="size-3" /> ~30 min review
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {m.currency === "PKR" ? `Pay ${formatPkr(pkr)} in PKR` : `Pay ${usd ? usd.toFixed(2) : "—"} USDT`} · min ${m.minUsd}
                        </span>
                      </span>
                      <span className={cn("size-4 rounded-full border-2", active ? "border-accent bg-accent shadow-[inset_0_0_0_3px_var(--elevated)]" : "border-border-strong")} />
                    </button>
                  );
                })}
                {!methods.length && <p className="text-sm text-muted-foreground">No payment methods are enabled yet.</p>}
              </div>
            )}
          </div>

          {error && <p className="text-[13px] text-danger">{error}</p>}
          {tooLow && <p className="text-[13px] text-warning">The minimum for {selected?.label} is ${selected?.minUsd}.</p>}
          <Button variant="primary" size="lg" className="w-full" disabled={!method || !usd || usd <= 0 || Boolean(tooLow)} loading={creating} onClick={create}>
            Continue · {usd > 0 ? `$${usd.toFixed(2)}` : "$0.00"}
          </Button>
          <p className="text-center text-[12px] text-subtle-foreground">
            By paying you agree to our{" "}
            <Link href="/legal/terms" target="_blank" className="underline underline-offset-2 hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/refunds" target="_blank" className="underline underline-offset-2 hover:text-foreground">
              Refund Policy
            </Link>
            .
          </p>
        </div>
      )}
    </Dialog>
  );
}
