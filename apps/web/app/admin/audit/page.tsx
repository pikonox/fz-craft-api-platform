"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, NativeSelect, PageHeader, type BadgeTone } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { JsonBlock, KV, Pagination, SearchInput, TD, Table, TableSkeleton, useUrlParams } from "@/components/admin/ui";
import { qk } from "@/components/admin/queries";
import type { AuditEntry } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

const PAGE_SIZE = 25;

const TARGET_LABEL: Record<string, string> = {
  user: "User",
  payment: "Payment",
  provider: "Provider",
  provider_key: "Provider key",
  model: "Model",
  plan: "Plan",
  payment_method: "Payment method",
  settings: "Settings",
  api_key: "API key",
};

const GROUP_LABEL: Record<string, string> = {
  user: "Users",
  payment: "Payments",
  provider: "Providers",
  provider_key: "Provider keys",
  model: "Models",
  plan: "Plans",
  payment_method: "Payment methods",
  settings: "Settings",
  key: "API keys",
};

/** Where an entry's target can be opened in the admin panel. */
function targetHref(e: AuditEntry): string | null {
  switch (e.targetType) {
    case "user":
      return `/admin/users/${e.targetId}`;
    case "payment":
      return `/admin/payments?status=all&id=${e.targetId}`;
    case "provider":
    case "provider_key":
      return "/admin/providers";
    case "model":
      return "/admin/models";
    case "plan":
      return "/admin/plans";
    case "payment_method":
      return "/admin/payment-methods";
    case "settings":
      return "/admin/settings";
    default:
      return null;
  }
}

function actionTone(action: string): BadgeTone {
  const verb = action.split(".").pop() ?? "";
  if (/delete|reject|revoke|ban/.test(verb)) return "danger";
  if (/create|approve|grant/.test(verb)) return "success";
  if (/adjust/.test(verb)) return "warning";
  return "info";
}

/** "amountUsd: 5 · wallet: main" — a one-line preview of the change. */
function metaPreview(meta: unknown): string {
  if (meta === null || meta === undefined) return "";
  if (typeof meta !== "object") return String(meta);
  return Object.entries(meta as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function AuditPage() {
  return (
    <Suspense>
      <Audit />
    </Suspense>
  );
}

function Audit() {
  const [sp, setParams] = useUrlParams();
  const group = sp.get("group") ?? "";
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: qk.audit,
    queryFn: () => api<{ entries: AuditEntry[] }>("/api/admin/audit").then((r) => r.entries),
    refetchInterval: 60_000,
  });
  const entries = useMemo(() => data ?? [], [data]);

  const groups = useMemo(() => [...new Set(entries.map((e) => e.action.split(".")[0]))].sort(), [entries]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter(
      (e) => (!group || e.action.split(".")[0] === group) && (!needle || [e.actor, e.action, e.targetType, e.targetId, metaPreview(e.meta)].some((s) => (s ?? "").toLowerCase().includes(needle))),
    );
  }, [entries, group, q]);

  // Back to the first page whenever the filters change
  useEffect(() => setPage(1), [group, q]);

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const open = entries.find((e) => e.id === openId) ?? null;

  return (
    <div>
      <PageHeader title="Audit log" description="Changes made by admins: payments, balances, plans, models, providers and settings. Shows the latest 200 actions." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search admin, action, target or details" className="w-full sm:max-w-sm" />
        <div className="w-full sm:w-52">
          <NativeSelect value={group} onChange={(e) => setParams({ group: e.target.value })} aria-label="Filter by area" className="h-9">
            <option value="">All areas</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g] ?? g}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : isError && !data ? (
          <EmptyState
            icon={<History />}
            title="Couldn't load the audit log"
            description="Check that the API is running, then try again."
            action={
              <Button size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : !rows.length ? (
          <EmptyState
            icon={<History />}
            title={q || group ? "Nothing matches these filters" : "No admin actions yet"}
            description={q || group ? "Try another search or area." : "Approvals, balance changes and catalog edits are recorded here."}
          />
        ) : (
          <Table head={["Time", "Admin", "Action", "Target", "Details", <th key="x" className="w-8" />]} minWidth={900}>
            {pageRows.map((e) => (
              <tr key={e.id} onClick={() => setOpenId(e.id)} className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40">
                <td className={cn(TD, "whitespace-nowrap text-muted-foreground")} title={formatDateTime(e.createdAt)}>
                  {relativeTime(e.createdAt)}
                </td>
                <td className={TD}>
                  <span className="block max-w-[200px] truncate">{e.actor || "Unknown"}</span>
                </td>
                <td className={TD}>
                  <Badge tone={actionTone(e.action)} className="font-mono">
                    {e.action}
                  </Badge>
                </td>
                <td className={TD}>
                  <p className="whitespace-nowrap">{TARGET_LABEL[e.targetType] ?? e.targetType}</p>
                  {e.targetId && e.targetId !== "-" && <p className="max-w-[160px] truncate font-mono text-[11px] text-muted-foreground">{e.targetId}</p>}
                </td>
                <td className={cn(TD, "text-muted-foreground")}>
                  <span className="block max-w-[340px] truncate font-mono text-xs">{metaPreview(e.meta) || "—"}</span>
                </td>
                <td className={cn(TD, "text-subtle-foreground")}>
                  <ChevronRight className="size-4" />
                </td>
              </tr>
            ))}
          </Table>
        )}
        {!!rows.length && <Pagination page={page} total={rows.length} limit={PAGE_SIZE} onPage={setPage} />}
      </Card>

      <Dialog
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title="Audit entry"
        description={open ? formatDateTime(open.createdAt) : undefined}
        footer={
          open &&
          targetHref(open) && (
            <Button variant="outline" size="sm" asChild>
              <Link href={targetHref(open)!}>
                Open {(TARGET_LABEL[open.targetType] ?? "target").toLowerCase()} <ExternalLink />
              </Link>
            </Button>
          )
        }
      >
        {open && (
          <div>
            <KV label="Action">
              <Badge tone={actionTone(open.action)} className="font-mono">
                {open.action}
              </Badge>
            </KV>
            <KV label="Admin">{open.actor || "Unknown"}</KV>
            <KV label="Target">{TARGET_LABEL[open.targetType] ?? open.targetType}</KV>
            {open.targetId && open.targetId !== "-" && (
              <KV label="Target ID">
                <span className="font-mono text-xs">{open.targetId}</span>
              </KV>
            )}
            {open.meta !== undefined && open.meta !== null && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">Details</p>
                <JsonBlock value={open.meta} className="max-h-80" />
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
