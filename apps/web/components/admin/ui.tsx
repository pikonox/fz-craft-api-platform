"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input, Skeleton, type BadgeTone } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { Switch } from "@/components/ui/controls";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "./types";

// ── Tables ──────────────────────────────────────────────
export const TH = "px-3 py-2.5 font-medium first:pl-5 last:pr-5";
export const TD = "px-3 py-3 first:pl-5 last:pr-5";

export function Table({ head, children, minWidth = 720, className }: { head: React.ReactNode[] | React.ReactNode; children: React.ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={cn("scrollbar-thin overflow-x-auto", className)}>
      <table className="w-full text-[13px]" style={{ minWidth }}>
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-subtle-foreground">
            {Array.isArray(head)
              ? head.map((h, i) =>
                  React.isValidElement(h) ? (
                    <React.Fragment key={i}>{h}</React.Fragment>
                  ) : (
                    <th key={i} className={TH}>
                      {h}
                    </th>
                  ),
                )
              : head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-40" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Pagination ──────────────────────────────────────────
export function Pagination({ page, total, limit, onPage, className }: { page: number; total: number; limit: number; onPage: (p: number) => void; className?: string }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit && page === 1) {
    return total ? <p className={cn("px-5 py-3 text-xs text-muted-foreground", className)}>{total.toLocaleString("en-US")} total</p> : null;
  }
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground", className)}>
      <span className="tabular">
        {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-xs" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon-xs" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

// ── Search ──────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 pl-9 pr-8" />
      {value && (
        <button type="button" onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-subtle-foreground hover:text-foreground" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ── URL state ───────────────────────────────────────────
/** Read/patch the query string without adding history entries. */
export function useUrlParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = React.useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );
  return [sp, set] as const;
}

// ── Mutations ───────────────────────────────────────────
/** useMutation + toast + query invalidation, the pattern every admin action follows. */
export function useAction<TVars = void, TRes = unknown>(
  fn: (vars: TVars) => Promise<TRes>,
  opts: { success?: string | ((res: TRes, vars: TVars) => string); invalidate?: QueryKey[]; onSuccess?: (res: TRes, vars: TVars) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation<TRes, Error, TVars>({
    mutationFn: fn,
    onSuccess: (res, vars) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(res, vars) : opts.success);
      for (const key of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: key });
      opts.onSuccess?.(res, vars);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
}

// ── Confirm ─────────────────────────────────────────────
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  danger = true,
  loading,
  disabled,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} disabled={disabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? <p className="text-sm text-muted-foreground">This can&apos;t be undone.</p>}
    </Dialog>
  );
}

// ── Small display helpers ───────────────────────────────
export function KV({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b border-border py-2.5 text-[13px] last:border-0", className)}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{children}</span>
    </div>
  );
}

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  if (value === undefined || value === null) return null;
  return <pre className={cn("scrollbar-thin max-h-56 overflow-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground", className)}>{JSON.stringify(value, null, 2)}</pre>;
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground", className)}>{children}</p>;
}

/** A labelled switch row for settings-style forms. */
export function ToggleRow({ label, description, checked, onChange, disabled, className }: { label: React.ReactNode; description?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  const id = React.useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[13px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}

// ── Payments ────────────────────────────────────────────
export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  awaiting_payment: { label: "Awaiting payment", tone: "neutral" },
  verifying: { label: "Verifying", tone: "info" },
  pending_review: { label: "Pending review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "outline" },
  cancelled: { label: "Cancelled", tone: "outline" },
};

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const m = PAYMENT_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <Badge tone={m.tone} dot className={className}>
      {m.label}
    </Badge>
  );
}

export const METHOD_OPTIONS = [
  { value: "binance_pay", label: "Binance Pay" },
  { value: "usdt_bep20", label: "USDT · BEP-20" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "bank_transfer", label: "Bank transfer" },
] as const;

export const ACCESS_TONE: Record<string, BadgeTone> = { free: "neutral", paid: "accent", early: "info" };

/** Parse a numeric form field ("" → fallback). */
export function num(v: string | number, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const t = v.trim();
  if (!t) return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
}

/** micros → editable USD string (no float noise). */
export function usdField(micros: number | undefined | null): string {
  if (!micros) return "0";
  return String(Number((micros / 1_000_000).toFixed(6)));
}
