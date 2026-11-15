"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, ExternalLink, ImageIcon, LifeBuoy, Receipt } from "lucide-react";
import { toast } from "sonner";
import { formatPkr, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CopyButton, EmptyState, Skeleton } from "@/components/ui/primitives";
import { PaymentPanel, PaymentTimeline, STATUS_META } from "@/components/billing/payment-panel";
import { ConfirmDialog, METHOD_ICON, PENDING_STATUSES, paymentTitle, shortId } from "@/components/account/common";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useRefreshAccount } from "@/lib/queries";
import type { Payment, PaymentMethodInfo } from "@/lib/types";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

type PaymentDetail = { payment: Payment; method: PaymentMethodInfo | null; pkrPerUsd: number };

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const refresh = useRefreshAccount();
  const key = ["billing", "payment", id];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api<PaymentDetail>(`/api/billing/payments/${id}`),
    // Keep an eye on manual reviews so approval shows up without a reload
    refetchInterval: (q) => (q.state.data?.payment.status === "pending_review" ? 15_000 : false),
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const onChange = useCallback(
    (p: Payment) => {
      qc.setQueryData<PaymentDetail>(["billing", "payment", id], (old) => (old ? { ...old, payment: p } : old));
      void qc.invalidateQueries({ queryKey: ["billing", "payments"] });
      void qc.invalidateQueries({ queryKey: ["billing", "summary"] });
    },
    [qc, id],
  );

  const cancel = async () => {
    setCancelling(true);
    try {
      await api(`/api/billing/payments/${id}/cancel`, { method: "POST" });
      toast.success("Payment cancelled");
      setCancelOpen(false);
      await qc.invalidateQueries({ queryKey: key });
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  };

  if (error) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <EmptyState
            icon={<Receipt />}
            title={notFound ? "Payment not found" : "Couldn't load this payment"}
            description={notFound ? "It may belong to a different account, or the link is incorrect." : errorMessage(error)}
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/billing/balance">Back to Balance</Link>
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const p = data?.payment;
  const Icon = p ? METHOD_ICON[p.method] : Receipt;
  const meta = p ? STATUS_META[p.status] : null;
  const pending = p && PENDING_STATUSES.includes(p.status);
  const supportHref = p ? `/dashboard/support?new=1&category=billing&subject=${encodeURIComponent(`Payment ${shortId(p.id)} (${p.methodLabel})`)}` : "/dashboard/support";

  return (
    <div className="space-y-7">
      <BackLink />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {isLoading || !p || !meta ? (
          <div>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-9 w-56" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-4">
            <span className="hidden size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground sm:flex">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                {paymentTitle(p)}
                <span className="font-mono text-xs text-subtle-foreground">{shortId(p.id)}</span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="text-[28px] font-semibold tracking-tight tabular">{formatUsd(p.amountMicros)}</h1>
                <Badge tone={meta.tone} dot={p.status === "verifying" || p.status === "pending_review"}>
                  {meta.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {p.methodLabel}
                {p.amountPkr != null ? ` · ${formatPkr(p.amountPkr)}` : ""} · started {relativeTime(p.createdAt)}
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={supportHref}>
              <LifeBuoy /> Get help
            </Link>
          </Button>
          {p?.status === "awaiting_payment" && (
            <Button variant="danger-ghost" onClick={() => setCancelOpen(true)}>
              <Ban /> Cancel order
            </Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title={p?.status === "awaiting_payment" ? "Complete your payment" : "Payment status"}
            description={
              p?.status === "awaiting_payment"
                ? "Send the exact amount, then submit the transaction ID."
                : pending
                  ? "We'll notify you as soon as it's confirmed."
                  : p
                    ? `Last updated ${formatDateTime(p.updatedAt)}`
                    : undefined
            }
          />
          <CardBody>
            {isLoading || !p ? (
              <div className="space-y-3">
                <Skeleton className="h-28" />
                <Skeleton className="h-20" />
                <Skeleton className="h-10" />
              </div>
            ) : (
              <PaymentPanel payment={p} method={data?.method ?? null} onChange={onChange} />
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>{p ? <PaymentTimeline payment={p} /> : <Skeleton className="h-24" />}</CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody className="py-2">
              {p ? (
                <dl>
                  <Row label="Order ID" value={p.id} mono copy />
                  <Row label="For" value={paymentTitle(p)} />
                  <Row label="Amount" value={formatUsd(p.amountMicros)} />
                  {p.amountPkr != null && <Row label="In PKR" value={`${formatPkr(p.amountPkr)}${p.pkrRate ? ` at Rs ${p.pkrRate}/$` : ""}`} />}
                  {p.receivedMicros != null && <Row label="Received" value={formatUsd(p.receivedMicros)} />}
                  {p.reference && <Row label="Your reference" value={p.reference} mono copy />}
                  {p.userNote && <Row label="Note" value={p.userNote} />}
                  <Row label="Created" value={formatDateTime(p.createdAt)} />
                  {p.expiresAt && pending && <Row label="Expires" value={formatDateTime(p.expiresAt)} />}
                </dl>
              ) : (
                <Skeleton className="my-3 h-32" />
              )}
            </CardBody>
          </Card>

          {p?.screenshotUrl && (
            <Card>
              <CardHeader
                title="Receipt"
                action={
                  <Button size="xs" variant="ghost" asChild>
                    <a href={p.screenshotUrl} target="_blank" rel="noreferrer">
                      <ExternalLink /> Open
                    </a>
                  </Button>
                }
              />
              <CardBody>
                <ReceiptPreview url={p.screenshotUrl} />
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this payment?"
        confirmLabel="Cancel order"
        variant="danger"
        loading={cancelling}
        onConfirm={cancel}
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Only cancel if you haven&apos;t sent any money yet. If you already paid, submit the transaction ID instead so we can credit you.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function ReceiptPreview({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-[13px] text-muted-foreground hover:text-foreground">
        <ImageIcon className="size-5" />
        Preview unavailable — open the file
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border border-border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Payment receipt screenshot" onError={() => setBroken(true)} className="max-h-72 w-full object-contain transition-transform group-hover:scale-[1.02]" />
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        <ImageIcon className="size-3" /> View full size
      </span>
    </a>
  );
}

function BackLink() {
  return (
    <Link href="/dashboard/billing/balance" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Balance & top-up
    </Link>
  );
}

function Row({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className={cn("truncate text-right text-[13px] font-medium", mono && "font-mono text-xs")} title={value}>
          {value}
        </span>
        {copy && <CopyButton value={value} label={label} size="xs" />}
      </dd>
    </div>
  );
}
