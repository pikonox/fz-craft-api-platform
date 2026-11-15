"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, Filter, ScrollText, X } from "lucide-react";
import { formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, NativeSelect, PageHeader } from "@/components/ui/primitives";
import { Segmented, Switch } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/overlay";
import { KV, Pagination, TD, Table, TableSkeleton, useUrlParams } from "@/components/admin/ui";
import { qk, useAdminModels } from "@/components/admin/queries";
import type { AdminLog, AdminLogsResponse } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

type StatusFilter = "all" | "success" | "error";
const LIMIT = 50;

const ENDPOINT_LABEL: Record<string, string> = { chat: "chat", messages: "messages", embeddings: "embeddings", images: "images", image_edits: "image edits" };

const latency = (ms: number) => (!ms ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)}s` : `${Math.round(ms)}ms`);

function usageLabel(l: AdminLog) {
  if (l.images) return `${l.images} image${l.images > 1 ? "s" : ""}`;
  if (l.billedTokens) return `${formatTokens(l.billedTokens)} tok`;
  return "—";
}

export default function LogsPage() {
  return (
    <Suspense>
      <Logs />
    </Suspense>
  );
}

function Logs() {
  const [sp, setParams] = useUrlParams();
  const status = (["success", "error"].includes(sp.get("status") ?? "") ? sp.get("status") : "all") as StatusFilter;
  const model = sp.get("model") ?? "";
  const userId = sp.get("userId") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [live, setLive] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: models } = useAdminModels();

  const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (status !== "all") qs.set("status", status);
  if (model) qs.set("model", model);
  if (userId) qs.set("userId", userId);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: [...qk.logs, status, model, userId, page],
    queryFn: () => api<AdminLogsResponse>(`/api/admin/logs?${qs.toString()}`),
    placeholderData: keepPreviousData,
    refetchInterval: live && page === 1 ? 10_000 : false,
  });
  const rows = data?.logs ?? [];
  const open = rows.find((l) => l.id === openId) ?? null;
  const userEmail = useMemo(() => rows.find((l) => l.userId === userId)?.user, [rows, userId]);

  const modelOptions = useMemo(() => {
    const ids = new Set((models ?? []).map((m) => m.publicId));
    if (model && !ids.has(model)) ids.add(model); // keep a filter from the URL selectable
    return [...ids].sort();
  }, [models, model]);

  const filtered = status !== "all" || !!model || !!userId;

  return (
    <div>
      <PageHeader
        title="Request logs"
        description="Every API, Playground and Image Studio request across all users (kept for 90 days). Cost is shown at the model's list price."
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
            <Switch checked={live} onCheckedChange={setLive} />
            Auto-refresh
          </label>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={status}
            onChange={(v) => setParams({ status: v === "all" ? null : v, page: null })}
            options={[
              { value: "all", label: "All" },
              { value: "success", label: "Success" },
              { value: "error", label: "Errors" },
            ]}
          />
          {userId && (
            <span className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-border bg-card pl-2.5 pr-1 text-[12.5px]">
              <Filter className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">User: {userEmail || `…${userId.slice(-6)}`}</span>
              <button type="button" onClick={() => setParams({ userId: null, page: null })} className="rounded p-1 text-subtle-foreground hover:bg-muted hover:text-foreground" aria-label="Clear user filter">
                <X className="size-3.5" />
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-full md:w-60">
            <NativeSelect value={model} onChange={(e) => setParams({ model: e.target.value, page: null })} aria-label="Filter by model" className="h-9">
              <option value="">All models</option>
              {modelOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </NativeSelect>
          </div>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => setParams({ status: null, model: null, userId: null, page: null })}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <Card className={cn("overflow-hidden transition-opacity", isFetching && !isLoading && "opacity-90")}>
        {isLoading ? (
          <TableSkeleton rows={10} cols={7} />
        ) : isError && !data ? (
          <EmptyState
            icon={<ScrollText />}
            title="Couldn't load logs"
            description="Check that the API is running, then try again."
            action={
              <Button size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : !rows.length ? (
          <EmptyState icon={<ScrollText />} title={filtered ? "No requests match these filters" : "No requests yet"} description={filtered ? "Try another status, model or user." : "Requests appear here as soon as anyone calls the API."} />
        ) : (
          <Table head={["Time", "User", "Model", "Endpoint", "Source", "Status", "Usage", "Latency", "Cost", <th key="x" className="w-8" />]} minWidth={1080}>
            {rows.map((l) => (
              <tr key={l.id} onClick={() => setOpenId(l.id)} className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40">
                <td className={cn(TD, "whitespace-nowrap text-muted-foreground")} title={formatDateTime(l.createdAt)}>
                  {relativeTime(l.createdAt)}
                </td>
                <td className={TD}>
                  {l.user ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setParams({ userId: l.userId, page: null });
                      }}
                      className="max-w-[200px] truncate text-left hover:text-accent hover:underline"
                      title="Show only this user's requests"
                    >
                      {l.user}
                    </button>
                  ) : (
                    <span className="text-subtle-foreground">Deleted user</span>
                  )}
                </td>
                <td className={TD}>
                  <p className="max-w-[200px] truncate font-medium">{l.model}</p>
                  {l.provider && (
                    <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {l.provider}
                      {l.upstreamModel && l.upstreamModel !== l.model ? ` · ${l.upstreamModel}` : ""}
                    </p>
                  )}
                </td>
                <td className={cn(TD, "whitespace-nowrap font-mono text-xs text-muted-foreground")}>{ENDPOINT_LABEL[l.endpoint] ?? l.endpoint}</td>
                <td className={TD}>
                  <Badge tone="outline">{l.source}</Badge>
                </td>
                <td className={TD}>
                  <StatusBadge l={l} />
                </td>
                <td className={cn(TD, "whitespace-nowrap tabular")}>{usageLabel(l)}</td>
                <td className={cn(TD, "whitespace-nowrap tabular text-muted-foreground")}>{latency(l.latencyMs)}</td>
                <td className={cn(TD, "whitespace-nowrap tabular")}>{l.costMicros ? formatUsd(l.costMicros) : "—"}</td>
                <td className={cn(TD, "text-subtle-foreground")}>
                  <ChevronRight className="size-4" />
                </td>
              </tr>
            ))}
          </Table>
        )}
        {data && <Pagination page={page} total={data.total} limit={LIMIT} onPage={(p) => setParams({ page: p === 1 ? null : p })} />}
      </Card>

      <LogDialog
        log={open}
        onClose={() => setOpenId(null)}
        onFilterUser={(id) => {
          setOpenId(null);
          setParams({ userId: id, page: null });
        }}
      />
    </div>
  );
}

function StatusBadge({ l }: { l: AdminLog }) {
  const ok = l.status === "success";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Badge tone={ok ? "success" : "danger"} dot>
        {l.httpStatus || (ok ? 200 : "error")}
      </Badge>
      {l.attempts > 1 && <span className="text-[11px] text-warning">{l.attempts} tries</span>}
    </span>
  );
}

function LogDialog({ log, onClose, onFilterUser }: { log: AdminLog | null; onClose: () => void; onFilterUser: (userId: string) => void }) {
  return (
    <Dialog
      open={!!log}
      onOpenChange={(o) => !o && onClose()}
      title="Request details"
      description={log ? formatDateTime(log.createdAt) : undefined}
      footer={
        log && (
          <>
            {log.user && (
              <Button variant="ghost" size="sm" onClick={() => onFilterUser(log.userId)}>
                <Filter /> Only this user
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/users/${log.userId}`}>
                Open user <ExternalLink />
              </Link>
            </Button>
          </>
        )
      }
    >
      {log && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge l={log} />
            <Badge tone="outline">{log.source}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{ENDPOINT_LABEL[log.endpoint] ?? log.endpoint}</span>
          </div>
          {log.status === "error" && log.errorMessage && <p className="mb-4 whitespace-pre-wrap break-words rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{log.errorMessage}</p>}
          <KV label="User">{log.user || "Deleted user"}</KV>
          <KV label="Model">{log.model}</KV>
          <KV label="Provider">{log.provider || "—"}</KV>
          <KV label="Upstream model">{log.upstreamModel || "—"}</KV>
          <KV label="HTTP status">{log.httpStatus || "—"}</KV>
          <KV label="Attempts">{log.attempts || 1}</KV>
          <KV label="Billed tokens">{log.billedTokens ? log.billedTokens.toLocaleString("en-US") : "—"}</KV>
          {log.images > 0 && <KV label="Images">{log.images}</KV>}
          <KV label="Latency">{latency(log.latencyMs)}</KV>
          <KV label="Cost at model price">{formatUsd(log.costMicros ?? 0)}</KV>
          <KV label="Request ID">
            <span className="font-mono text-xs">{log.id}</span>
          </KV>
        </div>
      )}
    </Dialog>
  );
}
