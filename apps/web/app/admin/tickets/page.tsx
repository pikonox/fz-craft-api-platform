"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Inbox, MessageSquare, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, NativeSelect, PageHeader, Skeleton, Textarea, type BadgeTone } from "@/components/ui/primitives";
import { UnderlineTabs } from "@/components/ui/controls";
import { SearchInput, useAction, useUrlParams } from "@/components/admin/ui";
import { qk, useAdminStats } from "@/components/admin/queries";
import type { AdminTicket, TicketPriority, TicketStatus } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

type Filter = TicketStatus | "all";

const TABS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const STATUS_META: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "warning" },
  answered: { label: "Answered", tone: "info" },
  closed: { label: "Closed", tone: "outline" },
};

const PRIORITY_META: Record<TicketPriority, { label: string; tone: BadgeTone }> = {
  low: { label: "Low priority", tone: "outline" },
  normal: { label: "Normal", tone: "neutral" },
  high: { label: "High priority", tone: "danger" },
};

const CATEGORY_LABEL: Record<string, string> = { billing: "Billing", api: "API", account: "Account", bug: "Bug", other: "Other" };

/** Both panes share this height on desktop so the list and the thread scroll independently. */
const PANE_H = "lg:h-[calc(100dvh-270px)] lg:min-h-[480px]";

export default function TicketsPage() {
  return (
    <Suspense>
      <Tickets />
    </Suspense>
  );
}

