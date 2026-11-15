"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, Check, CheckCheck, Heart, Lightbulb, MessageSquare, MessageSquareText, RotateCcw, Star, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Skeleton, type BadgeTone } from "@/components/ui/primitives";
import { Segmented, UnderlineTabs } from "@/components/ui/controls";
import { SearchInput, useUrlParams } from "@/components/admin/ui";
import { qk } from "@/components/admin/queries";
import type { AdminFeedback } from "@/components/admin/types";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

type StatusFilter = "new" | "reviewed" | "all";
type TypeFilter = "all" | "idea" | "bug" | "praise" | "other";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "all", label: "All" },
];

const TYPE_META: Record<Exclude<TypeFilter, "all">, { label: string; icon: LucideIcon; tone: BadgeTone; tile: string }> = {
  idea: { label: "Idea", icon: Lightbulb, tone: "info", tile: "bg-info-soft text-info" },
  bug: { label: "Bug", icon: Bug, tone: "danger", tile: "bg-danger-soft text-danger" },
  praise: { label: "Praise", icon: Heart, tone: "success", tile: "bg-success-soft text-success" },
  other: { label: "Other", icon: MessageSquare, tone: "neutral", tile: "bg-muted text-muted-foreground" },
};
const typeMeta = (t: string) => TYPE_META[t as keyof typeof TYPE_META] ?? TYPE_META.other;

export default function FeedbackPage() {
  return (
    <Suspense>
      <FeedbackList />
    </Suspense>
  );
}

function FeedbackList() {
  const qc = useQueryClient();
  const [sp, setParams] = useUrlParams();
  const status = (STATUS_TABS.find((t) => t.value === sp.get("status"))?.value ?? "new") as StatusFilter;
  const type = (["idea", "bug", "praise", "other"].includes(sp.get("type") ?? "") ? sp.get("type") : "all") as TypeFilter;
  const [q, setQ] = useState("");

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: [...qk.feedback, status],
    queryFn: () => api<{ feedback: AdminFeedback[] }>(`/api/admin/feedback${status === "all" ? "" : `?status=${status}`}`).then((r) => r.feedback),
    placeholderData: keepPreviousData,
  });

  const all = useMemo(() => data ?? [], [data]);
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: all.length, idea: 0, bug: 0, praise: 0, other: 0 };
    for (const f of all) c[f.type in TYPE_META ? f.type : "other"]++;
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((f) => (type === "all" || (f.type in TYPE_META ? f.type : "other") === type) && (!needle || [f.message, f.user, f.page].some((s) => (s ?? "").toLowerCase().includes(needle))));
  }, [all, type, q]);

  // Optimistic status toggle across every cached feedback list
  const setStatus = useMutation({
    mutationFn: ({ ids, to }: { ids: string[]; to: AdminFeedback["status"] }) => Promise.all(ids.map((id) => api(`/api/admin/feedback/${id}`, { method: "PATCH", body: { status: to } }))),
    onMutate: ({ ids, to }) => {
      qc.setQueriesData<AdminFeedback[]>({ queryKey: qk.feedback }, (old) => old?.map((f) => (ids.includes(f.id) ? { ...f, status: to } : f)));
    },
    onSuccess: (_r, { ids, to }) => {
      if (ids.length > 1) toast.success(`${ids.length} items marked as reviewed`);
      else toast.success(to === "reviewed" ? "Marked as reviewed" : "Moved back to New");
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.feedback }),
  });

  const unreviewedVisible = rows.filter((f) => f.status === "new").map((f) => f.id);
  const typeOptions: { value: TypeFilter; label: string; count: number }[] = [
    { value: "all", label: "All types", count: typeCounts.all },
    ...(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((t) => ({ value: t as TypeFilter, label: TYPE_META[t].label, count: typeCounts[t] })),
  ];

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="Ideas, bug reports and praise sent from the dashboard. Mark items as reviewed once you've read them."
        actions={
          unreviewedVisible.length > 1 && (
            <Button variant="outline" size="sm" loading={setStatus.isPending && (setStatus.variables?.ids.length ?? 0) > 1} onClick={() => setStatus.mutate({ ids: unreviewedVisible, to: "reviewed" })}>
              <CheckCheck /> Mark {unreviewedVisible.length} as reviewed
            </Button>
          )
        }
      />

      <UnderlineTabs value={status} onChange={(v) => setParams({ status: v === "new" ? null : v })} options={STATUS_TABS.map((t) => ({ ...t, count: t.value === status ? all.length : undefined }))} className="mb-4" />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented size="sm" value={type} onChange={(v) => setParams({ type: v === "all" ? null : v })} options={typeOptions} />
        <SearchInput value={q} onChange={setQ} placeholder="Search message, email or page" className="w-full lg:w-72" />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="flex gap-3 p-5">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : isError && !data ? (
        <Card>
          <EmptyState
            icon={<MessageSquareText />}
            title="Couldn't load feedback"
            description="Check that the API is running, then try again."
            action={
              <Button size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={<MessageSquareText />}
            title={q || type !== "all" ? "Nothing matches these filters" : status === "new" ? "All caught up" : "No feedback here"}
            description={q || type !== "all" ? "Try another type or search." : status === "new" ? "New feedback from users shows up here." : undefined}
          />
        </Card>
      ) : (
        <ul className={cn("space-y-3 transition-opacity", isFetching && !isLoading && "opacity-80")}>
          {rows.map((f) => (
            <FeedbackItem key={f.id} f={f} busy={setStatus.isPending && !!setStatus.variables?.ids.includes(f.id)} onToggle={() => setStatus.mutate({ ids: [f.id], to: f.status === "new" ? "reviewed" : "new" })} />
          ))}
        </ul>
      )}
      {all.length >= 200 && <p className="mt-4 text-center text-xs text-muted-foreground">Showing the 200 most recent items.</p>}
    </div>
  );
}

function FeedbackItem({ f, busy, onToggle }: { f: AdminFeedback; busy: boolean; onToggle: () => void }) {
  const meta = typeMeta(f.type);
  const Icon = meta.icon;
  return (
    <li>
      <Card className={cn("flex gap-3 p-4 sm:gap-4 sm:p-5", f.status === "reviewed" && "bg-card/60")}>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", meta.tile)}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {f.rating ? <Stars n={f.rating} /> : null}
            {f.status === "new" && (
              <Badge tone="accent" dot>
                New
              </Badge>
            )}
            <span className="ml-auto text-xs text-subtle-foreground" title={formatDateTime(f.createdAt)}>
              {relativeTime(f.createdAt)}
            </span>
          </div>
          <p className={cn("mt-2 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed", f.status === "reviewed" && "text-foreground/80")}>{f.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            {f.user ? (
              <Link href={`/admin/users?q=${encodeURIComponent(f.user)}`} className="max-w-full truncate font-medium text-foreground/80 hover:text-accent hover:underline">
                {f.user}
              </Link>
            ) : (
              <span>Unknown user</span>
            )}
            {f.page && (
              <span className="max-w-full truncate font-mono text-[11.5px]" title={f.page}>
                {f.page}
              </span>
            )}
            <Button size="xs" variant={f.status === "new" ? "outline" : "ghost"} className="ml-auto" loading={busy} onClick={onToggle}>
              {f.status === "new" ? (
                <>
                  <Check /> Mark reviewed
                </>
              ) : (
                <>
                  <RotateCcw /> Mark as new
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </li>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of 5`} title={`${n} / 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn("size-3.5", i < n ? "fill-amber-400 text-amber-400" : "text-border-strong")} />
      ))}
    </span>
  );
}
