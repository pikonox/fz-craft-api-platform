"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Building2, Coins, CreditCard, ImageUp, RotateCcw, Save, Settings2, ShieldCheck, Smartphone, UserCheck, Zap, type LucideIcon } from "lucide-react";
import { formatPkr } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/controls";
import { qk, useAdminMethods, useAdminSettings } from "@/components/admin/queries";
import { num, useAction } from "@/components/admin/ui";
import type { AdminPaymentMethod, MethodDetails, PaymentMethodId } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type DetailKey = keyof MethodDetails;
type DetailField = { key: DetailKey; label: string; placeholder?: string; mono?: boolean; wide?: boolean; optional?: boolean; hint?: string };

/** The details each method shows at checkout (same fields as components/billing/payment-panel.tsx). */
const METHOD_META: Record<PaymentMethodId, { icon: LucideIcon; auto: boolean; fields: DetailField[]; qrHint: string }> = {
  binance_pay: {
    icon: Zap,
    auto: true,
    fields: [
      {
        key: "payId",
        label: "Binance Pay ID",
        placeholder: "e.g. 123456789",
        mono: true,
        wide: true,
        hint: "Orders are verified with the Binance API key in the server .env, so use the Pay ID of that same Binance account.",
      },
      { key: "name", label: "Account name", placeholder: "Name shown in Binance", optional: true },
    ],
    qrHint: "Optional. Your Binance Pay QR from the Binance app (Pay → Receive).",
  },
  usdt_bep20: {
    icon: Coins,
    auto: true,
    fields: [
      {
        key: "address",
        label: "Wallet address",
        placeholder: "0x…",
        mono: true,
        wide: true,
        optional: true,
        hint: "Transfers to this address are verified automatically on BNB Smart Chain. Leave empty to use USDT_BEP20_ADDRESS from the server .env.",
      },
      { key: "network", label: "Network label", placeholder: "BNB Smart Chain (BEP-20)", optional: true },
    ],
    qrHint: "Optional. Without an upload, checkout shows a QR code of the wallet address.",
  },
  jazzcash: {
    icon: Smartphone,
    auto: false,
    fields: [
      { key: "accountTitle", label: "Account title", placeholder: "Name on the account" },
      { key: "accountNumber", label: "Account number", placeholder: "03xx xxxxxxx", mono: true },
    ],
    qrHint: "Optional. A JazzCash Raast or merchant QR.",
  },
  easypaisa: {
    icon: Smartphone,
    auto: false,
    fields: [
      { key: "accountTitle", label: "Account title", placeholder: "Name on the account" },
      { key: "accountNumber", label: "Account number", placeholder: "03xx xxxxxxx", mono: true },
    ],
    qrHint: "Optional. An Easypaisa Raast or merchant QR.",
  },
  bank_transfer: {
    icon: Building2,
    auto: false,
    fields: [
      { key: "bankName", label: "Bank", placeholder: "e.g. Meezan Bank" },
      { key: "accountTitle", label: "Account title", placeholder: "Name on the account" },
      { key: "accountNumber", label: "Account number", placeholder: "Account number", mono: true },
      { key: "iban", label: "IBAN", placeholder: "PK00 XXXX 0000 0000 0000 0000", mono: true, wide: true, optional: true },
    ],
    qrHint: "Optional. A Raast QR for the account.",
  },
};

const BSC_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_QR_BYTES = 10 * 1024 * 1024;

type Form = { label: string; instructions: string; minUsd: string; sort: string; details: MethodDetails };

function toForm(m: AdminPaymentMethod): Form {
  const details: MethodDetails = {};
  for (const f of METHOD_META[m.method]?.fields ?? []) details[f.key] = m.details?.[f.key] ?? "";
  return { label: m.label ?? "", instructions: m.instructions ?? "", minUsd: String(m.minUsd ?? 0), sort: String(m.sort ?? 100), details };
}

