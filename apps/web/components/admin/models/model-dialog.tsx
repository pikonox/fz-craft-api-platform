"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, X } from "lucide-react";
import { formatTokens } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { Segmented, Switch } from "@/components/ui/controls";
import { qk, useProviderTest } from "@/components/admin/queries";
import { SectionLabel, ToggleRow, num, useAction, usdField } from "@/components/admin/ui";
import type { Access, AdminModel, ModelRoute, Provider } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** The API also returns `status`; the shared AdminModel type predates it. */
export type ModelRow = AdminModel & { status?: "active" | "maintenance" };
export type ModelType = AdminModel["type"];
type Capability = AdminModel["capabilities"][number];

export const MODEL_TYPE_LABEL: Record<ModelType, string> = { chat: "Chat", image: "Image", embedding: "Embedding" };
export const ACCESS_LABEL: Record<Access, string> = { free: "Free", paid: "Paid plans", early: "Top tier" };
const ACCESS_HINT: Record<Access, string> = {
  free: "Every account, including the Free plan.",
  paid: "Any paid plan or pass.",
  early: "Only plans with early access (top tier).",
};
const CAPABILITIES: { id: Capability; label: string }[] = [
  { id: "streaming", label: "Streaming" },
  { id: "tools", label: "Tools" },
  { id: "vision", label: "Vision" },
  { id: "reasoning", label: "Reasoning" },
  { id: "json", label: "JSON mode" },
];
const ID_RX = /^[a-zA-Z0-9._:/-]+$/;

/** Editor target: an existing model, a new one, or a new one prefilled from another (duplicate). */
export type ModelEditorTarget = { mode: "edit"; model: ModelRow } | { mode: "new"; from?: ModelRow } | null;

type RouteForm = { key: number; providerId: string; upstreamModel: string; priority: string; weight: string; enabled: boolean };

let routeKey = 0;
const toRouteForm = (r: ModelRoute): RouteForm => ({ key: ++routeKey, providerId: r.providerId, upstreamModel: r.upstreamModel, priority: String(r.priority ?? 1), weight: String(r.weight ?? 1), enabled: r.enabled !== false });

const idFromName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