function Tickets() {
  const [sp, setParams] = useUrlParams();
  const status = (TABS.find((t) => t.value === sp.get("status"))?.value ?? "open") as Filter;
  const openId = sp.get("id");
  const [q, setQ] = useState("");
  const { data: stats } = useAdminStats();

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: [...qk.tickets, "list", status],
    queryFn: () => api<{ tickets: AdminTicket[] }>(`/api/admin/tickets?status=${status}`).then((r) => r.tickets),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    if (!needle) return all;
    return all.filter((t) => [t.subject, t.user.email, String(t.number), t.category, t.lastMessage?.body ?? ""].some((s) => s.toLowerCase().includes(needle)));
  }, [data, q]);

  const tabOptions = useMemo(
    () => TABS.map((t) => ({ ...t, count: t.value === "open" ? stats?.openTickets : t.value === status ? data?.length : undefined })),
    [stats?.openTickets, status, data?.length],
  );

  const current = (data ?? []).find((t) => t.id === openId);

  return (
    <div>
      <PageHeader
        title="Support tickets"
        description="Reply to users, then set the status and priority. Each reply emails the user and sends a Telegram message if they've linked it."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching && !isLoading}>
            <RefreshCw /> Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <UnderlineTabs value={status} onChange={(v) => setParams({ status: v === "open" ? null : v })} options={tabOptions} className="min-w-0 flex-1 md:mr-4" />
        <SearchInput value={q} onChange={setQ} placeholder="Search subject, email or #number" className="w-full md:w-72" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,370px)_minmax(0,1fr)]">
        {/* List */}
        <Card className={cn("flex flex-col overflow-hidden", PANE_H, openId && "hidden lg:flex")}>
          {isLoading ? (
            <ListSkeleton />
          ) : isError && !data ? (
            <EmptyState
              icon={<Inbox />}
              title="Couldn't load tickets"
              description="Check that the API is running, then try again."
              action={
                <Button size="sm" onClick={() => refetch()}>
                  Try again
                </Button>
              }
            />
          ) : !rows.length ? (
            <EmptyState
              icon={<Inbox />}
              title={q ? "No tickets match your search" : status === "open" ? "Inbox zero" : "No tickets here"}
              description={q ? "Try a subject, an email or a ticket number." : status === "open" ? "New tickets from users show up here." : "Try another status."}
            />
          ) : (
            <ul className="scrollbar-thin min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {rows.map((t) => (
                <TicketRow key={t.id} t={t} active={t.id === openId} onOpen={() => setParams({ id: t.id })} />
              ))}
            </ul>
          )}
          {(data?.length ?? 0) >= 200 && <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">Showing the 200 most recently active tickets.</p>}
        </Card>

        {/* Thread */}
        <div className={cn("min-w-0", !openId && "hidden lg:block")}>
          {openId ? (
            <TicketThread key={openId} id={openId} initial={current} onBack={() => setParams({ id: null })} />
          ) : (
            <Card className={cn("flex items-center justify-center", PANE_H)}>
              <EmptyState icon={<MessageSquare />} title="Select a ticket" description="Pick a conversation on the left to read it and reply." />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketRow({ t, active, onOpen }: { t: AdminTicket; active: boolean; onOpen: () => void }) {
  const waiting = t.status !== "closed" && t.lastMessage?.from === "user";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn("w-full px-4 py-3.5 text-left transition-colors hover:bg-muted/40", active && "bg-muted/60 hover:bg-muted/60")}
        aria-current={active || undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[13.5px] font-medium">
            <span className="mr-1 text-subtle-foreground tabular">#{t.number}</span>
            {t.subject}
          </p>
          <span className="shrink-0 pt-0.5 text-[11.5px] text-subtle-foreground" title={formatDateTime(t.lastActivityAt)}>
            {relativeTime(t.lastActivityAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.user.email || "Unknown user"}</p>
        {t.lastMessage && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {t.lastMessage.from === "admin" && <span className="font-medium text-foreground/80">You: </span>}
            {t.lastMessage.body}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_META[t.status]?.tone ?? "neutral"} dot>
            {STATUS_META[t.status]?.label ?? t.status}
          </Badge>
          <Badge tone="outline">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
          {t.priority !== "normal" && PRIORITY_META[t.priority] && <Badge tone={PRIORITY_META[t.priority].tone}>{PRIORITY_META[t.priority].label}</Badge>}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-subtle-foreground tabular">
            {waiting && <span className="size-1.5 rounded-full bg-accent" title="Waiting for a reply" />}
            {t.messageCount} {t.messageCount === 1 ? "message" : "messages"}
          </span>
        </div>
      </button>
    </li>
  );
}

function TicketThread({ id, initial, onBack }: { id: string; initial?: AdminTicket; onBack: () => void }) {
  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: qk.ticket(id),
    queryFn: () => api<{ ticket: AdminTicket }>(`/api/admin/tickets/${id}`).then((r) => r.ticket),
    refetchInterval: 20_000,
  });
  const t = ticket ?? initial;
  const messages = ticket?.messages;
  const [reply, setReply] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the newest message in view
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const send = useAction(
    async (vars: { close: boolean }) => {
      const r = await api(`/api/admin/tickets/${id}/reply`, { body: { message: reply.trim() } });
      if (vars.close) await api(`/api/admin/tickets/${id}`, { method: "PATCH", body: { status: "closed" } });
      return r;
    },
    { success: (_r, v) => (v.close ? "Reply sent and ticket closed" : "Reply sent"), invalidate: [qk.tickets, ["admin", "stats"]], onSuccess: () => setReply("") },
  );
  const update = useAction((body: { status?: TicketStatus; priority?: TicketPriority }) => api(`/api/admin/tickets/${id}`, { method: "PATCH", body }), {
    success: "Ticket updated",
    invalidate: [qk.tickets, ["admin", "stats"]],
  });

  const submit = (close: boolean) => {
    if (!reply.trim() || send.isPending) return;
    send.mutate({ close });
  };

  if (!t) {
    return (
      <Card className={cn("flex flex-col overflow-hidden", PANE_H)}>
        {isLoading ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-6 h-16 w-3/4" />
            <Skeleton className="ml-auto h-16 w-2/3" />
          </div>
        ) : (
          <EmptyState
            icon={<Inbox />}
            title={isError ? "Ticket not found" : "Couldn't load this ticket"}
            description="It may have been removed, or the link is wrong."
            action={
              <Button size="sm" variant="outline" onClick={onBack}>
                <ArrowLeft /> Back to tickets
              </Button>
            }
          />
        )}
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col overflow-hidden", PANE_H)}>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-2">
          <Button variant="ghost" size="icon-sm" className="-ml-1.5 shrink-0 lg:hidden" onClick={onBack} aria-label="Back to tickets">
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <p className="text-xs text-subtle-foreground tabular">
              #{t.number} · opened {formatDateTime(t.createdAt)}
            </p>
            <h2 className="mt-0.5 break-words text-[15px] font-semibold tracking-tight">{t.subject}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <Link href={`/admin/users/${t.user.id}`} className="inline-flex min-w-0 items-center gap-1 font-medium text-accent hover:underline">
                <span className="truncate">{t.user.email || "Unknown user"}</span>
                <ExternalLink className="size-3 shrink-0" />
              </Link>
              {t.user.name && <span className="text-muted-foreground">{t.user.name}</span>}
              <Badge tone="outline">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
            </div>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-[260px]">
          <NativeSelect value={t.status} onChange={(e) => update.mutate({ status: e.target.value as TicketStatus })} disabled={update.isPending} aria-label="Status" className="h-8 text-[13px]">
            {(Object.keys(STATUS_META) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value as TicketPriority })} disabled={update.isPending} aria-label="Priority" className="h-8 text-[13px]">
            <option value="low">Low priority</option>
            <option value="normal">Normal priority</option>
            <option value="high">High priority</option>
          </NativeSelect>
        </div>
      </div>

      {/* Messages */}
      <div ref={scroller} className="scrollbar-thin min-h-[260px] flex-1 space-y-5 overflow-y-auto bg-muted/25 px-4 py-5 sm:px-5">
        {!messages ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="ml-auto h-16 w-2/3" />
          </div>
        ) : (
          messages.map((m) => {
            const admin = m.from === "admin";
            return (
              <div key={m.id} className={cn("flex items-end gap-2.5", admin && "flex-row-reverse")}>
                {admin ? (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[10px] font-semibold text-accent-foreground">FZ</span>
                ) : (
                  <Avatar name={m.authorName} className="size-7 text-[10px]" />
                )}
                <div className={cn("flex min-w-0 max-w-[85%] flex-col", admin && "items-end")}>
                  <div className={cn("rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed", admin ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md border border-border bg-card")}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                  <p className="mt-1 px-1 text-[11px] text-subtle-foreground" title={formatDateTime(m.createdAt)}>
                    {admin ? m.authorName || "Support team" : m.authorName || t.user.email} · {relativeTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reply */}
      <div className="border-t border-border p-3 sm:p-4">
        {t.status === "closed" && <p className="mb-2 text-xs text-muted-foreground">This ticket is closed. Replying reopens it as “Answered”.</p>}
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit(false);
            }
          }}
          maxLength={10_000}
          placeholder={`Reply to ${t.user.email || "the user"}…`}
          className="min-h-20 resize-none"
          aria-label="Reply"
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[11px] text-subtle-foreground">The user is notified by email and Telegram. Press ⌘/Ctrl + Enter to send.</span>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={!reply.trim() || send.isPending} loading={send.isPending && send.variables?.close} onClick={() => submit(true)}>
              Send &amp; close
            </Button>
            <Button variant="accent" size="sm" disabled={!reply.trim() || send.isPending} loading={send.isPending && !send.variables?.close} onClick={() => submit(false)}>
              <Send /> Send reply
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2 px-4 py-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