export default function PaymentMethodsPage() {
  const { data: methods, isLoading, error } = useAdminMethods();
  const { data: settings } = useAdminSettings();
  const pkrPerUsd = settings?.settings.pkrPerUsd;
  const sorted = useMemo(() => [...(methods ?? [])].sort((a, b) => a.sort - b.sort), [methods]);
  const enabled = sorted.filter((m) => m.enabled).length;

  return (
    <div>
      <PageHeader
        title="Payment methods"
        description="What customers see at checkout. Binance Pay and USDT are verified automatically; JazzCash, Easypaisa and bank transfers wait for your approval in Payments."
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/settings">
              <Settings2 /> PKR rate{pkrPerUsd ? `: Rs ${pkrPerUsd.toLocaleString("en-US")} / $1` : ""}
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[420px] w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <EmptyState icon={<CreditCard />} title="Couldn't load payment methods" description={error.message} />
        </Card>
      ) : !sorted.length ? (
        <Card>
          <EmptyState icon={<CreditCard />} title="No payment methods yet" description="Run the seed (pnpm seed) to create the five methods, then fill in your details here." />
        </Card>
      ) : (
        <>
          <p className="mb-4 text-[13px] text-muted-foreground">
            {enabled} of {sorted.length} methods are shown at checkout.
          </p>
          <div className="grid items-start gap-5 xl:grid-cols-2">
            {sorted.map((m) => (
              <MethodCard key={m.method} m={m} pkrPerUsd={pkrPerUsd} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MethodCard({ m, pkrPerUsd }: { m: AdminPaymentMethod; pkrPerUsd?: number }) {
  const meta = METHOD_META[m.method];
  const Icon = meta?.icon ?? CreditCard;
  const fields = meta?.fields ?? [];
  const initial = useMemo(() => toForm(m), [m]);
  const initialKey = JSON.stringify(initial);
  const [form, setForm] = useState<Form>(initial);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pick up fresh server values after a save (or another admin's change)
  useEffect(() => setForm(JSON.parse(initialKey) as Form), [initialKey]);

  const dirty = JSON.stringify(form) !== initialKey;
  const setDetail = (k: DetailKey, v: string) => setForm((f) => ({ ...f, details: { ...f.details, [k]: v } }));

  const minUsd = num(form.minUsd, Number.NaN);
  const sort = num(form.sort, Number.NaN);
  const address = (form.details.address ?? "").trim();
  const errors = {
    label: !form.label.trim() ? "Enter a name" : null,
    minUsd: !Number.isFinite(minUsd) || minUsd < 0 || minUsd > 10_000 ? "Enter an amount from 0 to 10,000" : null,
    address: m.method === "usdt_bep20" && address && !BSC_ADDRESS.test(address) ? "Enter a valid BSC address: 0x followed by 40 hex characters" : null,
    sort: !Number.isInteger(sort) ? "Enter a whole number" : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  // Saved details that checkout needs but are still empty
  const missing = fields.filter((f) => !f.optional && !(m.details?.[f.key] ?? "").trim());

  const toggle = useAction((enabled: boolean) => api(`/api/admin/payment-methods/${m.method}`, { method: "PATCH", body: { enabled } }), {
    success: (_r, v) => `${m.label} ${v ? "is now shown at checkout" : "is hidden from checkout"}`,
    invalidate: [qk.methods],
  });

  const save = useAction(
    () => {
      const details: MethodDetails = {};
      for (const f of fields) details[f.key] = (form.details[f.key] ?? "").trim();
      return api(`/api/admin/payment-methods/${m.method}`, {
        method: "PATCH",
        body: { label: form.label.trim(), instructions: form.instructions.trim(), minUsd, sort, details },
      });
    },
    { success: () => `${form.label.trim() || m.label} saved`, invalidate: [qk.methods] },
  );

  const uploadQr = useAction(
    (file: File) => {
      const fd = new FormData();
      fd.append("image", file);
      return api<{ qrUrl: string }>(`/api/admin/payment-methods/${m.method}/qr`, { form: fd });
    },
    { success: "QR code updated", invalidate: [qk.methods] },
  );

  const savedAddress = (m.details?.address ?? "").trim();

  return (
    <Card className={cn("overflow-hidden", !m.enabled && "opacity-85")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", meta?.auto ? "bg-accent-soft text-accent" : "bg-muted text-muted-foreground")}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">{m.label}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {meta?.auto ? (
                <Badge tone="success">
                  <ShieldCheck className="size-3" /> Auto-verified
                </Badge>
              ) : (
                <Badge tone="warning">
                  <UserCheck className="size-3" /> Manual review
                </Badge>
              )}
              <Badge tone="outline">{m.currency}</Badge>
              {m.enabled && missing.length > 0 && (
                <Badge tone="danger" dot>
                  Details missing
                </Badge>
              )}
            </div>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
          <span className="hidden sm:inline">{m.enabled ? "Enabled" : "Disabled"}</span>
          <Switch checked={m.enabled} onCheckedChange={(v) => toggle.mutate(v)} disabled={toggle.isPending} />
        </label>
      </div>

      {/* Form */}
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !invalid) save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
          <Field label="Name at checkout" error={errors.label}>
            <Input value={form.label} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} aria-invalid={!!errors.label} />
          </Field>
          <Field
            label="Minimum (USD)"
            error={errors.minUsd}
            hint={m.currency === "PKR" && pkrPerUsd && Number.isFinite(minUsd) ? `≈ ${formatPkr(Math.round(minUsd * pkrPerUsd))}` : undefined}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={10000}
              step="0.01"
              value={form.minUsd}
              onChange={(e) => setForm((f) => ({ ...f, minUsd: e.target.value }))}
              aria-invalid={!!errors.minUsd}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            const err = f.key === "address" ? errors.address : null;
            return (
              <Field key={f.key} label={f.label} error={err} hint={f.hint} className={cn(f.wide && "sm:col-span-2")}>
                <Input
                  value={form.details[f.key] ?? ""}
                  placeholder={f.placeholder}
                  maxLength={f.key === "accountNumber" || f.key === "iban" ? 60 : 100}
                  spellCheck={false}
                  autoComplete="off"
                  className={cn(f.mono && "font-mono text-[13px]")}
                  onChange={(e) => setDetail(f.key, e.target.value)}
                  aria-invalid={!!err}
                />
              </Field>
            );
          })}
        </div>

        <Field label="Instructions" hint={`Shown under the payment details · ${form.instructions.length}/2000`}>
          <Textarea rows={3} maxLength={2000} value={form.instructions} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} />
        </Field>

        {/* QR code (upload or replace; the API has no remove) */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center">
          <div className="flex size-28 shrink-0 items-center justify-center self-center overflow-hidden rounded-lg border border-border bg-white p-2 sm:self-auto">
            {m.qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.qrUrl} alt={`${m.label} QR code`} className="size-full object-contain" />
            ) : m.method === "usdt_bep20" && BSC_ADDRESS.test(savedAddress) ? (
              <QRCodeSVG value={savedAddress} size={96} />
            ) : (
              <span className="px-2 text-center text-[11px] leading-snug text-zinc-500">No QR code</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">QR code</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{meta?.qrHint} PNG, JPG, WEBP or GIF up to 10 MB.</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > MAX_QR_BYTES) {
                  toast.error("That image is larger than 10 MB");
                  return;
                }
                uploadQr.mutate(file);
              }}
            />
            <Button type="button" size="sm" variant="outline" className="mt-3" loading={uploadQr.isPending} onClick={() => fileRef.current?.click()}>
              {!uploadQr.isPending && <ImageUp />} {m.qrUrl ? "Replace QR" : "Upload QR"}
            </Button>
          </div>
        </div>

        <details className="text-[13px]">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Advanced</summary>
          <div className="mt-3 max-w-[220px]">
            <Field label="Order at checkout" error={errors.sort} hint="Lower numbers are shown first">
              <Input type="number" step={1} value={form.sort} onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))} aria-invalid={!!errors.sort} />
            </Field>
          </div>
        </details>

        {/* Footer */}
        <div className="-mx-5 -mb-5 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card/50 px-5 py-3">
          <span className={cn("text-xs", dirty ? "text-warning" : "text-subtle-foreground")}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={!dirty || save.isPending} onClick={() => setForm(initial)}>
              <RotateCcw /> Reset
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={!dirty || invalid} loading={save.isPending}>
              {!save.isPending && <Save />} Save
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
