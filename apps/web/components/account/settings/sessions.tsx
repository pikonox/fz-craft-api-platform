"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { describeAgent } from "./common";

type SessionRow = { id: string; userAgent: string; ip: string; lastSeenAt: string; createdAt: string; current: boolean };
const KEY = ["settings", "sessions"] as const;

export function SessionsCard() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: () => api<{ sessions: SessionRow[] }>("/api/me/sessions").then((r) => r.sessions) });
  const [busy, setBusy] = useState<string | null>(null);

  const others = (data ?? []).filter((s) => !s.current);
  // Current device first, then most recently active
  const rows = [...(data ?? [])].sort((a, b) => Number(b.current) - Number(a.current));

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await api(`/api/me/sessions/${id}`, { method: "DELETE" });
      qc.setQueryData<SessionRow[]>(KEY, (old) => old?.filter((s) => s.id !== id));
      toast.success("Signed out that device");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    setBusy("others");
    try {
      const r = await api<{ revoked: number }>("/api/me/sessions/revoke-others", { body: {} });
      qc.setQueryData<SessionRow[]>(KEY, (old) => old?.filter((s) => s.current));
      toast.success(r.revoked ? `Signed out ${r.revoked} other session${r.revoked === 1 ? "" : "s"}` : "No other sessions");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Active sessions"
        description="Devices signed in to your account. Sign out any you don't recognise, then change your password."
        action={
          others.length > 0 && (
            <Button variant="outline" size="sm" onClick={revokeOthers} disabled={busy === "others"}>
              <LogOut /> <span className="hidden sm:inline">Sign out all others</span>
              <span className="sm:hidden">Others</span>
            </Button>
          )
        }
      />
      {isLoading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Couldn't load your sessions"
          action={
            <Button size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No active sessions" />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((s) => {
            const a = describeAgent(s.userAgent);
            const Icon = a.mobile ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-medium">
                    {a.browser}
                    {a.os ? ` on ${a.os}` : ""}
                    {s.current && <Badge tone="success">This device</Badge>}
                  </p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground" title={`Signed in ${formatDateTime(s.createdAt)}`}>
                    {s.ip || "Unknown IP"} · {s.current ? "Active now" : `Last active ${relativeTime(s.lastSeenAt)}`}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" onClick={() => revoke(s.id)} disabled={busy === s.id}>
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
