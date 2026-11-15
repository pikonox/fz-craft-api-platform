"use client";

import { Suspense, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, Inbox } from "lucide-react";
import { formatPkr, formatUsd } from "@nova/shared";
import { Card, CopyButton, EmptyState, NativeSelect, PageHeader } from "@/components/ui/primitives";
import { UnderlineTabs } from "@/components/ui/controls";
import { PaymentDialog, purposeLabel, submittedAt } from "@/components/admin/payment-dialog";
import { METHOD_OPTIONS, Pagination, PaymentStatusBadge, TD, Table, TableSkeleton, useUrlParams } from "@/components/admin/ui";
import type { AdminPayment, AdminPaymentsResponse, PaymentStatus } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

type Tab = "pending_review" | "verifying" | "awaiting_payment" | "approved" | "rejected" | "all";
const TABS: { value: Tab; label: string }[] = [
  { value: "pending_review", label: "Pending review" },
  { value: "verifying", label: "Verifying" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];
const LIMIT = 30;

export default function PaymentsPage() {
  return (
    <Suspense>
      <Payments />
    </Suspense>
  );
}

function Payments() {
  const [sp, setParams] = useUrlParams();
  const status = (TABS.find((t) => t.value === sp.get("status"))?.value ?? "pending_review") as Tab;
  const method = sp.get("method") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const openId = sp.get("id");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", status, method, page],
    queryFn: () => api<AdminPaymentsResponse>(`/api/admin/payments?status=${status}&page=${page}&limit=${LIMIT}${method ? `&method=${method}` : ""}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const counts = useMemo(() => data?.counts ?? {}, [data]);
  const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
  const rows = data?.payments ?? [];
  const current = rows.find((p) => p.id === openId);
  const idx = current ? rows.indexOf(current) : -1;
  const next = idx >= 0 ? rows[idx + 1] : undefined;

  const tabOptions = useMemo(() => TABS.map((t) => ({ ...t, count: t.value === "all" ? total : (counts[t.value as PaymentStatus] ?? 0) })), [counts, total]);

  const open = (id: string | null) => setParams({ id });

  return (
    <div>
      <PageHeader title="Payments" description="Review manual transfers (JazzCash, Easypaisa, bank) and audit automatic crypto payments. Approving credits the user immediately." />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <UnderlineTabs value={status} onChange={(v) => setParams({ status: v === "pending_review" ? null : v, page: null })} options={tabOptions} className="min-w-0 flex-1 md:mr-4" />
        <div className="w-full md:w-48">
          <NativeSelect value={method} onChange={(e) => setParams({ method: e.target.value, page: null })} aria-label="Filter by method" className="h-9">
            <option value="">All methods</option>
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !rows.length ? (
          <EmptyState
            icon={<Inbox />}
            title={status === "pending_review" ? "Nothing to review" : "No payments here"}
            description={status === "pending_review" ? "New manual payments show up here as soon as users submit their receipt." : "Try another status or method filter."}
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table head={["User", "Amount", "Method", "Purpose", "Reference", "Submitted", "Status", <th key="x" className="w-8" />]} minWidth={940}>
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => open(p.id)} className={cn("cursor-pointer border-t border-border transition-colors hover:bg-muted/40", p.id === openId && "bg-muted/40")}>
                    <td className={TD}>
                      <p className="max-w-[220px] truncate font-medium">{p.user.email || "—"}</p>
                      {p.user.name && <p className="max-w-[220px] truncate text-xs text-muted-foreground">{p.user.name}</p>}
                    </td>
                    <td className={cn(TD, "tabular")}>
                      <p className="font-semibold">{formatUsd(p.amountMicros)}</p>
                      {p.amountPkr != null && <p className="text-xs text-muted-foreground">{formatPkr(p.amountPkr)}</p>}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap")}>{p.methodLabel}</td>
                    <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{purposeLabel(p)}</td>
                    <td className={TD} onClick={(e) => e.stopPropagation()}>
                      {p.reference ? (
                        <span className="inline-flex items-center gap-0.5">
                          <code className="max-w-[150px] truncate font-mono text-xs" title={p.reference}>
                            {p.reference}
                          </code>
                          <CopyButton value={p.reference} label="Reference" size="xs" />
                        </span>
                      ) : (
                        <span className="text-subtle-foreground">—</span>
                      )}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-muted-foreground")} title={formatDateTime(submittedAt(p))}>
                      {relativeTime(submittedAt(p))}
                    </td>
                    <td className={TD}>
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className={cn(TD, "text-subtle-foreground")}>
                      <ChevronRight className="size-4" />
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
            {/* Mobile */}
            <ul className="divide-y divide-border md:hidden">
              {rows.map((p) => (
                <MobileRow key={p.id} p={p} onOpen={() => open(p.id)} />
              ))}
            </ul>
          </>
        )}
        {data && <Pagination page={page} total={data.total} limit={LIMIT} onPage={(p) => setParams({ page: p === 1 ? null : p })} />}
      </Card>

      <PaymentDialog id={openId} initial={current} onClose={() => open(null)} onNext={next ? () => open(next.id) : undefined} />
    </div>
  );
}

function MobileRow({ p, onOpen }: { p: AdminPayment; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-[13.5px] font-medium">{p.user.email || "—"}</p>
            <p className="shrink-0 text-[13.5px] font-semibold tabular">{formatUsd(p.amountMicros)}</p>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {p.methodLabel} · {purposeLabel(p)}
            </span>
            {p.amountPkr != null && <span className="shrink-0 tabular">{formatPkr(p.amountPkr)}</span>}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <PaymentStatusBadge status={p.status} />
            <span className="text-xs text-subtle-foreground">{relativeTime(submittedAt(p))}</span>
          </div>
        </div>
      </button>
    </li>
  );
}
