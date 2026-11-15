"use client";

import * as React from "react";
import {
  ArrowDownLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Coins,
  Gift,
  ImageIcon,
  Info,
  Layers,
  type LucideIcon,
  RotateCcw,
  Smartphone,
  Sparkles,
  TriangleAlert,
  Undo2,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import type { BadgeTone } from "@/components/ui/primitives";
import type { Payment, PaymentMethodInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Uppercase table head cell classes, matching the Overview page. */
export const TH = "px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-subtle-foreground";

/** Section heading used between cards (same as "Activity" on Overview). */
export function SectionHeading({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const CALLOUT_TONES = {
  info: { box: "border-info/25 bg-info-soft", icon: "text-info", Icon: Info },
  accent: { box: "border-accent/25 bg-accent-soft", icon: "text-accent", Icon: Sparkles },
  warning: { box: "border-warning/30 bg-warning-soft", icon: "text-warning", Icon: TriangleAlert },
  danger: { box: "border-danger/30 bg-danger-soft", icon: "text-danger", Icon: CircleAlert },
  neutral: { box: "border-border bg-muted/50", icon: "text-muted-foreground", Icon: Info },
} as const;

/** Inline note with an icon. Body text stays in the normal ink colours for contrast. */
export function Callout({
  tone = "info",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = CALLOUT_TONES[tone];
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center", t.box, className)}>
      <div className="flex min-w-0 flex-1 gap-3">
        <span className={cn("mt-0.5 shrink-0 [&_svg]:size-4", t.icon)}>{icon ?? <t.Icon />}</span>
        <div className="min-w-0 text-[13px] leading-relaxed">
          {title && <p className="font-medium text-foreground">{title}</p>}
          {children && <div className="text-muted-foreground">{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 gap-2 pl-7 sm:pl-0">{action}</div>}
    </div>
  );
}

/** Small metric inside a hero card. */
export function MiniTile({ label, value, sub, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-border bg-card/70 px-4 py-3 backdrop-blur", className)}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-[15px] font-semibold tabular">{value}</p>
      {sub && <p className="truncate text-[11px] text-subtle-foreground">{sub}</p>}
    </div>
  );
}

/** Confirmation dialog with a single primary action. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  variant = "primary",
  loading,
  disabled,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  variant?: "primary" | "danger" | "accent";
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !loading && onOpenChange(o)}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant={variant} loading={loading} disabled={disabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/** Previous / next pager with a "1–10 of 42" summary. */
export function Pager({ page, limit, total, onPage, className }: { page: number; limit: number; total: number; onPage: (p: number) => void; className?: string }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-[13px] text-muted-foreground", className)}>
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="mr-1 hidden tabular sm:inline">
          Page {page} of {pages}
        </span>
        <Button size="icon-sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <Button size="icon-sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

// ── Transactions ───────────────────────────────────────
export type Transaction = {
  id: string;
  createdAt: string;
  wallet: "main" | "image";
  type: "deposit" | "plan_purchase" | "plan_refund" | "plan_credit" | "image_charge" | "referral_bonus" | "signup_bonus" | "admin_adjust";
  description: string;
  reference: string;
  method: string;
  amountMicros: number;
  tokens: number;
  status: "completed" | "pending" | "failed";
  paymentId: string | null;
};

export const TX_META: Record<Transaction["type"], { label: string; icon: LucideIcon }> = {
  deposit: { label: "Deposit", icon: ArrowDownLeft },
  plan_purchase: { label: "Plan", icon: Layers },
  plan_refund: { label: "Refund", icon: Undo2 },
  plan_credit: { label: "Plan credit", icon: RotateCcw },
  image_charge: { label: "Images", icon: ImageIcon },
  referral_bonus: { label: "Referral", icon: Gift },
  signup_bonus: { label: "Welcome bonus", icon: Sparkles },
  admin_adjust: { label: "Adjustment", icon: Wrench },
};

export const TX_STATUS_TONE: Record<Transaction["status"], BadgeTone> = { completed: "success", pending: "warning", failed: "danger" };

// ── User agent parsing (sessions) ──────────────────────
export type ParsedUA = { browser: string; os: string; device: "desktop" | "mobile" | "tablet" | "cli" };

export function parseUserAgent(ua: string): ParsedUA {
  const s = ua || "";
  if (!s) return { browser: "Unknown browser", os: "Unknown OS", device: "desktop" };
  const cli = /^(curl|wget|python-requests|python-httpx|axios|node-fetch|undici|PostmanRuntime|insomnia|Go-http-client|okhttp)/i.exec(s);
  if (cli) {
    const name = cli[1];
    const version = new RegExp(`${name}/([\\d.]+)`, "i").exec(s)?.[1];
    const pretty = { curl: "curl", wget: "Wget", postmanruntime: "Postman", "go-http-client": "Go HTTP client" }[name.toLowerCase()] ?? name;
    return { browser: version ? `${pretty} ${version.split(".").slice(0, 2).join(".")}` : pretty, os: "Command line", device: "cli" };
  }
  let browser = "Browser";
  const pick = (re: RegExp, name: string) => {
    const m = re.exec(s);
    if (m) {
      browser = `${name}${m[1] ? ` ${m[1].split(".")[0]}` : ""}`;
      return true;
    }
    return false;
  };
  // Order matters: Edge/Opera/Samsung also contain "Chrome"; Chrome contains "Safari".
  pick(/Edg(?:e|A|iOS)?\/([\d.]+)/, "Edge") ||
    pick(/(?:OPR|Opera)\/([\d.]+)/, "Opera") ||
    pick(/SamsungBrowser\/([\d.]+)/, "Samsung Internet") ||
    pick(/HeadlessChrome\/([\d.]+)/, "Headless Chrome") ||
    pick(/(?:Chrome|CriOS)\/([\d.]+)/, "Chrome") ||
    pick(/(?:Firefox|FxiOS)\/([\d.]+)/, "Firefox") ||
    pick(/Version\/([\d.]+).*Safari/, "Safari") ||
    pick(/Safari\/([\d.]+)/, "Safari");

  let os = "Unknown OS";
  if (/iPad/.test(s)) os = "iPadOS";
  else if (/iPhone|iPod/.test(s)) os = "iOS";
  else if (/Android/.test(s)) os = `Android${/Android ([\d]+)/.exec(s)?.[1] ? ` ${/Android ([\d]+)/.exec(s)![1]}` : ""}`;
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/Windows NT/.test(s)) os = "Windows";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Linux/.test(s)) os = "Linux";

  const device: ParsedUA["device"] = /iPad|Tablet/.test(s) ? "tablet" : /Mobi|iPhone|Android/.test(s) ? "mobile" : "desktop";
  return { browser, os, device };
}

/** Collapse IPv6 loopback / mapped IPv4 for display. */
export function prettyIp(ip: string) {
  if (!ip) return "Unknown IP";
  if (ip === "::1" || ip === "127.0.0.1") return "localhost";
  return ip.replace(/^::ffff:/, "");
}

// ── Payments ───────────────────────────────────────────
export const METHOD_ICON: Record<PaymentMethodInfo["method"], LucideIcon> = {
  binance_pay: Zap,
  usdt_bep20: Coins,
  jazzcash: Smartphone,
  easypaisa: Smartphone,
  bank_transfer: Building2,
};

export const PENDING_STATUSES: Payment["status"][] = ["awaiting_payment", "verifying", "pending_review"];

export function paymentTitle(p: Pick<Payment, "purpose" | "planName" | "cycle">) {
  if (p.purpose === "plan") return `${p.planName ?? "Plan"}${p.cycle === "daily" ? " pass" : p.cycle ? ` plan · ${p.cycle}` : " plan"}`;
  return p.purpose === "image_wallet" ? "Image credits" : "Balance top-up";
}

export const shortId = (id: string) => `#${id.slice(-6).toUpperCase()}`;
