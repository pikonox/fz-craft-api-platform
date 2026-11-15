"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, BookOpen, ChevronRight, Clock, CreditCard, LifeBuoy, Mail, MessageSquareText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CopyButton, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { CATEGORY_LABEL, NewTicketDialog, TICKET_STATUS, type Ticket } from "@/components/account/support";
import { api } from "@/lib/api";
import { useStatus } from "@/lib/queries";
import { cn, relativeTime } from "@/lib/utils";

type Filter = "all" | Ticket["status"];

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportInner />
    </Suspense>
  );
}

function SupportInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading } = useQuery({ queryKey: ["support"], queryFn: () => api<{ tickets: Ticket[]; supportEmail: string }>("/api/support"), refetchInterval: 60_000 });
  const { data: status } = useStatus();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);

  // ?new=1&subject=…&category=… opens the form pre-filled (used by "Get help" on payment pages)
  const initial = useMemo(
    () => ({ subject: params.get("subject") ?? undefined, category: params.get("category") ?? undefined }),
    [params],
  );
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
  }, [params]);
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && params.get("new")) router.replace(pathname, { scroll: false });
  };

  const tickets = data?.tickets ?? [];
  const counts = { all: tickets.length, open: 0, answered: 0, closed: 0 } as Record<Filter, number>;
  tickets.forEach((t) => counts[t.status]++);
  const rows = tickets.filter((t) => filter === "all" || t.status === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Questions about billing, the API or your account? Open a ticket — we usually reply within a few hours."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus /> New ticket
          </Button>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader
            title="Your tickets"
            description={counts.answered ? `${counts.answered} with a reply waiting for you` : "Conversations with our team"}
            className="flex-col sm:flex-row"
            action={
              <Segmented
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All", count: counts.all },
                  { value: "open", label: "Open", count: counts.open },
                  { value: "answered", label: "Replied", count: counts.answered },
                  { value: "closed", label: "Closed", count: counts.closed },
                ]}
              />
            }
          />
          {isLoading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : !rows.length ? (
            <EmptyState
              icon={<LifeBuoy />}
              title={filter === "all" ? "No tickets yet" : "Nothing here"}
              description={filter === "all" ? "If something isn't working, open a ticket and we'll get back to you." : "No tickets match this filter."}
              action={
                filter === "all" ? (
                  <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                    <Plus /> New ticket
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((t) => {
                const st = TICKET_STATUS[t.status];
                return (
                  <li key={t.id}>
                    <Link href={`/dashboard/support/${t.id}`} className="group flex gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono text-xs text-subtle-foreground">#{t.number}</span>
                          <span className={cn("truncate text-[13.5px] font-medium", t.status === "closed" && "text-muted-foreground")}>{t.subject}</span>
                        </div>
                        {t.lastMessage && (
                          <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">
                            <span className="font-medium text-foreground/80">{t.lastMessage.from === "admin" ? "Support" : "You"}:</span> {t.lastMessage.body}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-subtle-foreground">
                          <Badge tone={st.tone} dot={t.status === "answered"}>
                            {st.label}
                          </Badge>
                          <Badge tone="outline">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                          <span className="inline-flex items-center gap-1">
                            <MessageSquareText className="size-3" /> {t.messageCount}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" /> {relativeTime(t.lastActivityAt)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Quick answers" description="These often solve it faster" />
            <CardBody className="space-y-1 py-3">
              {[
                { href: "/docs", icon: BookOpen, title: "Documentation", body: "Quickstart, SDKs and error codes" },
                { href: "/dashboard/billing/balance", icon: CreditCard, title: "Track a payment", body: "See the status of every top-up" },
                { href: "/dashboard/usage?tab=logs", icon: Activity, title: "Request logs", body: "Find a failed call and its error" },
              ].map((q) => (
                <Link key={q.href} href={q.href} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                    <q.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{q.title}</span>
                    <span className="block text-xs text-muted-foreground">{q.body}</span>
                  </span>
                  <ChevronRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-[13px]">
              <span className={cn("size-2 rounded-full", status?.level === "outage" ? "bg-danger" : status?.level === "degraded" ? "bg-warning" : "bg-success")} />
              <span className="font-medium">{status?.message ?? "Checking status…"}</span>
            </div>
            {data?.supportEmail && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">Prefer email?</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <a href={`mailto:${data.supportEmail}`} className="inline-flex min-w-0 items-center gap-2 text-[13px] font-medium text-accent hover:underline">
                    <Mail className="size-4 shrink-0" />
                    <span className="truncate">{data.supportEmail}</span>
                  </a>
                  <CopyButton value={data.supportEmail} label="Email" size="xs" />
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <NewTicketDialog open={open} onOpenChange={onOpenChange} initial={initial} />
    </div>
  );
}
