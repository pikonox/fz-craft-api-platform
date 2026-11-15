"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { CircleAlert, CircleCheck, Clock, ImageUp, LoaderCircle, ShieldCheck, X, XCircle } from "lucide-react";
import { formatPkr, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, CopyButton, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import type { Payment, PaymentMethodInfo } from "@/lib/types";
import { useRefreshAccount } from "@/lib/queries";
import { cn, formatDateTime } from "@/lib/utils";

export const STATUS_META: Record<Payment["status"], { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info" }> = {
  awaiting_payment: { label: "Awaiting payment", tone: "neutral" },
  verifying: { label: "Verifying", tone: "info" },
  pending_review: { label: "Under review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const REF_LABEL: Record<PaymentMethodInfo["method"], { label: string; placeholder: string; hint: string }> = {
  binance_pay: { label: "Binance Pay Order ID", placeholder: "e.g. 312456789012345678", hint: "Binance → Pay → History → open the transfer → Order ID" },
  usdt_bep20: { label: "Transaction hash", placeholder: "0x…", hint: "Copy the TxID from your wallet or exchange withdrawal history" },
  jazzcash: { label: "Transaction ID (TID)", placeholder: "e.g. 012345678901", hint: "Shown on the JazzCash receipt / SMS" },
  easypaisa: { label: "Transaction ID", placeholder: "e.g. 31245678901", hint: "Shown on the Easypaisa receipt / SMS" },
  bank_transfer: { label: "Reference / transaction no.", placeholder: "e.g. FT2410…", hint: "From your bank app receipt" },
};

function DetailRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        <span className={cn("truncate text-[13px] font-medium", mono && "font-mono text-xs")}>{value}</span>
        <CopyButton value={value} label={label} size="xs" />
      </span>
    </div>
  );
}

