"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, CircleAlert, Clock, Copy, EllipsisVertical, Eye, EyeOff, Gauge, HelpCircle, KeyRound, Pause, Pencil, Play, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { API_KEY_SCOPES, formatNumber, formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CopyButton, EmptyState, Field, Input, NativeSelect, PageHeader, Progress, Skeleton, Textarea } from "@/components/ui/primitives";
import { Dialog, DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "@/components/ui/overlay";
import { UnderlineTabs } from "@/components/ui/controls";
import { StatTile } from "@/components/dashboard/stat";
import { CodeTabs, quickstartSnippets } from "@/components/code-tabs";
import { api, errorMessage } from "@/lib/api";
import { useMe, useModels } from "@/lib/queries";
import type { ApiKeyInfo } from "@/lib/types";
import { API_BASE_URL, cn, copyText, formatDate, relativeTime } from "@/lib/utils";

type KeysResponse = {
  keys: ApiKeyInfo[];
  stats: { active: number; paused: number; revoked: number; requests: number; tokens: number; spendMicros: number; withLimits: number };
};

const SCOPE_LABEL: Record<string, string> = { inference: "Chat & completions", "models:read": "List models", embeddings: "Embeddings", images: "Images" };

function KeysPage() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "revoked">("active");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ApiKeyInfo | "new" | null>(null);
  const [created, setCreated] = useState<{ key: ApiKeyInfo; secret: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyInfo | null>(null);
  const [help, setHelp] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["keys"], queryFn: () => api<KeysResponse>("/api/keys") });

  useEffect(() => {
    if (params.get("create") === "1") {
      setEditing("new");
      router.replace("/dashboard/api-keys");
    }
  }, [params, router]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["keys"] });
  const list = useMemo(
    () =>
      (data?.keys ?? [])
        .filter((k) => (tab === "revoked" ? k.status === "revoked" : k.status !== "revoked"))
        .filter((k) => !q || k.name.toLowerCase().includes(q.toLowerCase()) || k.preview.includes(q)),
    [data, tab, q],
  );

  const setStatus = async (k: ApiKeyInfo, status: "active" | "paused") => {
    try {
      await api(`/api/keys/${k.id}`, { method: "PATCH", body: { status } });
      toast.success(status === "paused" ? `“${k.name}” paused` : `“${k.name}” resumed`);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const rotate = async (k: ApiKeyInfo) => {
    try {
      const r = await api<{ key: ApiKeyInfo; secret: string }>(`/api/keys/${k.id}/rotate`, { method: "POST" });
      setCreated(r);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title="API keys"
        description="Create a key for each app or teammate, and cap what each one can spend."
        actions={
          <>
            <Button variant="ghost" onClick={() => setHelp(true)}>
              <HelpCircle /> How keys work
            </Button>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus /> Create key
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active keys" loading={isLoading} value={data?.stats.active ?? 0} sub={`${data?.stats.paused ?? 0} paused`} />
        <StatTile label="Requests (all keys)" loading={isLoading} value={formatNumber(data?.stats.requests ?? 0)} sub="lifetime" />
        <StatTile label="Billed tokens" loading={isLoading} value={formatTokens(data?.stats.tokens ?? 0)} sub="lifetime" />
        <StatTile label="Cost at model price" loading={isLoading} value={formatUsd(data?.stats.spendMicros ?? 0)} sub={`${data?.stats.withLimits ?? 0} keys with limits`} />
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: "Active", count: (data?.stats.active ?? 0) + (data?.stats.paused ?? 0) },
            { value: "revoked", label: "Revoked", count: data?.stats.revoked ?? 0 },
          ]}
          className="flex-1 border-b-0"
        />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keys…" className="pl-9" />
        </div>
      </div>

      <Card className="mt-3 divide-y divide-border">
        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : !list.length ? (
          <EmptyState
            icon={<KeyRound />}
            title={tab === "revoked" ? "No revoked keys" : q ? "No keys match your search" : "No API keys yet"}
            description={tab === "active" && !q ? "Create a key to start calling the API." : undefined}
            action={tab === "active" && !q ? <Button variant="primary" onClick={() => setEditing("new")}><Plus /> Create key</Button> : undefined}
          />
        ) : (
          list.map((k) => <KeyRow key={k.id} k={k} onEdit={() => setEditing(k)} onPause={() => setStatus(k, k.status === "paused" ? "active" : "paused")} onRotate={() => rotate(k)} onRevoke={() => setRevoking(k)} />)
        )}
      </Card>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Use your key" description="Pass it as a Bearer token. Every OpenAI SDK works unchanged." />
          <CardBody>
            <CodeTabs snippets={quickstartSnippets(API_BASE_URL)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Limits that protect you" />
          <CardBody className="space-y-5">
            {[
              { icon: Gauge, t: "Token & spend caps", d: "Requests return a clear 429 / 402 the moment a key hits its cap — no surprise bills." },
              { icon: Clock, t: "Expiry dates", d: "Give contractors or demos a key that switches itself off." },
              { icon: ShieldCheck, t: "IP & model allowlists", d: "Lock a key to your servers and to the models it actually needs." },
              { icon: Pause, t: "Pause instantly", d: "Stop a leaked key in one click, resume when you're ready — or rotate it." },
            ].map((x) => (
              <div key={x.t} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <x.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{x.t}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{x.d}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {editing && (
        <KeyDialog
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            setEditing(null);
            refresh();
            if (r.secret) setCreated({ key: r.key, secret: r.secret });
            else toast.success("Key updated");
          }}
        />
      )}

      <Dialog
        open={Boolean(created)}
        onOpenChange={(o) => !o && setCreated(null)}
        title="Your new API key"
        description="Copy it now and store it somewhere safe. You can reveal it again later from this page."
        footer={<Button variant="primary" onClick={() => setCreated(null)}>Done</Button>}
      >
        {created && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/50 py-2 pl-3.5 pr-2">
              <code className="min-w-0 flex-1 break-all text-[13px]">{created.secret}</code>
              <CopyButton value={created.secret} label="API key" />
            </div>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <CircleAlert className="size-3.5 shrink-0 text-warning" /> Treat it like a password. Never put it in client-side code or public repos.
            </p>
            <CodeTabs snippets={quickstartSnippets(API_BASE_URL, created.secret)} maxHeight={220} />
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(revoking)}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke “${revoking?.name}”?`}
        description="Apps using this key will start getting 401 errors immediately. This can't be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api(`/api/keys/${revoking!.id}/revoke`, { method: "POST" });
                  toast.success("Key revoked");
                  refresh();
                } catch (e) {
                  toast.error(errorMessage(e));
                }
                setRevoking(null);
              }}
            >
              Revoke key
            </Button>
          </>
        }
      />

      <Dialog open={help} onOpenChange={setHelp} title="How API keys work" size="md">
        <div className="space-y-4 text-[13.5px] leading-relaxed text-muted-foreground">
          <p>Every request to <code className="text-foreground">/v1</code> needs a key in the <code className="text-foreground">Authorization: Bearer …</code> header. Usage from all keys counts toward your plan&apos;s monthly tokens and request-per-minute limit.</p>
          <p><b className="text-foreground">Scopes</b> decide which endpoints a key can call. <b className="text-foreground">Limits</b> (requests/min, tokens, spend at model price) apply per key on top of your plan.</p>
          <p><b className="text-foreground">Pause</b> blocks a key temporarily, <b className="text-foreground">Rotate</b> swaps the secret but keeps the same settings and stats, <b className="text-foreground">Revoke</b> disables it forever.</p>
          <p>Image endpoints are paid from your separate image wallet — top it up in Image Studio.</p>
        </div>
      </Dialog>
    </>
  );
}

function KeyRow({ k, onEdit, onPause, onRotate, onRevoke }: { k: ApiKeyInfo; onEdit: () => void; onPause: () => void; onRotate: () => void; onRevoke: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const revoked = k.status === "revoked";
  const tone = k.status === "active" ? "success" : k.status === "paused" ? "warning" : k.status === "expired" ? "danger" : "neutral";
  const toggleReveal = async () => {
    if (secret) return setSecret(null);
    try {
      setSecret((await api<{ secret: string }>(`/api/keys/${k.id}/reveal`)).secret);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const copy = async () => {
    const s = secret ?? (await api<{ secret: string }>(`/api/keys/${k.id}/reveal`)).secret;
    if (await copyText(s)) toast.success("API key copied");
  };

  return (
    <div className={cn("grid gap-5 p-5 md:grid-cols-[1.3fr_1fr_0.9fr_auto] md:items-center", revoked && "opacity-60")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[15px] font-semibold">{k.name}</p>
          <Badge tone={tone} dot>
            {k.status[0].toUpperCase() + k.status.slice(1)}
          </Badge>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <code className="truncate text-[12.5px] text-muted-foreground">{secret ?? k.preview}</code>
          {!revoked && (
            <>
              <Tooltip content={secret ? "Hide" : "Reveal"}>
                <button onClick={toggleReveal} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Reveal key">
                  {secret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </Tooltip>
              <Tooltip content="Copy">
                <button onClick={copy} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Copy key">
                  <Copy className="size-3.5" />
                </button>
              </Tooltip>
            </>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {k.scopes.map((s) => (
            <Badge key={s} tone="outline">
              {s}
            </Badge>
          ))}
          <Badge tone="outline">{k.rpm ? `${k.rpm} rpm` : "plan rpm"}</Badge>
          {k.allowedModels.length > 0 && <Badge tone="info">{k.allowedModels.length} models</Badge>}
          {k.ipAllowlist.length > 0 && <Badge tone="info">IP locked</Badge>}
        </div>
      </div>

      <div className="space-y-3 text-[13px]">
        <LimitLine label="Tokens" used={formatTokens(k.tokensUsed)} limit={k.tokenLimit ? formatTokens(k.tokenLimit) : null} pct={k.tokenLimit ? (k.tokensUsed / k.tokenLimit) * 100 : null} />
        <LimitLine label="Spend" used={formatUsd(k.spendMicros)} limit={k.spendLimitMicros ? formatUsd(k.spendLimitMicros) : null} pct={k.spendLimitMicros ? (k.spendMicros / k.spendLimitMicros) * 100 : null} />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] md:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Requests</dt>
        <dd className="font-medium tabular">{formatNumber(k.requests)}</dd>
        <dt className="text-muted-foreground">Last used</dt>
        <dd className="font-medium">{relativeTime(k.lastUsedAt)}</dd>
        <dt className="text-muted-foreground">Expires</dt>
        <dd className={cn("font-medium", k.status === "expired" && "text-danger")}>{k.expiresAt ? formatDate(k.expiresAt) : "never"}</dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd className="font-medium">{relativeTime(k.createdAt)}</dd>
      </dl>

      <div className="flex justify-end">
        {!revoked && (
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Key actions">
                <EllipsisVertical />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem onSelect={onEdit}>
                <Pencil /> Edit name & limits
              </DropdownItem>
              <DropdownItem onSelect={onPause}>{k.status === "paused" ? <><Play /> Resume</> : <><Pause /> Pause</>}</DropdownItem>
              <DropdownItem onSelect={onRotate}>
                <RefreshCw /> Rotate secret
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem danger onSelect={onRevoke}>
                <Ban /> Revoke
              </DropdownItem>
            </DropdownContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function LimitLine({ label, used, limit, pct }: { label: string; used: string; limit: string | null; pct: number | null }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular">
          {used}
          {limit ? <span className="font-normal text-muted-foreground"> / {limit}</span> : <span className="font-normal text-subtle-foreground"> · no limit</span>}
        </span>
      </div>
      {pct !== null && <Progress value={pct} className="mt-1.5 h-1" tone={pct >= 100 ? "danger" : pct > 80 ? "warning" : "accent"} />}
    </div>
  );
}

const EXPIRY = [
  { v: "never", label: "Never" },
  { v: "7", label: "In 7 days" },
  { v: "30", label: "In 30 days" },
  { v: "90", label: "In 90 days" },
  { v: "custom", label: "Custom date" },
];

function KeyDialog({ initial, onClose, onSaved }: { initial: ApiKeyInfo | null; onClose: () => void; onSaved: (r: { key: ApiKeyInfo; secret?: string }) => void }) {
  const { data: me } = useMe();
  const { data: models } = useModels();
  const planRpm = me?.entitlement.rpm ?? 60;
  const [name, setName] = useState(initial?.name ?? "");
  const [scopes, setScopes] = useState<string[]>(initial?.scopes ?? [...API_KEY_SCOPES]);
  const [rpm, setRpm] = useState(initial?.rpm ? String(initial.rpm) : "");
  const [tokenLimit, setTokenLimit] = useState(initial?.tokenLimit ? String(initial.tokenLimit) : "");
  const [spendLimit, setSpendLimit] = useState(initial?.spendLimitMicros ? String(initial.spendLimitMicros / 1e6) : "");
  const [expiry, setExpiry] = useState(initial?.expiresAt ? "custom" : "never");
  const [expiryDate, setExpiryDate] = useState(initial?.expiresAt ? initial.expiresAt.slice(0, 10) : "");
  const [allowed, setAllowed] = useState<string[]>(initial?.allowedModels ?? []);
  const [ips, setIps] = useState((initial?.ipAllowlist ?? []).join("\n"));
  const [advanced, setAdvanced] = useState(Boolean(initial && (initial.allowedModels.length || initial.ipAllowlist.length)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Give the key a name");
    if (!scopes.length) return setError("Pick at least one scope");
    let expiresAt: string | null = null;
    if (expiry === "custom") {
      if (!expiryDate) return setError("Pick an expiry date");
      expiresAt = new Date(`${expiryDate}T23:59:59`).toISOString();
    } else if (expiry !== "never") expiresAt = new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
    const body = {
      name: name.trim(),
      scopes,
      rpm: rpm ? Math.min(Number(rpm), 100_000) : null,
      tokenLimit: tokenLimit ? Number(tokenLimit) : null,
      spendLimitUsd: spendLimit ? Number(spendLimit) : null,
      expiresAt,
      allowedModels: allowed,
      ipAllowlist: ips.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
    };
    setSaving(true);
    try {
      const r = initial ? await api<{ key: ApiKeyInfo }>(`/api/keys/${initial.id}`, { method: "PATCH", body }) : await api<{ key: ApiKeyInfo; secret: string }>("/api/keys", { body });
      onSaved(r);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? "Edit key" : "Create API key"}
      description={initial ? "Changes apply within a few seconds." : "Name it after the app or person using it."}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {initial ? "Save changes" : "Create key"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production backend" maxLength={60} />
        </Field>
        <Field label="Scopes">
          <div className="grid gap-2 sm:grid-cols-2">
            {API_KEY_SCOPES.map((s) => {
              const on = scopes.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScopes((cur) => (on ? cur.filter((x) => x !== s) : [...cur, s]))}
                  className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors", on ? "border-accent/60 bg-accent-soft/50" : "border-border hover:bg-muted/50")}
                >
                  <span>
                    <span className="font-mono text-xs">{s}</span>
                    <span className="block text-xs text-muted-foreground">{SCOPE_LABEL[s]}</span>
                  </span>
                  <span className={cn("flex size-4 items-center justify-center rounded border", on ? "border-accent bg-accent text-white" : "border-border-strong")}>{on && <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>}</span>
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Requests / min" hint={`Plan limit: ${planRpm}`}>
            <Input type="number" min={1} value={rpm} onChange={(e) => setRpm(e.target.value)} placeholder={`${planRpm}`} />
          </Field>
          <Field label="Token limit" hint="Lifetime, billed tokens">
            <Input type="number" min={1} value={tokenLimit} onChange={(e) => setTokenLimit(e.target.value)} placeholder="No limit" />
          </Field>
          <Field label="Spend limit (USD)" hint="At model price">
            <Input type="number" min={0.01} step="0.01" value={spendLimit} onChange={(e) => setSpendLimit(e.target.value)} placeholder="No limit" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expires">
            <NativeSelect value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              {EXPIRY.map((x) => (
                <option key={x.v} value={x.v}>
                  {x.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {expiry === "custom" && (
            <Field label="Expiry date">
              <Input type="date" value={expiryDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiryDate(e.target.value)} />
            </Field>
          )}
        </div>

        <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-[13px] font-medium text-accent hover:underline">
          {advanced ? "Hide" : "Show"} model & IP restrictions
        </button>
        {advanced && (
          <div className="space-y-5 rounded-xl border border-border p-4">
            <Field label="Allowed models" hint={allowed.length ? `${allowed.length} selected — other models return 403` : "All models allowed"}>
              <div className="flex flex-wrap gap-1.5">
                {(models ?? []).map((m) => {
                  const on = allowed.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setAllowed((cur) => (on ? cur.filter((x) => x !== m.id) : [...cur, m.id]))}
                      className={cn("rounded-md border px-2 py-1 font-mono text-[11.5px] transition-colors", on ? "border-accent bg-accent-soft text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
                    >
                      {m.id}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="IP allowlist" hint="One IPv4/IPv6 address per line. Leave empty to allow any IP.">
              <Textarea value={ips} onChange={(e) => setIps(e.target.value)} placeholder={"203.0.113.10\n198.51.100.7"} className="min-h-20 font-mono text-xs" />
            </Field>
          </div>
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense>
      <KeysPage />
    </Suspense>
  );
}
