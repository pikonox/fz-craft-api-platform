"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, CreditCard, Gift, Info, LifeBuoy, ShieldCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useNotifications } from "@/lib/queries";
import { cn, relativeTime } from "@/lib/utils";

export const NOTIFICATION_ICON: Record<string, typeof Bell> = {
  billing: CreditCard,
  usage: TrendingUp,
  security: ShieldCheck,
  referral: Gift,
  support: LifeBuoy,
  system: Info,
};

export function NotificationsBell() {
  const { data } = useNotifications();
  const qc = useQueryClient();
  const router = useRouter();
  const unread = data?.unread ?? 0;

  const markAll = async () => {
    await api("/api/notifications/read", { body: { all: true } });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notifications">
          <Bell />
          {unread > 0 && <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] max-w-[calc(100vw-24px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button onClick={markAll} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="scrollbar-thin max-h-[380px] overflow-y-auto">
          {!data?.notifications.length ? (
            <EmptyState icon={<Bell />} title="You're all caught up" description="Billing, usage and security alerts show up here." />
          ) : (
            data.notifications.map((n) => {
              const Icon = NOTIFICATION_ICON[n.type] ?? Info;
              return (
                <button
                  key={n.id}
                  onClick={async () => {
                    if (!n.readAt) {
                      await api("/api/notifications/read", { body: { ids: [n.id] } }).catch(() => {});
                      void qc.invalidateQueries({ queryKey: ["notifications"] });
                    }
                    if (n.link) router.push(n.link);
                  }}
                  className={cn("flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/60", !n.readAt && "bg-accent-soft/40")}
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-medium leading-snug">{n.title}</span>
                      {!n.readAt && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />}
                    </span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-subtle-foreground">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <Link href="/dashboard/notifications" className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-muted-foreground hover:text-foreground">
          View all
        </Link>
      </PopoverContent>
    </Popover>
  );
}