export function PaymentPanel({ payment, method, onChange }: { payment: Payment; method: PaymentMethodInfo | null; onChange: (p: Payment) => void }) {
  const refresh = useRefreshAccount();
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAuto = method?.auto ?? (payment.method === "binance_pay" || payment.method === "usdt_bep20");
  const isPkr = payment.amountPkr != null;
  const refMeta = REF_LABEL[payment.method];

  // Poll while an automatic check is running
  useEffect(() => {
    if (payment.status !== "verifying") return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ payment: Payment }>(`/api/billing/payments/${payment.id}/recheck`, { method: "POST" });
        onChange(r.payment);
        if (r.payment.status === "approved") refresh();
      } catch {
        /* keep polling */
      }
    }, 8000);
    return () => clearInterval(t);
  }, [payment.status, payment.id, onChange, refresh]);

  const submit = async () => {
    setError(null);
    if (!reference.trim()) return setError(`Enter the ${refMeta.label.toLowerCase()}`);
    if (!isAuto && !file) return setError("Upload a screenshot of your payment receipt");
    const form = new FormData();
    form.append("reference", reference.trim());
    if (note) form.append("note", note);
    if (file) form.append("screenshot", file);
    setSubmitting(true);
    try {
      const r = await api<{ payment: Payment }>(`/api/billing/payments/${payment.id}/submit`, { form });
      onChange(r.payment);
      if (r.payment.status === "approved") refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const usdtAmount = (payment.amountMicros / 1e6).toFixed(payment.method === "usdt_bep20" ? 4 : 2);
  const what = payment.purpose === "plan" ? `${payment.planName ?? "Plan"} plan` : payment.purpose === "image_wallet" ? "Image credits" : "Balance top-up";

  if (payment.status === "approved") {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <CircleCheck className="size-7" />
        </span>
        <p className="mt-4 text-lg font-semibold">Payment approved</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {formatUsd(payment.receivedMicros ?? payment.amountMicros)} received.{" "}
          {payment.purpose === "plan" ? `Your ${payment.planName} plan is active.` : payment.purpose === "image_wallet" ? "Your image credits are ready." : "Your balance has been updated."}
        </p>
        <div className="mt-5 flex gap-2">
          {payment.purpose === "image_wallet" ? (
            <Button variant="primary" asChild>
              <Link href="/dashboard/image-studio">Start creating</Link>
            </Button>
          ) : (
            <Button variant="primary" asChild>
              <Link href={payment.purpose === "plan" ? "/dashboard" : "/dashboard/billing/plan"}>{payment.purpose === "plan" ? "Go to dashboard" : "Choose a plan"}</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (payment.status === "verifying" || payment.status === "pending_review") {
    const verifying = payment.status === "verifying";
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <span className={cn("flex size-14 items-center justify-center rounded-full", verifying ? "bg-info-soft text-info" : "bg-warning-soft text-warning")}>
          {verifying ? <LoaderCircle className="size-7 animate-spin" /> : <Clock className="size-7" />}
        </span>
        <p className="mt-4 text-lg font-semibold">{verifying ? "Verifying your payment…" : "Payment under review"}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {verifying
            ? payment.lastError || "We're checking the transaction automatically. This usually takes under a minute."
            : "Our team checks manual payments quickly — usually within 30 minutes. You'll get a notification as soon as it's approved."}
        </p>
        <p className="mt-4 font-mono text-xs text-subtle-foreground">Ref: {payment.reference}</p>
        <Button variant="outline" size="sm" className="mt-5" asChild>
          <Link href={`/dashboard/billing/payments/${payment.id}`}>Track this payment</Link>
        </Button>
      </div>
    );
  }

  if (payment.status !== "awaiting_payment") {
    const meta = STATUS_META[payment.status];
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
          <XCircle className="size-7" />
        </span>
        <p className="mt-4 text-lg font-semibold">Payment {meta.label.toLowerCase()}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{payment.rejectReason || "This order is no longer active. Start a new one to try again."}</p>
      </div>
    );
  }

  const d = method?.details ?? {};
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-muted-foreground">{what}</span>
          <Badge tone={isAuto ? "success" : "warning"}>{isAuto ? <><ShieldCheck className="size-3" /> Instant verification</> : <><Clock className="size-3" /> Manual review</>}</Badge>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">Send exactly</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular">{isPkr ? formatPkr(payment.amountPkr!) : `${usdtAmount} USDT`}</p>
            <p className="text-xs text-muted-foreground tabular">{isPkr ? `${formatUsd(payment.amountMicros)} at Rs ${payment.pkrRate}/USD` : `= ${formatUsd(payment.amountMicros, { precision: 2 })}`}</p>
          </div>
          <CopyButton value={isPkr ? String(payment.amountPkr) : usdtAmount} label="Amount" />
        </div>
        {payment.method === "usdt_bep20" && (
          <p className="mt-3 flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            The exact amount (including the last digits) identifies your order. If you withdraw from an exchange, make sure the <b>received</b> amount is {usdtAmount} USDT.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-border px-4">
          <DetailRow label="Method" value={method?.label} />
          {payment.method === "binance_pay" && (
            <>
              <DetailRow label="Pay ID" value={d.payId} mono />
              <DetailRow label="Name" value={d.name} />
            </>
          )}
          {payment.method === "usdt_bep20" && (
            <>
              <DetailRow label="Network" value={d.network || "BNB Smart Chain (BEP-20)"} />
              <DetailRow label="Address" value={d.address} mono />
            </>
          )}
          {(payment.method === "jazzcash" || payment.method === "easypaisa") && (
            <>
              <DetailRow label="Account title" value={d.accountTitle} />
              <DetailRow label="Account number" value={d.accountNumber} mono />
            </>
          )}
          {payment.method === "bank_transfer" && (
            <>
              <DetailRow label="Bank" value={d.bankName} />
              <DetailRow label="Account title" value={d.accountTitle} />
              <DetailRow label="Account number" value={d.accountNumber} mono />
              <DetailRow label="IBAN" value={d.iban} mono />
            </>
          )}
          {!Object.values(d).some(Boolean) && <p className="py-3 text-[13px] text-warning">Payment details haven't been configured yet. Please contact support.</p>}
        </div>
        {(method?.qrUrl || (payment.method === "usdt_bep20" && d.address)) && (
          <div className="flex items-center justify-center rounded-xl border border-border bg-white p-3">
            {method?.qrUrl ? <img src={method.qrUrl} alt="Payment QR code" className="size-32 object-contain" /> : <QRCodeSVG value={d.address!} size={128} />}
          </div>
        )}
      </div>

      {method?.instructions && <p className="text-[13px] leading-relaxed text-muted-foreground">{method.instructions}</p>}

      {payment.lastError && (
        <p className="flex gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {payment.lastError}
        </p>
      )}

      <div className="space-y-4 border-t border-border pt-5">
        <Field label={refMeta.label} hint={refMeta.hint}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={refMeta.placeholder} className="font-mono text-[13px]" />
        </Field>
        <Field label={<>Payment screenshot {isAuto && <span className="font-normal text-muted-foreground">(optional)</span>}</>}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-[13px]">
              <span className="truncate">{file.name}</span>
              <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground" aria-label="Remove">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong text-[13px] text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
            >
              <ImageUp className="size-5" />
              Upload receipt (PNG, JPG · max 10 MB)
            </button>
          )}
        </Field>
        {!isAuto && (
          <Field label={<>Note <span className="font-normal text-muted-foreground">(optional)</span></>}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sender name or anything that helps us match it" />
          </Field>
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <Button variant="primary" className="w-full" size="lg" loading={submitting} onClick={submit}>
          {isAuto ? "I've paid — verify now" : "Submit for review"}
        </Button>
        {payment.expiresAt && <p className="text-center text-xs text-subtle-foreground">This order expires {formatDateTime(payment.expiresAt)}</p>}
      </div>
    </div>
  );
}

export function PaymentTimeline({ payment }: { payment: Payment }) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {payment.history.map((h, i) => {
        const meta = STATUS_META[h.status as Payment["status"]] ?? { label: h.status, tone: "neutral" };
        const last = i === payment.history.length - 1;
        return (
          <li key={i} className="relative">
            <span className={cn("absolute -left-[25px] top-1 size-2.5 rounded-full ring-4 ring-card", last ? "bg-accent" : "bg-border-strong")} />
            <p className="text-[13px] font-medium">{meta.label}</p>
            {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
            <p className="mt-0.5 text-[11px] text-subtle-foreground">{formatDateTime(h.at)}</p>
          </li>
        );
      })}
    </ol>
  );
}
