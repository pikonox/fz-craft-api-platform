"use client";

import { useState } from "react";
import { Check, Layers, MoreHorizontal, Pencil, Plus, Ticket, Trash2, Users } from "lucide-react";
import { formatNumber, formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "@/components/ui/overlay";
import { Switch } from "@/components/ui/controls";
import { qk, useAdminPlans } from "@/components/admin/queries";
import { ACCESS_TONE, ConfirmDialog, useAction } from "@/components/admin/ui";
import { PLAN_ACCESS_LABEL, PlanDialog, planBody, type PlanEditorTarget } from "@/components/admin/plans/plan-dialog";
import type { AdminPlan } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const INVALIDATE = [qk.plans, ["plans"], ["billing"]];

/** Why a plan can't be deleted (the API refuses both cases), or null if it can. */
function deleteBlocker(p: AdminPlan) {
  if (p.isFree) return "The free plan can't be deleted — every account falls back to it.";
  if (p.activeSubscribers > 0) return `${formatNumber(p.activeSubscribers)} active subscriber${p.activeSubscribers === 1 ? "" : "s"}. Turn the plan off instead; it stops renewing and can be deleted once nobody is on it.`;
  return null;
}

export default function AdminPlansPage() {
  const { data: plans = [], isLoading, isError, refetch } = useAdminPlans();
  const [editor, setEditor] = useState<PlanEditorTarget>(null);
  const [deleting, setDeleting] = useState<AdminPlan | null>(null);

  const monthly = plans.filter((p) => p.kind === "monthly");
  const passes = plans.filter((p) => p.kind === "pass");
  const subscribers = plans.reduce((n, p) => n + (p.isFree ? 0 : p.activeSubscribers), 0);

  const toggle = useAction((p: AdminPlan) => api(`/api/admin/plans/${p.id}`, { method: "PUT", body: planBody(p, { active: !p.active }) }), {
    success: (_r, p) => (p.active ? `${p.name} turned off — hidden from pricing` : `${p.name} is on sale again`),
    invalidate: INVALIDATE,
  });
  const remove = useAction((p: AdminPlan) => api(`/api/admin/plans/${p.id}`, { method: "DELETE" }), {
    success: (_r, p) => `${p.name} deleted`,
    invalidate: INVALIDATE,
    onSuccess: () => setDeleting(null),
  });

  return (
    <div>
      <PageHeader
        title="Plans"
        description="Monthly plans and passes sold on the pricing page. Plans are paid from the user's balance and give a token allowance and rate limit."
        actions={
          <>
            <Button variant="outline" onClick={() => setEditor({ mode: "new", kind: "pass" })}>
              <Ticket /> New pass
            </Button>
            <Button variant="primary" onClick={() => setEditor({ mode: "new", kind: "monthly" })}>
              <Plus /> New plan
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <EmptyState
            icon={<Layers />}
            title="Couldn't load plans"
            action={
              <Button variant="outline" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : !plans.length ? (
        <Card>
          <EmptyState
            icon={<Layers />}
            title="No plans yet"
            description="Create a free plan first — it's what every new account starts on — then add paid plans and passes. Or run pnpm seed to load the defaults."
            action={
              <Button variant="primary" onClick={() => setEditor({ mode: "new", kind: "monthly" })}>
                <Plus /> New plan
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-10">
          <p className="-mt-2 text-[13px] text-muted-foreground">
            {formatNumber(subscribers)} active paid subscription{subscribers === 1 ? "" : "s"} across {plans.length} plans.
          </p>
          <PlanSection
            title="Monthly plans"
            description="Subscriptions that renew from the user's balance. If the balance can't cover a renewal, the account drops to the free plan."
            plans={monthly}
            empty="No monthly plans."
            onNew={() => setEditor({ mode: "new", kind: "monthly" })}
            onEdit={(p) => setEditor({ mode: "edit", plan: p })}
            onToggle={(p) => toggle.mutate(p)}
            toggling={toggle.isPending ? toggle.variables?.id : undefined}
            onDelete={setDeleting}
          />
          <PlanSection
            title="Passes"
            description="One-off top-ups of tokens for a fixed number of hours, for users on the free plan."
            plans={passes}
            empty="No passes."
            onNew={() => setEditor({ mode: "new", kind: "pass" })}
            onEdit={(p) => setEditor({ mode: "edit", plan: p })}
            onToggle={(p) => toggle.mutate(p)}
            toggling={toggle.isPending ? toggle.variables?.id : undefined}
            onDelete={setDeleting}
          />
        </div>
      )}

      <PlanDialog target={editor} plans={plans} onClose={() => setEditor(null)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "plan"}?`}
        confirmLabel="Delete plan"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      >
        <p className="text-sm text-muted-foreground">It disappears from the pricing page. Past payments and expired subscriptions that used it are kept for your records.</p>
      </ConfirmDialog>
    </div>
  );
}

function PlanSection({
  title,
  description,
  plans,
  empty,
  onNew,
  onEdit,
  onToggle,
  toggling,
  onDelete,
}: {
  title: string;
  description: string;
  plans: AdminPlan[];
  empty: string;
  onNew: () => void;
  onEdit: (p: AdminPlan) => void;
  onToggle: (p: AdminPlan) => void;
  toggling?: string;
  onDelete: (p: AdminPlan) => void;
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
      </div>
      {!plans.length ? (
        <button type="button" onClick={onNew} className="w-full rounded-2xl border border-dashed border-border-strong px-5 py-8 text-sm text-muted-foreground transition-colors hover:border-accent hover:text-foreground">
          {empty} <span className="font-medium text-accent">Create one</span>
        </button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <PlanCard key={p.id} p={p} busy={toggling === p.id} onEdit={() => onEdit(p)} onToggle={() => onToggle(p)} onDelete={() => onDelete(p)} />
          ))}
        </div>
      )}
    </section>
  );
}

function PlanCard({ p, busy, onEdit, onToggle, onDelete }: { p: AdminPlan; busy: boolean; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  const blocker = deleteBlocker(p);
  const saving = p.kind === "monthly" && p.priceMonthly > 0 && p.priceYearly > 0 ? 1 - p.priceYearly / (p.priceMonthly * 12) : 0;
  const hours = p.durationHours || 24;
  const duration = hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours}h`;

  return (
    <Card className={cn("flex flex-col overflow-hidden", p.highlight && p.active && "border-accent/50 shadow-lg shadow-accent/5", !p.active && "opacity-75")}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[16px] font-semibold tracking-tight">{p.name}</h3>
            {p.isFree && <Badge tone="success">Free plan</Badge>}
            {p.badge && <Badge tone="accent">{p.badge}</Badge>}
            {!p.active && <Badge tone="outline">Off sale</Badge>}
          </div>
          <p className="mt-0.5 font-mono text-[11.5px] text-subtle-foreground">{p.slug}</p>
        </div>
        <DropdownMenu>
          <DropdownTrigger asChild>
            <Button size="icon-sm" variant="ghost" className="-mr-2 -mt-1" aria-label={`Actions for ${p.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem danger disabled={Boolean(blocker)} onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>

      <div className="px-5 pt-4">
        {p.isFree ? (
          <p className="text-[28px] font-semibold leading-none tracking-tight">Free</p>
        ) : p.kind === "pass" ? (
          <p className="flex items-baseline gap-1.5">
            <span className="text-[28px] font-semibold leading-none tracking-tight tabular">{formatUsd(p.pricePass)}</span>
            <span className="text-[13px] text-muted-foreground">/ {duration}</span>
          </p>
        ) : (
          <>
            <p className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-semibold leading-none tracking-tight tabular">{formatUsd(p.priceMonthly)}</span>
              <span className="text-[13px] text-muted-foreground">/ month</span>
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {p.priceYearly > 0 ? (
                <>
                  {formatUsd(p.priceYearly)} / year
                  {saving > 0.005 && <span className="ml-1.5 font-medium text-success">save {Math.round(saving * 100)}%</span>}
                </>
              ) : (
                "No yearly option"
              )}
            </p>
          </>
        )}
      </div>

      <div className="mx-5 mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-[13px]">
        <div className="bg-card px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider text-subtle-foreground">Tokens</p>
          <p className="mt-0.5 font-semibold tabular">
            {formatTokens(p.tokens)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{p.kind === "pass" ? "/ pass" : "/ mo"}</span>
          </p>
        </div>
        <div className="bg-card px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider text-subtle-foreground">Rate limit</p>
          <p className="mt-0.5 font-semibold tabular">
            {formatNumber(p.rpm)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">RPM</span>
          </p>
        </div>
      </div>

      <div className="px-5 pt-3">
        <Badge tone={ACCESS_TONE[p.modelAccess] ?? "neutral"}>{PLAN_ACCESS_LABEL[p.modelAccess] ?? p.modelAccess}</Badge>
      </div>

      <ul className="flex-1 space-y-1.5 px-5 pb-4 pt-3 text-[13px] text-muted-foreground">
        {p.features.slice(0, 6).map((f, i) => (
          <li key={i} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={3} />
            <span className="min-w-0">{f}</span>
          </li>
        ))}
        {p.features.length > 6 && <li className="pl-5.5 text-xs text-subtle-foreground">+{p.features.length - 6} more</li>}
        {!p.features.length && <li className="text-xs text-subtle-foreground">No feature list</li>}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3">
        <Tooltip content={blocker ?? undefined}>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" />
            <span className="tabular">{formatNumber(p.activeSubscribers)}</span> active
          </span>
        </Tooltip>
        <div className="flex items-center gap-3">
          <span className="text-xs text-subtle-foreground tabular">#{p.sort}</span>
          <Tooltip content={p.isFree ? "The free plan is always on" : p.active ? "On sale — switch off to hide it" : "Off sale — switch on to sell it again"}>
            <span>
              <Switch checked={p.active} disabled={busy || p.isFree} onCheckedChange={onToggle} />
            </span>
          </Tooltip>
        </div>
      </div>
      {blocker && !p.isFree && (
        <p className="border-t border-border px-5 py-2.5 text-[11.5px] text-subtle-foreground">Can&apos;t delete: {blocker}</p>
      )}
    </Card>
  );
}