export function ModelDialog({ target, providers, onClose }: { target: ModelEditorTarget; providers: Provider[]; onClose: () => void }) {
  const editing = target?.mode === "edit" ? target.model : null;
  const source = target?.mode === "edit" ? target.model : target?.mode === "new" ? target.from : undefined;

  const [name, setName] = useState("");
  const [publicId, setPublicId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [vendor, setVendor] = useState("");
  const [type, setType] = useState<ModelType>("chat");
  const [description, setDescription] = useState("");
  const [sort, setSort] = useState("100");
  const [contextLength, setContextLength] = useState("128000");
  const [maxOutput, setMaxOutput] = useState("16384");
  const [caps, setCaps] = useState<Capability[]>(["streaming"]);
  const [price, setPrice] = useState({ input: "0", output: "0", cached: "0", k1: "0", k2: "0", k4: "0" });
  const [access, setAccess] = useState<Access>("free");
  const [status, setStatus] = useState<"active" | "maintenance">("active");
  const [enabled, setEnabled] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [routes, setRoutes] = useState<RouteForm[]>([]);

  useEffect(() => {
    if (!target) return;
    const m = source;
    const isCopy = target.mode === "new" && Boolean(m);
    setName(m ? (isCopy ? `${m.name} (copy)` : m.name) : "");
    setPublicId(m ? (isCopy ? `${m.publicId}-copy` : m.publicId) : "");
    setIdTouched(Boolean(m));
    setVendor(m?.vendor ?? "");
    setType(m?.type ?? "chat");
    setDescription(m?.description ?? "");
    setSort(String(m?.sort ?? 100));
    setContextLength(String(m?.contextLength ?? 128_000));
    setMaxOutput(String(m?.maxOutput ?? 16_384));
    setCaps(m?.capabilities ?? ["streaming"]);
    const p = m?.pricing ?? {};
    setPrice({
      input: usdField(p.inputPer1M),
      output: usdField(p.outputPer1M),
      cached: usdField(p.cachedInputPer1M),
      k1: usdField(p.perImage?.["1K"]),
      k2: usdField(p.perImage?.["2K"]),
      k4: usdField(p.perImage?.["4K"]),
    });
    setAccess(m?.access ?? "free");
    setStatus(m?.status ?? "active");
    setEnabled(m?.enabled ?? true);
    setFeatured(isCopy ? false : (m?.featured ?? false));
    setRoutes(m ? m.routes.map(toRouteForm) : providers[0] ? [{ key: ++routeKey, providerId: providers[0].id, upstreamModel: "", priority: "1", weight: "1", enabled: true }] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // ── Validation ──
  const idOk = ID_RX.test(publicId) && publicId.length <= 100;
  const priceNums = Object.fromEntries(Object.entries(price).map(([k, v]) => [k, num(v, -1)])) as Record<keyof typeof price, number>;
  const pricesOk = Object.values(priceNums).every((v) => v >= 0);
  const ctx = Math.round(num(contextLength, -1));
  const maxOut = Math.round(num(maxOutput, -1));
  const limitsOk = type === "image" || (ctx >= 0 && maxOut >= 0);
  const routeErrors = routes.map((r) => {
    if (!r.providerId) return "Pick a provider";
    if (!r.upstreamModel.trim()) return "Enter the upstream model id";
    const pr = num(r.priority, -1);
    if (!Number.isInteger(pr) || pr < 0 || pr > 100) return "Priority 0–100";
    const w = num(r.weight, -1);
    if (w < 0 || w > 100) return "Weight 0–100";
    return null;
  });
  const valid = name.trim() && idOk && pricesOk && limitsOk && routeErrors.every((e) => !e) && Number.isInteger(num(sort, NaN));

  const save = useAction(
    () => {
      const body = {
        publicId: publicId.trim(),
        name: name.trim(),
        type,
        vendor: vendor.trim(),
        description: description.trim(),
        capabilities: type === "chat" ? caps : [],
        contextLength: type === "image" ? 0 : ctx,
        maxOutput: type === "chat" ? maxOut : 0,
        access,
        enabled,
        status,
        featured,
        sort: Math.round(num(sort, 100)),
        pricingUsd: {
          inputPer1M: type === "image" ? 0 : priceNums.input,
          outputPer1M: type === "chat" ? priceNums.output : 0,
          cachedInputPer1M: type === "chat" ? priceNums.cached : 0,
          perImage: type === "image" ? { "1K": priceNums.k1, "2K": priceNums.k2, "4K": priceNums.k4 } : { "1K": 0, "2K": 0, "4K": 0 },
        },
        routes: routes.map((r) => ({ providerId: r.providerId, upstreamModel: r.upstreamModel.trim(), priority: Math.round(num(r.priority, 1)), weight: num(r.weight, 1), enabled: r.enabled })),
      };
      return editing ? api(`/api/admin/models/${editing.id}`, { method: "PUT", body }) : api(`/api/admin/models`, { body });
    },
    { success: editing ? "Model saved" : "Model added", invalidate: [qk.models, ["models"], ["admin", "stats"]], onSuccess: onClose },
  );

  const setRoute = (key: number, patch: Partial<RouteForm>) => setRoutes((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const priceField = (k: keyof typeof price, label: string, hint?: string) => (
    <Field label={label} hint={hint} error={priceNums[k] < 0 ? "Enter 0 or more" : null}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle-foreground">$</span>
        <Input type="number" min={0} step="any" inputMode="decimal" value={price[k]} onChange={(e) => setPrice((p) => ({ ...p, [k]: e.target.value }))} className="pl-6 tabular" />
      </div>
    </Field>
  );

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      size="xl"
      title={editing ? `Edit ${editing.name}` : source ? `Duplicate ${source.name}` : "Add model"}
      description="Users call the model by its public ID. Routes decide which upstream provider and model actually serve it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {editing ? "Save changes" : "Add model"}
          </Button>
        </>
      }
    >
      <div className="space-y-7">
        {/* Basics */}
        <section className="space-y-4">
          <SectionLabel>Basics</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">
              <Input
                value={name}
                maxLength={100}
                placeholder="e.g. DeepSeek V3.2"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!idTouched && !editing) setPublicId(idFromName(e.target.value));
                }}
              />
            </Field>
            <Field
              label="Public model ID"
              hint={editing && publicId !== editing.publicId ? "Changing the ID breaks apps that use the old one." : "What users send as \"model\"."}
              error={publicId && !idOk ? "Letters, numbers and . _ - : / only" : null}
            >
              <Input
                value={publicId}
                maxLength={100}
                placeholder="deepseek-v3.2"
                className="font-mono text-[13px]"
                onChange={(e) => {
                  setPublicId(e.target.value.trim());
                  setIdTouched(true);
                }}
              />
            </Field>
            <Field label="Vendor" hint="Picks the logo, e.g. OpenAI, Anthropic, DeepSeek">
              <Input value={vendor} maxLength={60} onChange={(e) => setVendor(e.target.value)} placeholder="DeepSeek" />
            </Field>
            <div className="grid grid-cols-[1fr_110px] gap-4">
              <Field label="Type">
                <NativeSelect value={type} onChange={(e) => setType(e.target.value as ModelType)}>
                  {(Object.keys(MODEL_TYPE_LABEL) as ModelType[]).map((t) => (
                    <option key={t} value={t}>
                      {MODEL_TYPE_LABEL[t]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Sort" hint="Lower first">
                <Input type="number" step={1} value={sort} onChange={(e) => setSort(e.target.value)} className="tabular" />
              </Field>
            </div>
          </div>
          <Field label="Description">
            <Textarea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} className="min-h-20" placeholder="One or two sentences shown in the catalog." />
          </Field>
        </section>

        {/* Limits & capabilities */}
        {type !== "image" && (
          <section className="space-y-4">
            <SectionLabel>{type === "chat" ? "Limits & capabilities" : "Limits"}</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Context window (tokens)" hint={ctx > 0 ? formatTokens(ctx) : undefined} error={ctx < 0 ? "Enter 0 or more" : null}>
                <Input type="number" min={0} step={1024} value={contextLength} onChange={(e) => setContextLength(e.target.value)} className="tabular" />
              </Field>
              {type === "chat" && (
                <Field label="Max output (tokens)" hint={maxOut > 0 ? formatTokens(maxOut) : undefined} error={maxOut < 0 ? "Enter 0 or more" : null}>
                  <Input type="number" min={0} step={1024} value={maxOutput} onChange={(e) => setMaxOutput(e.target.value)} className="tabular" />
                </Field>
              )}
            </div>
            {type === "chat" && (
              <div className="flex flex-wrap gap-2">
                {CAPABILITIES.map((c) => {
                  const on = caps.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCaps((cs) => (on ? cs.filter((x) => x !== c.id) : [...cs, c.id]))}
                      className={cn(
                        "h-8 rounded-lg border px-3 text-[13px] font-medium transition-colors",
                        on ? "border-accent bg-accent-soft text-accent" : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Pricing */}
        <section className="space-y-4">
          <div>
            <SectionLabel>Pricing (USD)</SectionLabel>
            <p className="mt-1 text-xs text-muted-foreground">
              {type === "image"
                ? "Charged per image from the user's image wallet."
                : "Tokens come out of plan quotas; these per-1M prices are shown as the value at model price."}
            </p>
          </div>
          {type === "image" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {priceField("k1", "1K image")}
              {priceField("k2", "2K image")}
              {priceField("k4", "4K image")}
            </div>
          ) : type === "chat" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {priceField("input", "Input / 1M")}
              {priceField("output", "Output / 1M")}
              {priceField("cached", "Cached input / 1M", "Optional")}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">{priceField("input", "Input / 1M")}</div>
          )}
        </section>

        {/* Access & visibility */}
        <section className="space-y-4">
          <SectionLabel>Access & visibility</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who can use it" hint={ACCESS_HINT[access]}>
              <NativeSelect value={access} onChange={(e) => setAccess(e.target.value as Access)}>
                {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => (
                  <option key={a} value={a}>
                    {ACCESS_LABEL[a]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Status" hint={status === "maintenance" ? "Listed in the catalog, but requests return 503 model_maintenance." : "Serving requests normally."}>
              <Segmented
                value={status}
                onChange={setStatus}
                options={[
                  { value: "active", label: "Active" },
                  { value: "maintenance", label: "Maintenance" },
                ]}
              />
            </Field>
          </div>
          <div className="space-y-3 rounded-xl border border-border p-4">
            <ToggleRow label="Enabled" description="Disabled models are hidden everywhere and return model_not_found." checked={enabled} onChange={setEnabled} />
            <ToggleRow label="Featured" description="Highlighted on the homepage and at the top of the catalog." checked={featured} onChange={setFeatured} />
          </div>
        </section>

        {/* Routes */}
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <SectionLabel>Routes</SectionLabel>
              <p className="mt-1 text-xs text-muted-foreground">Lower priority is tried first. Routes with the same priority share traffic by weight; failures fall through to the next.</p>
            </div>
            <Button
              size="xs"
              variant="ghost"
              disabled={!providers.length}
              onClick={() => setRoutes((rs) => [...rs, { key: ++routeKey, providerId: providers[0]?.id ?? "", upstreamModel: publicId, priority: String(rs.length + 1), weight: "1", enabled: true }])}
            >
              <Plus /> Add route
            </Button>
          </div>
          {!providers.length ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Add a provider first (Admin → Providers), then route this model to it.</p>
          ) : !routes.length ? (
            <p className="rounded-lg border border-dashed border-warning/50 bg-warning-soft/30 px-3 py-3 text-xs text-muted-foreground">No routes — requests for this model will fail until you add one.</p>
          ) : (
            <div className="space-y-2.5">
              {routes.map((r, i) => (
                <RouteRow
                  key={r.key}
                  route={r}
                  providers={providers}
                  error={routeErrors[i]}
                  fallbackModel={publicId}
                  onChange={(patch) => setRoute(r.key, patch)}
                  onRemove={() => setRoutes((rs) => rs.filter((x) => x.key !== r.key))}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}

function RouteRow({
  route,
  providers,
  error,
  fallbackModel,
  onChange,
  onRemove,
}: {
  route: RouteForm;
  providers: Provider[];
  error: string | null;
  fallbackModel: string;
  onChange: (patch: Partial<RouteForm>) => void;
  onRemove: () => void;
}) {
  // Upstream model suggestions come from the provider's /models (same cache as "Test connection")
  const test = useProviderTest(route.providerId);
  const suggestions = useMemo(() => test.data?.models ?? [], [test.data]);
  const listId = `upstream-${route.key}`;
  const provider = providers.find((p) => p.id === route.providerId);

  return (
    <div className={cn("rounded-xl border bg-card p-3", error ? "border-danger/40" : "border-border", !route.enabled && "opacity-70")}>
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_76px_76px_auto]">
        <Field label={<span className="text-xs text-muted-foreground">Provider</span>}>
          <NativeSelect value={route.providerId} onChange={(e) => onChange({ providerId: e.target.value })} className="h-9 text-[13px]">
            {!provider && <option value="">Select…</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.enabled ? "" : " (disabled)"}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={<span className="text-xs text-muted-foreground">Upstream model</span>}>
          <div className="flex gap-1.5">
            <Input
              value={route.upstreamModel}
              list={suggestions.length ? listId : undefined}
              onChange={(e) => onChange({ upstreamModel: e.target.value })}
              placeholder={fallbackModel || "model id at the provider"}
              className="h-9 min-w-0 font-mono text-[12.5px]"
            />
            <Button
              size="icon-sm"
              variant="outline"
              className="size-9 shrink-0"
              aria-label="Load the provider's model list"
              title={suggestions.length ? `${suggestions.length} models loaded` : "Load the provider's model list"}
              disabled={!route.providerId}
              loading={test.isFetching}
              onClick={() => void test.refetch()}
            >
              {!test.isFetching && <Download />}
            </Button>
          </div>
          {suggestions.length > 0 && (
            <datalist id={listId}>
              {suggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
        </Field>
        <Field label={<span className="text-xs text-muted-foreground">Priority</span>}>
          <Input type="number" min={0} max={100} step={1} value={route.priority} onChange={(e) => onChange({ priority: e.target.value })} className="h-9 tabular" />
        </Field>
        <Field label={<span className="text-xs text-muted-foreground">Weight</span>}>
          <Input type="number" min={0} max={100} step={0.5} value={route.weight} onChange={(e) => onChange({ weight: e.target.value })} className="h-9 tabular" />
        </Field>
        <div className="flex items-end justify-between gap-2 sm:justify-end">
          <label className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={route.enabled} onCheckedChange={(v) => onChange({ enabled: v })} />
            On
          </label>
          <Button size="icon-sm" variant="ghost" className="size-9" aria-label="Remove route" onClick={onRemove}>
            <X />
          </Button>
        </div>
      </div>
      {(error || (test.data && !test.data.ok) || (provider && !provider.enabled)) && (
        <p className={cn("mt-2 text-xs", error || (test.data && !test.data.ok) ? "text-danger" : "text-warning")}>
          {error ?? (test.data && !test.data.ok ? `Couldn't load models: ${test.data.error || `HTTP ${test.data.status}`}` : "This provider is disabled, so the route is skipped.")}
        </p>
      )}
    </div>
  );
}
