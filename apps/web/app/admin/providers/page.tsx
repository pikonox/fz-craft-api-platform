"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleCheck, CircleX, KeyRound, MoreHorizontal, Pencil, Plug, Plus, Power, RotateCcw, Scale, Server, Trash2, X } from "lucide-react";
import { formatMs, formatNumber } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CopyButton, EmptyState, Field, Input, PageHeader, Skeleton, StatusDot } from "@/components/ui/primitives";
import { Dialog, DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "@/components/ui/overlay";
import { Switch } from "@/components/ui/controls";
import { qk, useAdminProviders, useProviderTest } from "@/components/admin/queries";
import { ConfirmDialog, SectionLabel, TD, Table, ToggleRow, num, useAction } from "@/components/admin/ui";
import type { Provider, ProviderKey } from "@/components/admin/types";
import { api, errorMessage } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";

const INVALIDATE = [qk.providers, ["admin", "stats"]];

export default function ProvidersPage() {
  const { data: providers, isLoading } = useAdminProviders();
  const [editing, setEditing] = useState<Provider | "new" | null>(null);

  return (
    <div>
      <PageHeader
        title="Providers"
        description="Upstream OpenAI-compatible endpoints and their API key pools. Keys are load-balanced by weight and cool down automatically after errors."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus /> Add provider
          </Button>
        }
      />
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : !providers?.length ? (
        <Card>
          <EmptyState
            icon={<Server />}
            title="No providers yet"
            description="Add an upstream endpoint such as https://api.example.com/v1, then add one or more API keys."
            action={
              <Button variant="primary" onClick={() => setEditing("new")}>
                <Plus /> Add provider
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {providers.map((p) => (
            <ProviderCard key={p.id} p={p} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}
      <ProviderDialog provider={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ProviderCard({ p, onEdit }: { p: Provider; onEdit: () => void }) {
  const qc = useQueryClient();
  const test = useProviderTest(p.id);
  const [addKey, setAddKey] = useState(false);
  const [editKey, setEditKey] = useState<ProviderKey | null>(null);
  const [delKey, setDelKey] = useState<ProviderKey | null>(null);
  const [delProvider, setDelProvider] = useState(false);

  const toggle = useAction((enabled: boolean) => api(`/api/admin/providers/${p.id}`, { method: "PATCH", body: { enabled } }), {
    success: (_r, v) => `${p.name} ${v ? "enabled" : "disabled"}`,
    invalidate: INVALIDATE,
  });
  const keyPatch = useAction(
    ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/api/admin/provider-keys/${id}`, { method: "PATCH", body }),
    { success: (_r, v) => (v.body.resetHealth ? "Key health reset" : v.body.status ? `Key ${v.body.status === "active" ? "enabled" : "disabled"}` : "Key updated"), invalidate: INVALIDATE },
  );
  const removeKey = useAction((id: string) => api(`/api/admin/provider-keys/${id}`, { method: "DELETE" }), { success: "Key deleted", invalidate: INVALIDATE, onSuccess: () => setDelKey(null) });
  const removeProvider = useAction(() => api(`/api/admin/providers/${p.id}`, { method: "DELETE" }), { success: `${p.name} deleted`, invalidate: [...INVALIDATE, qk.models], onSuccess: () => setDelProvider(false) });

  const runTest = async () => {
    const r = await test.refetch();
    if (r.error) toast.error(errorMessage(r.error));
    else if (r.data?.ok) toast.success(`Connected · ${formatMs(r.data.latencyMs)} · ${r.data.models.length} models`);
    else if (r.data) toast.error(`Upstream answered ${r.data.status || "with an error"}`);
  };

  const active = p.keys.filter((k) => k.status === "active");
  const cooling = active.filter((k) => !k.healthy).length;
  const headerKeys = Object.keys(p.headers ?? {});
  const t = test.data;

  return (
    <Card className={cn("overflow-hidden", !p.enabled && "opacity-80")}>
      <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight">{p.name}</h3>
            <Badge tone="outline">{p.slug}</Badge>
            {!p.enabled ? (
              <Badge tone="neutral">Disabled</Badge>
            ) : !active.length ? (
              <Badge tone="danger" dot>
                No active keys
              </Badge>
            ) : cooling ? (
              <Badge tone="warning" dot>
                {cooling} cooling down
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Healthy
              </Badge>
            )}
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-1">
            <code className="truncate font-mono text-xs text-muted-foreground">{p.baseUrl}</code>
            <CopyButton value={p.baseUrl} label="Base URL" size="xs" />
          </div>
          {p.notes && <p className="mt-1 max-w-2xl text-xs text-subtle-foreground">{p.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="mr-1 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Switch checked={p.enabled} onCheckedChange={(v) => toggle.mutate(v)} disabled={toggle.isPending} />
            Enabled
          </label>
          <Button size="sm" variant="outline" onClick={runTest} loading={test.isFetching}>
            {!test.isFetching && <Plug />} Test connection
          </Button>
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Provider actions">
                <MoreHorizontal />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem onSelect={onEdit}>
                <Pencil /> Edit provider
              </DropdownItem>
              <DropdownItem onSelect={() => setAddKey(true)}>
                <KeyRound /> Add key
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem danger onSelect={() => setDelProvider(true)}>
                <Trash2 /> Delete provider
              </DropdownItem>
            </DropdownContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-px border-b border-border bg-border sm:grid-cols-3">
        <Meta label="Timeout">{Math.round(p.timeoutMs / 1000)}s</Meta>
        <Meta label="Keys">
          {active.length} active{p.keys.length > active.length ? ` · ${p.keys.length - active.length} disabled` : ""}
        </Meta>
        <Meta label="Extra headers">
          {headerKeys.length ? (
            <span className="flex flex-wrap gap-1">
              {headerKeys.map((h) => (
                <code key={h} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {h}
                </code>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </Meta>
      </div>

      {t && (
        <div className={cn("border-b border-border px-5 py-4", t.ok ? "bg-success-soft/40" : "bg-danger-soft/50")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <span className={cn("inline-flex items-center gap-1.5 font-medium", t.ok ? "text-success" : "text-danger")}>
              {t.ok ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
              {t.ok ? "Connection OK" : "Connection failed"}
            </span>
            <span className="text-muted-foreground">HTTP {t.status || "—"}</span>
            <span className="text-muted-foreground tabular">{formatMs(t.latencyMs)}</span>
            <span className="text-muted-foreground">{t.models.length} upstream models</span>
            <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Hide test result" onClick={() => void qc.resetQueries({ queryKey: qk.providerTest(p.id) })}>
              <X />
            </Button>
          </div>
          {t.error && <p className="mt-2 break-all font-mono text-xs text-danger">{t.error}</p>}
          {t.models.length > 0 && (
            <div className="scrollbar-thin mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {t.models.map((m) => (
                <span key={m} className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card py-0.5 pl-2 pr-0.5 font-mono text-[11px]">
                  {m}
                  <CopyButton value={m} label="Model id" size="xs" className="size-5" />
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <SectionLabel>API keys</SectionLabel>
        <Button size="xs" variant="outline" onClick={() => setAddKey(true)}>
          <Plus /> Add key
        </Button>
      </div>
      {!p.keys.length ? (
        <EmptyState icon={<KeyRound />} title="No keys in this pool" description="Requests can't be routed to this provider until you add a key." className="py-10" />
      ) : (
        <Table head={["Key", "Weight", "Status", "Health", "Fails", "Last error", "Success / fail", "Last used", ""]} minWidth={1000}>
          {p.keys.map((k) => (
            <tr key={k.id} className="border-t border-border">
              <td className={TD}>
                <p className="font-medium">{k.label || "Untitled key"}</p>
                <code className="font-mono text-[11px] text-muted-foreground">••••{k.last4}</code>
              </td>
              <td className={cn(TD, "tabular")}>{k.weight}</td>
              <td className={TD}>
                <Badge tone={k.status === "active" ? "success" : "neutral"}>{k.status === "active" ? "Active" : "Disabled"}</Badge>
              </td>
              <td className={cn(TD, "whitespace-nowrap")}>
                {k.healthy ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <StatusDot tone="success" /> Healthy
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-warning">
                    <StatusDot tone="warning" pulse /> Cooling · {relativeTime(k.cooldownUntil)}
                  </span>
                )}
              </td>
              <td className={cn(TD, "tabular", k.failStreak > 0 && "text-danger")}>{k.failStreak}</td>
              <td className={cn(TD, "max-w-[220px]")}>
                {k.lastError ? (
                  <Tooltip content={k.lastError}>
                    <p className="truncate text-xs text-danger">
                      {k.lastError}
                      {k.lastErrorAt && <span className="text-subtle-foreground"> · {relativeTime(k.lastErrorAt)}</span>}
                    </p>
                  </Tooltip>
                ) : (
                  <span className="text-subtle-foreground">—</span>
                )}
              </td>
              <td className={cn(TD, "whitespace-nowrap tabular")}>
                <span className="text-success">{formatNumber(k.successCount)}</span>
                <span className="text-subtle-foreground"> / </span>
                <span className={k.failCount ? "text-danger" : "text-muted-foreground"}>{formatNumber(k.failCount)}</span>
              </td>
              <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{relativeTime(k.lastUsedAt)}</td>
              <td className={cn(TD, "text-right")}>
                <DropdownMenu>
                  <DropdownTrigger asChild>
                    <Button size="icon-xs" variant="ghost" aria-label="Key actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent>
                    <DropdownItem onSelect={() => keyPatch.mutate({ id: k.id, body: { status: k.status === "active" ? "disabled" : "active" } })}>
                      <Power /> {k.status === "active" ? "Disable key" : "Enable key"}
                    </DropdownItem>
                    <DropdownItem onSelect={() => keyPatch.mutate({ id: k.id, body: { resetHealth: true } })}>
                      <RotateCcw /> Reset health
                    </DropdownItem>
                    <DropdownItem onSelect={() => setEditKey(k)}>
                      <Scale /> Edit label & weight
                    </DropdownItem>
                    <DropdownSeparator />
                    <DropdownItem danger onSelect={() => setDelKey(k)}>
                      <Trash2 /> Delete key
                    </DropdownItem>
                  </DropdownContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <AddKeyDialog provider={p} open={addKey} onOpenChange={setAddKey} />
      <EditKeyDialog k={editKey} onClose={() => setEditKey(null)} />
      <ConfirmDialog open={Boolean(delKey)} onOpenChange={(o) => !o && setDelKey(null)} title="Delete this key?" description={`${delKey?.label || "Untitled key"} · ••••${delKey?.last4 ?? ""}`} confirmLabel="Delete key" loading={removeKey.isPending} onConfirm={() => delKey && removeKey.mutate(delKey.id)} />
      <ConfirmDialog open={delProvider} onOpenChange={setDelProvider} title={`Delete ${p.name}?`} description="The provider and all its keys are removed." confirmLabel="Delete provider" loading={removeProvider.isPending} onConfirm={() => removeProvider.mutate()}>
        <p className="text-sm text-muted-foreground">Models that still route to this provider block the delete. Remove those routes on the Models page first.</p>
      </ConfirmDialog>
    </Card>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card px-5 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">{label}</p>
      <div className="mt-1 text-[13px] font-medium">{children}</div>
    </div>
  );
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

function ProviderDialog({ provider, onClose }: { provider: Provider | "new" | null; onClose: () => void }) {
  const isNew = provider === "new";
  const p = provider && provider !== "new" ? provider : null;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [timeout, setTimeoutS] = useState("120");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [headers, setHeaders] = useState<{ k: string; v: string }[]>([]);

  useEffect(() => {
    if (!provider) return;
    setName(p?.name ?? "");
    setSlug(p?.slug ?? "");
    setSlugTouched(Boolean(p));
    setBaseUrl(p?.baseUrl ?? "");
    setTimeoutS(String(Math.round((p?.timeoutMs ?? 120_000) / 1000)));
    setNotes(p?.notes ?? "");
    setEnabled(p?.enabled ?? true);
    setHeaders(Object.entries(p?.headers ?? {}).map(([k, v]) => ({ k, v })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const urlOk = /^https?:\/\/\S+$/.test(baseUrl.trim());
  const slugOk = /^[a-z0-9-]+$/.test(slug);
  const t = num(timeout);
  const timeoutOk = t >= 5 && t <= 600;
  const valid = name.trim() && slugOk && urlOk && timeoutOk;

  const save = useAction(
    () => {
      const body = {
        name: name.trim(),
        slug,
        baseUrl: baseUrl.trim().replace(/\/+$/, ""),
        timeoutMs: Math.round(t * 1000),
        notes,
        enabled,
        headers: Object.fromEntries(headers.filter((h) => h.k.trim()).map((h) => [h.k.trim(), h.v])),
      };
      return p ? api(`/api/admin/providers/${p.id}`, { method: "PATCH", body }) : api(`/api/admin/providers`, { body });
    },
    { success: isNew ? "Provider added. Now add an API key." : "Provider saved", invalidate: INVALIDATE, onSuccess: onClose },
  );

  return (
    <Dialog
      open={Boolean(provider)}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={isNew ? "Add provider" : `Edit ${p?.name ?? "provider"}`}
      description="Any OpenAI-compatible endpoint. The gateway calls {base URL}/chat/completions, /images/generations, /embeddings and /models."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {isNew ? "Add provider" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="e.g. Primary pool"
              maxLength={60}
            />
          </Field>
          <Field label="Slug" error={slug && !slugOk ? "Lowercase letters, numbers and dashes" : null} hint="Shown in logs">
            <Input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugTouched(true);
              }}
              placeholder="primary-pool"
              maxLength={40}
              className="font-mono text-[13px]"
            />
          </Field>
        </div>
        <Field label="Base URL" error={baseUrl && !urlOk ? "Enter a full URL, e.g. https://api.example.com/v1" : null}>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" className="font-mono text-[13px]" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Timeout (seconds)" error={!timeoutOk ? "5–600 seconds" : null}>
            <Input type="number" min={5} max={600} value={timeout} onChange={(e) => setTimeoutS(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Optional, for admins" />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium">Extra headers</p>
            <Button size="xs" variant="ghost" onClick={() => setHeaders((h) => [...h, { k: "", v: "" }])}>
              <Plus /> Add header
            </Button>
          </div>
          {!headers.length ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">No extra headers. Authorization: Bearer &lt;key&gt; is always sent.</p>
          ) : (
            <div className="space-y-2">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={h.k} onChange={(e) => setHeaders((hs) => hs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} placeholder="Header name" className="h-9 font-mono text-[12.5px]" />
                  <Input value={h.v} onChange={(e) => setHeaders((hs) => hs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} placeholder="Value" className="h-9 font-mono text-[12.5px]" />
                  <Button size="icon-sm" variant="ghost" aria-label="Remove header" onClick={() => setHeaders((hs) => hs.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <ToggleRow label="Enabled" description="Disabled providers are skipped by every model route." checked={enabled} onChange={setEnabled} className="border-t border-border pt-4" />
      </div>
    </Dialog>
  );
}

function AddKeyDialog({ provider, open, onOpenChange }: { provider: Provider; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [weight, setWeight] = useState("1");
  useEffect(() => {
    if (open) {
      setLabel("");
      setKey("");
      setWeight("1");
    }
  }, [open]);
  const w = num(weight, -1);
  const valid = key.trim().length >= 4 && w >= 0 && w <= 100;
  const add = useAction(() => api(`/api/admin/providers/${provider.id}/keys`, { body: { key: key.trim(), label: label.trim(), weight: w } }), {
    success: "Key added to the pool",
    invalidate: INVALIDATE,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add API key"
      description={`Added to ${provider.name}. Keys are encrypted at rest; only the last 4 characters are shown again.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={add.isPending} onClick={() => add.mutate()}>
            Add key
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="API key">
          <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" className="font-mono text-[13px]" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="e.g. Account 2" />
          </Field>
          <Field label="Weight" hint="0–100" error={w < 0 || w > 100 ? "0–100" : null}>
            <Input type="number" min={0} max={100} step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function EditKeyDialog({ k, onClose }: { k: ProviderKey | null; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [weight, setWeight] = useState("1");
  useEffect(() => {
    if (k) {
      setLabel(k.label);
      setWeight(String(k.weight));
    }
  }, [k]);
  const w = num(weight, -1);
  const save = useAction(() => api(`/api/admin/provider-keys/${k?.id}`, { method: "PATCH", body: { label: label.trim(), weight: w } }), {
    success: "Key updated",
    invalidate: INVALIDATE,
    onSuccess: onClose,
  });
  return (
    <Dialog
      open={Boolean(k)}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Edit key"
      description={`••••${k?.last4 ?? ""} · a higher weight gets a bigger share of traffic.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={w < 0 || w > 100} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Weight" hint="0 takes the key out of rotation without disabling it." error={w < 0 || w > 100 ? "0–100" : null}>
          <Input type="number" min={0} max={100} step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
