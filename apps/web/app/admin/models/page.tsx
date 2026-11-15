"use client";

import { useMemo, useState } from "react";
import { Copy, Cpu, MoreHorizontal, Pencil, Plus, Star, Trash2, Wrench } from "lucide-react";
import { formatNumber, formatTokenPrice, formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, NativeSelect, PageHeader } from "@/components/ui/primitives";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "@/components/ui/overlay";
import { Segmented, Switch } from "@/components/ui/controls";
import { VendorMark } from "@/components/model-meta";
import { qk, useAdminModels, useAdminProviders } from "@/components/admin/queries";
import { ACCESS_TONE, ConfirmDialog, SearchInput, TD, Table, TableSkeleton, useAction } from "@/components/admin/ui";
import { ACCESS_LABEL, MODEL_TYPE_LABEL, ModelDialog, type ModelEditorTarget, type ModelRow, type ModelType } from "@/components/admin/models/model-dialog";
import type { Provider } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type TypeFilter = "all" | ModelType;
type StateFilter = "all" | "live" | "maintenance" | "disabled" | "no-route";

const INVALIDATE = [qk.models, ["models"], ["admin", "stats"]];

export default function AdminModelsPage() {
  const { data, isLoading, isError, refetch } = useAdminModels();
  const { data: providers = [] } = useAdminProviders();
  const models = (data ?? []) as ModelRow[];

  const [q, setQ] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [state, setState] = useState<StateFilter>("all");
  const [provider, setProvider] = useState("all");
  const [editor, setEditor] = useState<ModelEditorTarget>(null);
  const [deleting, setDeleting] = useState<ModelRow | null>(null);

  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);
  const liveRoutes = (m: ModelRow) => m.routes.filter((r) => r.enabled !== false && providerById.get(r.providerId)?.enabled !== false);

  const counts = useMemo(() => {
    const c = { all: models.length, chat: 0, image: 0, embedding: 0, maintenance: 0, disabled: 0 };
    for (const m of models) {
      c[m.type]++;
      if (m.status === "maintenance") c.maintenance++;
      if (!m.enabled) c.disabled++;
    }
    return c;
  }, [models]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return models.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (state === "live" && (!m.enabled || m.status === "maintenance")) return false;
      if (state === "maintenance" && m.status !== "maintenance") return false;
      if (state === "disabled" && m.enabled) return false;
      if (state === "no-route" && liveRoutes(m).length) return false;
      if (provider !== "all" && !m.routes.some((r) => r.providerId === provider)) return false;
      if (s && ![m.name, m.publicId, m.vendor].some((v) => v?.toLowerCase().includes(s))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, q, type, state, provider, providerById]);

  const patch = useAction(({ id, body }: { id: string; name: string; body: Record<string, unknown> }) => api(`/api/admin/models/${id}`, { method: "PATCH", body }), {
    success: (_r, v) =>
      "enabled" in v.body
        ? `${v.name} ${v.body.enabled ? "enabled" : "disabled"}`
        : "status" in v.body
          ? v.body.status === "maintenance"
            ? `${v.name} is in maintenance`
            : `${v.name} is active again`
          : v.body.featured
            ? `${v.name} featured`
            : `${v.name} unfeatured`,
    invalidate: INVALIDATE,
  });
  const remove = useAction((m: ModelRow) => api(`/api/admin/models/${m.id}`, { method: "DELETE" }), {
    success: (_r, m) => `${m.name} deleted`,
    invalidate: INVALIDATE,
    onSuccess: () => setDeleting(null),
  });

  const filtered = q || type !== "all" || state !== "all" || provider !== "all";

  return (
    <div>
      <PageHeader
        title="Models"
        description="The public catalog: names, prices, who can use each model, and which upstream provider serves it."
        actions={
          <Button variant="primary" onClick={() => setEditor({ mode: "new" })}>
            <Plus /> Add model
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "chat", label: "Chat", count: counts.chat },
              { value: "image", label: "Image", count: counts.image },
              { value: "embedding", label: "Embedding", count: counts.embedding },
            ]}
          />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_170px] lg:w-[620px]">
            <SearchInput value={q} onChange={setQ} placeholder="Search name, ID or vendor" />
            <NativeSelect value={state} onChange={(e) => setState(e.target.value as StateFilter)} className="h-9 text-[13px]" aria-label="Filter by state">
              <option value="all">Any state</option>
              <option value="live">Live</option>
              <option value="maintenance">Maintenance ({counts.maintenance})</option>
              <option value="disabled">Disabled ({counts.disabled})</option>
              <option value="no-route">No working route</option>
            </NativeSelect>
            <NativeSelect value={provider} onChange={(e) => setProvider(e.target.value)} className="h-9 text-[13px]" aria-label="Filter by provider">
              <option value="all">Any provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : isError ? (
          <EmptyState
            icon={<Cpu />}
            title="Couldn't load models"
            action={
              <Button variant="outline" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : !models.length ? (
          <EmptyState
            icon={<Cpu />}
            title="No models yet"
            description="Add a model, give it a public ID and route it to a provider. You can also run SYNC_MODELS=1 pnpm seed to load the built-in catalog."
            action={
              <Button variant="primary" onClick={() => setEditor({ mode: "new" })}>
                <Plus /> Add model
              </Button>
            }
          />
        ) : !rows.length ? (
          <EmptyState
            icon={<Cpu />}
            title="No models match these filters"
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQ("");
                  setType("all");
                  setState("all");
                  setProvider("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <Table head={["Model", "Type", "Price", "Access", "Routes", "Status", "Enabled", <th key="x" className="w-10" />]} minWidth={1020}>
            {rows.map((m) => (
              <ModelTableRow
                key={m.id}
                m={m}
                providerById={providerById}
                liveRoutes={liveRoutes(m).length}
                busy={patch.isPending && patch.variables?.id === m.id}
                onPatch={(body) => patch.mutate({ id: m.id, name: m.name, body })}
                onEdit={() => setEditor({ mode: "edit", model: m })}
                onDuplicate={() => setEditor({ mode: "new", from: m })}
                onDelete={() => setDeleting(m)}
              />
            ))}
          </Table>
        )}
        {!isLoading && models.length > 0 && (
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            {filtered ? `${formatNumber(rows.length)} of ${formatNumber(models.length)} models` : `${formatNumber(models.length)} models`} · {counts.maintenance} in maintenance · {counts.disabled} disabled
          </p>
        )}
      </Card>

      <ModelDialog target={editor} providers={providers} onClose={() => setEditor(null)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "model"}?`}
        confirmLabel="Delete model"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Requests for <code className="rounded bg-muted px-1 font-mono text-[12.5px] text-foreground">{deleting?.publicId}</code> will fail with model_not_found. Past usage logs are kept.
          </p>
          <p>To take it offline temporarily, switch it off or set it to maintenance instead.</p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function priceCell(m: ModelRow) {
  const p = m.pricing ?? {};
  if (m.type === "image") {
    const k1 = p.perImage?.["1K"] ?? 0;
    return k1 ? { main: formatUsd(k1), sub: "per 1K image" } : { main: "—", sub: "no price set" };
  }
  if (m.type === "embedding") return p.inputPer1M ? { main: formatTokenPrice(p.inputPer1M), sub: "per 1M tokens" } : { main: "Included", sub: "" };
  if (!p.inputPer1M && !p.outputPer1M) return { main: "Included", sub: "" };
  return { main: `${formatTokenPrice(p.inputPer1M ?? 0)} / ${formatTokenPrice(p.outputPer1M ?? 0)}`, sub: "in / out per 1M" };
}

function ModelTableRow({
  m,
  providerById,
  liveRoutes,
  busy,
  onPatch,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  m: ModelRow;
  providerById: Map<string, Provider>;
  liveRoutes: number;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const price = priceCell(m);
  const maintenance = m.status === "maintenance";
  const names = [...new Set(m.routes.map((r) => providerById.get(r.providerId)?.name ?? "Unknown provider"))];

  return (
    <tr className={cn("border-t border-border align-middle transition-colors hover:bg-muted/40", !m.enabled && "text-muted-foreground")}>
      <td className={TD}>
        <div className="flex min-w-0 items-center gap-3">
          <VendorMark vendor={m.vendor} type={m.type} modelId={m.publicId} className={cn("size-9", !m.enabled && "opacity-60")} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={onEdit} className="truncate text-left font-medium text-foreground hover:underline">
                {m.name}
              </button>
              <Tooltip content={m.featured ? "Featured — click to unfeature" : "Feature on the homepage"}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPatch({ featured: !m.featured })}
                  aria-label={m.featured ? "Unfeature" : "Feature"}
                  aria-pressed={m.featured}
                  className={cn("rounded p-0.5 transition-colors", m.featured ? "text-amber-500" : "text-subtle-foreground/50 hover:text-amber-500")}
                >
                  <Star className={cn("size-3.5", m.featured && "fill-current")} />
                </button>
              </Tooltip>
            </div>
            <p className="truncate font-mono text-[11.5px] text-muted-foreground">{m.publicId}</p>
          </div>
        </div>
      </td>
      <td className={TD}>
        <span className="text-[13px]">{MODEL_TYPE_LABEL[m.type]}</span>
        {m.type === "chat" && m.contextLength > 0 && <p className="text-[11.5px] text-subtle-foreground">{formatTokens(m.contextLength)} ctx</p>}
      </td>
      <td className={TD}>
        <span className="whitespace-nowrap font-medium tabular text-foreground">{price.main}</span>
        {price.sub && <p className="text-[11.5px] text-subtle-foreground">{price.sub}</p>}
      </td>
      <td className={TD}>
        <Badge tone={ACCESS_TONE[m.access] ?? "neutral"}>{ACCESS_LABEL[m.access] ?? m.access}</Badge>
      </td>
      <td className={TD}>
        {!m.routes.length ? (
          <Badge tone="danger" dot>
            No route
          </Badge>
        ) : (
          <div className="min-w-0">
            <p className="max-w-[200px] truncate text-[13px] text-foreground" title={names.join(", ")}>
              {names.slice(0, 2).join(", ")}
              {names.length > 2 ? ` +${names.length - 2}` : ""}
            </p>
            <p className={cn("text-[11.5px]", liveRoutes ? "text-subtle-foreground" : "text-danger")}>
              {liveRoutes ? `${liveRoutes} of ${m.routes.length} route${m.routes.length > 1 ? "s" : ""} live` : "All routes off"}
            </p>
          </div>
        )}
      </td>
      <td className={TD}>
        <Tooltip content={maintenance ? "Requests return 503 until it's active again. Click to reactivate." : "Click to put it in maintenance (still listed, requests return 503)."}>
          <button type="button" disabled={busy} onClick={() => onPatch({ status: maintenance ? "active" : "maintenance" })} className="rounded-md disabled:opacity-60">
            {maintenance ? (
              <Badge tone="warning" dot>
                Maintenance
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Active
              </Badge>
            )}
          </button>
        </Tooltip>
      </td>
      <td className={TD}>
        <Switch checked={m.enabled} disabled={busy} onCheckedChange={(v) => onPatch({ enabled: v })} />
      </td>
      <td className={cn(TD, "text-right")}>
        <DropdownMenu>
          <DropdownTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${m.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownItem>
            <DropdownItem onSelect={onDuplicate}>
              <Copy /> Duplicate
            </DropdownItem>
            <DropdownItem onSelect={() => onPatch({ status: maintenance ? "active" : "maintenance" })}>
              <Wrench /> {maintenance ? "End maintenance" : "Set maintenance"}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem danger onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
