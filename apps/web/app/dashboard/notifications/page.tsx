"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Bell, BellOff, Check, CheckCheck, Info, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { Tooltip } from "@/components/ui/overlay";
import { NOTIFICATION_ICON } from "@/components/dashboard/notifications-bell";
import { api, errorMessage } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { cn, formatDate, relativeTime } from "@/lib/utils";

type Filter = "all" | "unread" | "billing" | "usage" | "security" | "referral" | "support" | "system";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "billing", label: "Billing" },
  { value: "usage", label: "Usage" },
  { value: "security", label: "Security" },
  { value: "referral", label: "Rewards" },
  { value: "support", label: "Support" },
  { value: "system", label: "Product" },
];

function dayLabel(d: string) {
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(date);
  that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return formatDate(date);
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const qc = useQueryClient();
  const router = useRouter();
  const query = filter === "all" ? "" : filter === "unread" ? "&unread=1" : `&type=${filter}`;
  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "page", filter],
    queryFn: () => api<{ unread: number; notifications: Notification[] }>(`/api/notifications?limit=100${query}`),
    refetchInterval: 45_000,
  });
  const [busyAll, setBusyAll] = useState(false);
  const unread = data?.unread ?? 0;
  const list = data?.notifications ?? [];

  const groups = useMemo(() => {
    const out: { label: string; items: Notification[] }[] = [];
    for (const n of list) {
      const label = dayLabel(n.createdAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [list]);

  // Invalidating the "notifications" prefix also refreshes the bell in the top bar
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const markAll = async () => {
    setBusyAll(true);
    try {
      await api("/api/notifications/read", { body: { all: true } });
      toast.success("All caught up");
      await invalidate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyAll(false);
    }
  };

  const markRead = async (n: Notification) => {
    if (n.readAt) return;
    await api("/api/notifications/read", { body: { ids: [n.id] } }).catch(() => {});
    void invalidate();
  };

  const remove = async (n: Notification) => {
    // Optimistically drop it from the current list
    qc.setQueryData<{ unread: number; notifications: Notification[] }>(["notifications", "page", filter], (old) =>
      old ? { unread: old.unread - (n.readAt ? 0 : 1), notifications: old.notifications.filter((x) => x.id !== n.id) } : old,
    );
    try {
      await api(`/api/notifications/${n.id}`, { method: "DELETE" });
      toast.success("Notification deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    }
    void invalidate();
  };

  const open = async (n: Notification) => {
    await markRead(n);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Billing, usage, security and support updates for your account."
        actions={
          <>
            <Button variant="ghost" onClick={() => router.push("/dashboard/settings?tab=notifications")}>
              <Settings /> Preferences
            </Button>
            <Button variant="outline" onClick={markAll} loading={busyAll} disabled={!unread}>
              <CheckCheck /> Mark all read
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={filter} onChange={setFilter} options={FILTERS.map((f) => (f.value === "unread" ? { ...f, count: unread } : f))} />
        {data && (
          <p className="text-[13px] text-muted-foreground tabular">
            {unread ? `${unread} unread` : "No unread notifications"}
          </p>
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-5 py-4">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : !list.length ? (
          <EmptyState
            icon={filter === "unread" ? <Check /> : <BellOff />}
            title={filter === "unread" ? "You're all caught up" : filter === "all" ? "No notifications yet" : "Nothing in this category"}
            description={filter === "all" ? "Payment confirmations, usage alerts and security notices will show up here." : "Try another filter to see older updates."}
          />
        ) : (
          groups.map((g) => (
            <section key={g.label}>
              <h2 className="border-b border-border bg-muted/40 px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground [section+section_&]:border-t">{g.label}</h2>
              <ul className="divide-y divide-border">
                {g.items.map((n) => {
                  const Icon = NOTIFICATION_ICON[n.type] ?? Info;
                  const isUnread = !n.readAt;
                  return (
                    <li key={n.id} className={cn("group relative flex gap-3.5 px-5 py-4 transition-colors hover:bg-muted/40", isUnread && "bg-accent-soft/30")}>
                      {isUnread && <span className="absolute left-0 top-4 h-9 w-[3px] rounded-r-full bg-accent" />}
                      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", isUnread ? "bg-accent-soft text-accent" : "bg-muted text-muted-foreground")}>
                        <Icon className="size-4" />
                      </span>
                      <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className={cn("text-[13.5px] leading-snug", isUnread ? "font-semibold" : "font-medium")}>{n.title}</span>
                          <span className="text-[11px] text-subtle-foreground">{relativeTime(n.createdAt)}</span>
                        </span>
                        {n.body && <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{n.body}</span>}
                        {n.link && (
                          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
                            Open <ArrowUpRight className="size-3" />
                          </span>
                        )}
                      </button>
                      <div className="flex shrink-0 items-start gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                        {isUnread && (
                          <Tooltip content="Mark as read">
                            <Button size="icon-xs" variant="ghost" onClick={() => markRead(n)} aria-label="Mark as read">
                              <Check />
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip content="Delete">
                          <Button size="icon-xs" variant="ghost" className="hover:text-danger" onClick={() => remove(n)} aria-label="Delete notification">
                            <Trash2 />
                          </Button>
                        </Tooltip>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </Card>
      {list.length >= 100 && <p className="text-center text-xs text-subtle-foreground">Showing the latest 100. Older notifications are removed after 6 months.</p>}
      <p className="flex items-center justify-center gap-1.5 text-xs text-subtle-foreground">
        <Bell className="size-3.5" /> Email and Telegram delivery can be changed in notification preferences.
      </p>
    </div>
  );
}
