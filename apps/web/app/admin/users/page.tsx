"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, Users } from "lucide-react";
import { formatTokens, formatUsd } from "@nova/shared";
import { Avatar, Badge, Card, EmptyState, PageHeader, Progress } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { Pagination, SearchInput, TD, Table, TableSkeleton, useDebounced, useUrlParams } from "@/components/admin/ui";
import type { AdminUserRow, AdminUsersResponse } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn, formatDate, relativeTime } from "@/lib/utils";

const LIMIT = 25;

export default function UsersPage() {
  return (
    <Suspense>
      <UsersList />
    </Suspense>
  );
}

function UsersList() {
  const router = useRouter();
  const [sp, setParams] = useUrlParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q.trim(), 300);
  const filter = sp.get("status") === "banned" ? "banned" : "all";
  const page = Math.max(1, Number(sp.get("page")) || 1);

  // Mirror the debounced search into the URL (and reset paging)
  useEffect(() => {
    if ((sp.get("q") ?? "") !== dq) setParams({ q: dq, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "users", dq, filter, page],
    queryFn: () => api<AdminUsersResponse>(`/api/admin/users?page=${page}&limit=${LIMIT}${dq ? `&q=${encodeURIComponent(dq)}` : ""}${filter === "banned" ? "&status=banned" : ""}`),
    placeholderData: keepPreviousData,
  });
  const rows = data?.users ?? [];

  return (
    <div>
      <PageHeader title="Users" description="Search accounts, check plans and balances, and open a user to manage keys, credit or bans." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search email, name, referral code or ID" className="w-full sm:max-w-sm" />
        <Segmented
          value={filter}
          onChange={(v) => setParams({ status: v === "banned" ? "banned" : null, page: null })}
          options={[
            { value: "all", label: "All users" },
            { value: "banned", label: "Banned" },
          ]}
        />
      </div>

      <Card className={cn("overflow-hidden transition-opacity", isFetching && !isLoading && "opacity-80")}>
        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : !rows.length ? (
          <EmptyState icon={<Users />} title={dq ? "No users match your search" : filter === "banned" ? "No banned users" : "No users yet"} description={dq ? "Try an email, a name, a referral code or a user ID." : undefined} />
        ) : (
          <Table head={["User", "Plan & tokens", "Balance", "Image wallet", "Bonus tokens", "Joined", "Last login", <th key="x" className="w-8" />]} minWidth={980}>
            {rows.map((u) => (
              <UserRow key={u.id} u={u} onOpen={() => router.push(`/admin/users/${u.id}`)} />
            ))}
          </Table>
        )}
        {data && <Pagination page={page} total={data.total} limit={LIMIT} onPage={(p) => setParams({ page: p === 1 ? null : p })} />}
      </Card>
    </div>
  );
}

function UserRow({ u, onOpen }: { u: AdminUserRow; onOpen: () => void }) {
  const pct = u.tokensLimit ? (u.tokensUsed / u.tokensLimit) * 100 : 0;
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40">
      <td className={TD}>
        <div className="flex items-center gap-3">
          <Avatar name={u.name} email={u.email} className="size-8" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5">
              <span className="max-w-[220px] truncate font-medium">{u.email}</span>
              {u.role === "admin" && <Badge tone="accent">Admin</Badge>}
              {u.status === "banned" && <Badge tone="danger">Banned</Badge>}
            </p>
            <p className="max-w-[260px] truncate text-xs text-muted-foreground">
              {u.name || "No name"}
              {!u.emailVerified && " · unverified"}
            </p>
          </div>
        </div>
      </td>
      <td className={cn(TD, "w-[190px]")}>
        <p className="font-medium">{u.plan}</p>
        {u.tokensLimit > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <Progress value={pct} className="w-20" tone={pct > 90 ? "danger" : pct > 75 ? "warning" : "accent"} />
            <span className="text-[11px] text-muted-foreground tabular">
              {formatTokens(u.tokensUsed)}/{formatTokens(u.tokensLimit)}
            </span>
          </div>
        )}
      </td>
      <td className={cn(TD, "tabular")}>{formatUsd(u.mainBalance)}</td>
      <td className={cn(TD, "tabular text-muted-foreground")}>{formatUsd(u.imageBalance)}</td>
      <td className={cn(TD, "tabular text-muted-foreground")}>{u.bonusTokens ? formatTokens(u.bonusTokens) : "—"}</td>
      <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{formatDate(u.createdAt)}</td>
      <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{relativeTime(u.lastLoginAt)}</td>
      <td className={cn(TD, "text-subtle-foreground")}>
        <ChevronRight className="size-4" />
      </td>
    </tr>
  );
}
