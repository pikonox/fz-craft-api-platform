"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink, ImageOff, ShieldCheck, X } from "lucide-react";
import { formatPkr, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, CopyButton, Field, Input, Skeleton, Textarea } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import { qk } from "./queries";
import type { AdminPayment, AdminPaymentsResponse } from "./types";
import { JsonBlock, KV, PAYMENT_STATUS, PaymentStatusBadge, SectionLabel, num, useAction } from "./ui";

export const ACTIONABLE: AdminPayment["status"][] = ["pending_review", "verifying", "awaiting_payment"];
const AUTO = ["binance_pay", "usdt_bep20"];

export function purposeLabel(p: Pick<AdminPayment, "purpose" | "planName" | "cycle">) {
  if (p.purpose === "plan") return `Plan · ${p.planName ?? "—"}${p.cycle ? ` (${p.cycle})` : ""}`;
  return p.purpose === "image_wallet" ? "Image wallet" : "Balance top-up";
}

/** When the user submitted their reference (falls back to creation time). */
export function submittedAt(p: AdminPayment) {
  const h = [...(p.history ?? [])].reverse().find((x) => x.status === "pending_review" || x.status === "verifying");
  return h?.at ?? p.createdAt;
}

export function PaymentDialog({ id, initial, onClose, onNext }: { id: string | null; initial?: AdminPayment; onClose: () => void; onNext?: () => void }) {
  const { data: payment, isLoading } = useQuery({
    queryKey: qk.payment(id ?? ""),
    queryFn: () => api<AdminPaymentsResponse>(`/api/admin/payments?status=all&id=${id}`).then((r) => r.payments[0] ?? null),
    enabled: Boolean(id),
    placeholderData: initial,
  });
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);

  useEffect(() => setMode(null), [id]);

  const canAct = payment ? ACTIONABLE.includes(payment.status) : false;

  return (
    <>
      <Dialog
        open={Boolean(id)}
        onOpenChange={(o) => !o && onClose()}
        size="xl"
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            Payment review
            {payment && <PaymentStatusBadge status={payment.status} />}
          </span>
        }
        description={payment ? `${payment.methodLabel} · ${purposeLabel(payment)} · created ${formatDateTime(payment.createdAt)}` : "Loading payment…"}
        footer={
          payment ? (
            <>
              {onNext && (
                <Button variant="ghost" onClick={onNext} className="mr-auto">
                  Next <ArrowRight />
                </Button>
              )}
              {canAct ? (
                <>
                  <Button variant="danger-ghost" onClick={() => setMode("reject")}>
                    <X /> Reject
                  </Button>
                  <Button variant="accent" onClick={() => setMode("approve")}>
                    <Check /> Approve
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {isLoading && !payment ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-80 w-full rounded-xl" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-40" />
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </div>
        ) : !payment ? (
          <p className="py-10 text-center text-sm text-muted-foreground">This payment doesn&apos;t exist or was removed.</p>
        ) : (
          <PaymentBody payment={payment} />
        )}
      </Dialog>
      {payment && <ApproveDialog payment={payment} open={mode === "approve"} onOpenChange={(o) => setMode(o ? "approve" : null)} />}
      {payment && <RejectDialog payment={payment} open={mode === "reject"} onOpenChange={(o) => setMode(o ? "reject" : null)} />}
    </>
  );
}

function PaymentBody({ payment: p }: { payment: AdminPayment }) {
  const auto = AUTO.includes(p.method);
  const v = p.verification;
  const showVerification = Boolean(v && (v.attempts || v.lastError || v.lastCheckedAt || v.data)) || Boolean(p.lastError);
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
      <div className="min-w-0 space-y-4">
        {p.screenshotUrl ? (
          <div>
            <a href={p.screenshotUrl} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border border-border bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.screenshotUrl} alt="Payment screenshot uploaded by the user" className="max-h-[440px] w-full object-contain transition-opacity group-hover:opacity-90" />
            </a>
            <a href={p.screenshotUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ExternalLink className="size-3.5" /> Open full size
            </a>
          </div>
        ) : (
          <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center">
            {auto ? <ShieldCheck className="size-6 text-subtle-foreground" /> : <ImageOff className="size-6 text-subtle-foreground" />}
            <p className="text-sm font-medium">No screenshot</p>
            <p className="text-xs text-muted-foreground">{auto ? "This method is verified automatically from the reference." : "The user hasn't uploaded a receipt yet."}</p>
          </div>
        )}
        {p.userNote && (
          <div>
            <SectionLabel className="mb-1.5">Note from user</SectionLabel>
            <p className="whitespace-pre-wrap rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-[13px]">{p.userNote}</p>
          </div>
        )}
        {p.rejectReason && (
          <div>
            <SectionLabel className="mb-1.5">Reject reason</SectionLabel>
            <p className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-[13px] text-danger">{p.rejectReason}</p>
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-6">
        <div>
          <p className="text-[32px] font-semibold leading-none tracking-tight tabular">{formatUsd(p.amountMicros)}</p>
          <p className="mt-1.5 text-sm text-muted-foreground tabular">
            {p.amountPkr != null ? `${formatPkr(p.amountPkr)} at Rs ${p.pkrRate}/USD` : "Paid in USDT"}
            {p.receivedMicros != null && p.receivedMicros !== p.amountMicros && <span className="ml-2 text-warning">· received {formatUsd(p.receivedMicros)}</span>}
          </p>
        </div>

        <div>
          <KV label="User">
            <Link href={`/admin/users/${p.user.id}`} className="text-accent hover:underline">
              {p.user.email || p.user.id}
            </Link>
          </KV>
          <KV label="Method">{p.methodLabel}</KV>
          <KV label="Purpose">{purposeLabel(p)}</KV>
          <KV label="Reference">
            {p.reference ? (
              <span className="inline-flex max-w-full items-center gap-1">
                <code className="truncate font-mono text-xs">{p.reference}</code>
                <CopyButton value={p.reference} label="Reference" size="xs" />
              </span>
            ) : (
              <span className="text-muted-foreground">Not submitted</span>
            )}
          </KV>
          {p.receivedMicros != null && <KV label="Credited">{formatUsd(p.receivedMicros)}</KV>}
          <KV label="Submitted">{formatDateTime(submittedAt(p))}</KV>
          {p.expiresAt && ACTIONABLE.includes(p.status) && <KV label="Expires">{relativeTime(p.expiresAt)}</KV>}
          <KV label="Payment ID">
            <span className="inline-flex items-center gap-1">
              <code className="font-mono text-xs text-muted-foreground">{p.id}</code>
              <CopyButton value={p.id} label="Payment ID" size="xs" />
            </span>
          </KV>
        </div>

        {showVerification && (
          <div>
            <SectionLabel className="mb-2">Verification</SectionLabel>
            <div className="rounded-xl border border-border px-3.5">
              <KV label="Attempts">{v?.attempts ?? 0}</KV>
              {v?.lastCheckedAt && <KV label="Last checked">{formatDateTime(v.lastCheckedAt)}</KV>}
              {(v?.lastError || p.lastError) && (
                <div className="border-b border-border py-2.5 text-[13px] last:border-0">
                  <p className="text-muted-foreground">Last error</p>
                  <p className="mt-1 text-danger">{v?.lastError || p.lastError}</p>
                </div>
              )}
            </div>
            {v?.data != null && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Raw verification data</summary>
                <JsonBlock value={v.data} className="mt-2" />
              </details>
            )}
          </div>
        )}

        <div>
          <SectionLabel className="mb-3">History</SectionLabel>
          <ol className="relative space-y-4 border-l border-border pl-5">
            {[...(p.history ?? [])].reverse().map((h, i) => {
              const meta = PAYMENT_STATUS[h.status as AdminPayment["status"]];
              const dot = { success: "bg-success", danger: "bg-danger", warning: "bg-warning", info: "bg-info" }[meta?.tone as string] ?? "bg-subtle-foreground";
              return (
                <li key={i} className="relative">
                  <span className={cn("absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-elevated", dot)} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-[13px] font-medium">{meta?.label ?? h.status}</p>
                    <time className="text-xs text-muted-foreground" title={formatDateTime(h.at)}>
                      {relativeTime(h.at)}
                    </time>
                  </div>
                  {h.note && <p className="mt-0.5 text-xs text-muted-foreground">{h.note}</p>}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function ApproveDialog({ payment: p, open, onOpenChange }: { payment: AdminPayment; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [usd, setUsd] = useState("");
  const [pkr, setPkr] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setUsd("");
      setPkr("");
      setNote("");
    }
  }, [open]);
  const approve = useAction(
    () => {
      const amountUsd = num(usd);
      return api(`/api/admin/payments/${p.id}/approve`, { body: { ...(amountUsd > 0 ? { amountUsd } : {}), ...(note.trim() ? { note: note.trim() } : {}) } });
    },
    { success: "Payment approved and credited", invalidate: [qk.payments, ["admin", "stats"], ["admin", "users"]], onSuccess: () => onOpenChange(false) },
  );
  const expected = p.receivedMicros ?? p.amountMicros;
  const override = num(usd);
  const credit = override > 0 ? Math.round(override * 1_000_000) : expected;
  const wallet = p.purpose === "image_wallet" ? "image wallet" : "main balance";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Approve payment"
      description={`${p.user.email} · ${p.methodLabel}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="accent" loading={approve.isPending} onClick={() => approve.mutate()}>
            <Check /> Approve {formatUsd(credit)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-[13px] text-muted-foreground">
          Credits <span className="font-semibold text-foreground tabular">{formatUsd(credit)}</span> to the user&apos;s {wallet}
          {p.purpose === "plan" && p.planName ? (
            <>
              {" "}
              and activates <span className="font-medium text-foreground">{p.planName}</span> if it covers the price
            </>
          ) : null}
          .
        </p>
        <Field label="Amount received (USD)" hint={`Leave empty to credit the expected ${formatUsd(expected)}.`}>
          <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder={(expected / 1_000_000).toFixed(2)} value={usd} onChange={(e) => setUsd(e.target.value)} />
        </Field>
        {p.pkrRate ? (
          <Field label="…or PKR received" hint={`Converted at Rs ${p.pkrRate} per USD (the rate on the order).`}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder={String(p.amountPkr ?? "")}
              value={pkr}
              onChange={(e) => {
                setPkr(e.target.value);
                const v = num(e.target.value);
                setUsd(v > 0 ? String(Math.floor((v / (p.pkrRate ?? 1)) * 100) / 100) : "");
              }}
            />
          </Field>
        ) : null}
        <Field label="Note (optional)" hint="Added to the payment history.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-16" placeholder="e.g. Verified on bank statement" />
        </Field>
      </div>
    </Dialog>
  );
}

const QUICK_REASONS = ["Transaction ID not found in our account", "Amount received is less than the order amount", "Screenshot doesn't match the transaction", "Duplicate submission"];

function RejectDialog({ payment: p, open, onOpenChange }: { payment: AdminPayment; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const reject = useAction(() => api(`/api/admin/payments/${p.id}/reject`, { body: { reason: reason.trim() } }), {
    success: "Payment rejected. The user has been notified.",
    invalidate: [qk.payments, ["admin", "stats"]],
    onSuccess: () => onOpenChange(false),
  });
  const valid = reason.trim().length >= 3;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Reject payment"
      description="The user sees this reason and can submit again."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={reject.isPending} disabled={!valid} onClick={() => reject.mutate()}>
            Reject payment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Reason" error={reason && !valid ? "Give the user a reason (at least 3 characters)" : null}>
          <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Explain what's wrong so the user can fix it" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {r}
            </button>
          ))}
        </div>
        <Badge tone="outline" className="mt-1">
          {formatUsd(p.amountMicros)} · {p.methodLabel}
        </Badge>
      </div>
    </Dialog>
  );
}
