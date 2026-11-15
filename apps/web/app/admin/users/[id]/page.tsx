"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, Gift, KeyRound, MoreHorizontal, ReceiptText, Shield, ShieldOff, UserCheck, UserX, Wallet } from "lucide-react";
import { formatNumber, formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, CardBody, CardHeader, CopyButton, EmptyState, Field, Input, NativeSelect, Progress, Skeleton, Textarea } from "@/components/ui/primitives";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Dialog } from "@/components/ui/overlay";
import { Segmented, UnderlineTabs } from "@/components/ui/controls";
import { StatTile } from "@/components/dashboard/stat";
import { useAdminPlans, qk } from "@/components/admin/queries";
import { purposeLabel } from "@/components/admin/payment-dialog";
import { ConfirmDialog, KV, PaymentStatusBadge, TD, Table, num, useAction } from "@/components/admin/ui";
import type { AdminUserDetail } from "@/components/admin/types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { cn, formatDate, formatDateTime, relativeTime } from "@/lib/utils";

type Tab = "keys" | "payments" | "transactions";

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery({ queryKey: qk.user(id), queryFn: () => api<AdminUserDetail>(`/api/admin/users/${id}`) });
  const [tab, setTab] = useState<Tab>("keys");
  const [dialog, setDialog] = useState<null | "adjust" | "plan" | "ban" | "role">(null);
  const [revoke, setRevoke] = useState<{ id: string; name: string } | null>(null);
  const invalidate = [qk.user(id), qk.users, ["admin", "stats"]];

  const patch = useAction((body: { role?: "user" | "admin"; status?: "active" | "banned" }) => api(`/api/admin/users/${id}`, { method: "PATCH", body }), {
    success: (_r, b) => (b.status === "banned" ? "User banned" : b.status === "active" ? "User unbanned" : b.role === "admin" ? "User is now an admin" : "Admin access removed"),
    invalidate,
    onSuccess: () => setDialog(null),
  });
  const revokeKey = useAction((keyId: string) => api(`/api/admin/keys/${keyId}/revoke`, { method: "POST" }), {
    success: "API key revoked",
    invalidate,
    onSuccess: () => setRevoke(null),
  });

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={<UserX />}
          title={error instanceof ApiError && error.status === 404 ? "User not found" : "Couldn't load this user"}
          description={error.message}
          action={
            <Button variant="outline" asChild>
              <Link href="/admin/users">Back to users</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const u = data?.user;
  const e = data?.entitlement;
  const isSelf = me?.user.id === id;
  const banned = u?.status === "banned";
  const isAdmin = u?.role === "admin";
  const usage = data?.usage30d;

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Users
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {u ? <Avatar name={u.name} email={u.email} className="size-12 rounded-xl text-sm" /> : <Skeleton className="size-12 rounded-xl" />}
          <div className="min-w-0">
            {u ? (
              <>
                <h1 className="truncate text-[22px] font-semibold tracking-tight sm:text-2xl">{u.name || u.email}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                  <span className="truncate">{u.email}</span>
                  {isAdmin && <Badge tone="accent">Admin</Badge>}
                  {banned ? <Badge tone="danger" dot>Banned</Badge> : <Badge tone="success" dot>Active</Badge>}
                  {!u.emailVerified && <Badge tone="warning">Email unverified</Badge>}
                  {u.telegram.verified && <Badge tone="info">Telegram @{u.telegram.username}</Badge>}
                </div>
              </>
            ) : (
              <>
                <Skeleton className="h-7 w-56" />
                <Skeleton className="mt-2 h-4 w-72" />
              </>
            )}
          </div>
        </div>
        {u && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog("adjust")}>
              <Wallet /> Adjust balance
            </Button>
            <Button variant="outline" onClick={() => setDialog("plan")}>
              <Gift /> Grant plan
            </Button>
            <DropdownMenu>
              <DropdownTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownItem disabled={isSelf && isAdmin} onSelect={() => setDialog("role")}>
                  {isAdmin ? <ShieldOff /> : <Shield />} {isAdmin ? "Remove admin access" : "Make admin"}
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem danger={!banned} disabled={isSelf} onSelect={() => setDialog("ban")}>
                  {banned ? <UserCheck /> : <Ban />} {banned ? "Unban user" : "Ban user"}
                </DropdownItem>
              </DropdownContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Main balance" loading={isLoading} value={formatUsd(u?.mainBalance ?? 0)} sub="Used for plans and API overage" />
        <StatTile label="Image wallet" loading={isLoading} value={formatUsd(u?.imageBalance ?? 0)} sub={data ? `${formatNumber(data.imageGenerations)} image generations` : undefined} />
        <StatTile label="Tokens left" loading={isLoading} value={formatTokens(e?.remainingTokens ?? 0)} sub={e ? `${formatTokens(e.usedTokens)} of ${formatTokens(e.totalTokens)} used` : undefined} />
        <StatTile label="Requests · 30 days" loading={isLoading} value={formatNumber(usage?.requests ?? 0)} sub={usage ? `${formatTokens(usage.billedTokens)} tokens · ${formatUsd(usage.costMicros)} at model price` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="py-2">
            {!u ? (
              <div className="space-y-3 py-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-5" />
                ))}
              </div>
            ) : (
              <>
                <KV label="User ID">
                  <span className="inline-flex items-center gap-1">
                    <code className="font-mono text-xs text-muted-foreground">{u.id}</code>
                    <CopyButton value={u.id} label="User ID" size="xs" />
                  </span>
                </KV>
                <KV label="Phone">{u.phone || "—"}</KV>
                <KV label="Referral code">{u.referralCode}</KV>
                <KV label="Joined">{formatDateTime(u.createdAt)}</KV>
                <KV label="Last login">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</KV>
                <KV label="Telegram">{u.telegram.verified ? `@${u.telegram.username}${u.telegramId ? ` · ${u.telegramId}` : ""}` : "Not linked"}</KV>
                <KV label="Sign-in">{[u.hasPassword && "Password", u.googleLinked && "Google", u.twoFactorEnabled && "2FA"].filter(Boolean).join(" · ") || "—"}</KV>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Entitlement" description={e ? `${e.rpm} requests / min · ${e.access} model access` : undefined} action={e && <Badge tone={e.isPaid ? "accent" : "neutral"}>{e.isPaid ? "Paid" : "Free tier"}</Badge>} />
          <CardBody className="space-y-5">
            {!e ? (
              <Skeleton className="h-28" />
            ) : (
              <>
                {[e.plan, e.pass].filter(Boolean).map((s) => {
                  const sub = s!;
                  const pct = sub.tokensLimit ? (sub.tokensUsed / sub.tokensLimit) * 100 : 0;
                  return (
                    <div key={sub.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[13.5px] font-medium">
                          {sub.name} <span className="font-normal text-muted-foreground">· {sub.kind === "pass" ? "pass" : sub.cycle}</span>
                        </p>
                        <p className="text-xs text-muted-foreground tabular">
                          {formatTokens(sub.tokensUsed)} / {formatTokens(sub.tokensLimit)}
                        </p>
                      </div>
                      <Progress value={pct} className="mt-2" tone={pct > 90 ? "danger" : pct > 75 ? "warning" : "accent"} />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {sub.isFree ? "Resets" : "Quota resets"} {formatDate(sub.periodEndsAt)} · term ends {formatDate(sub.termEndsAt)}
                        {sub.autoRenew && !sub.isFree ? " · auto-renews" : ""}
                      </p>
                    </div>
                  );
                })}
                {!e.plan && !e.pass && <p className="text-sm text-muted-foreground">No active subscription.</p>}
                <div className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-[13px]">
                  <div>
                    <p className="text-xs text-muted-foreground">Bonus tokens</p>
                    <p className="mt-0.5 font-semibold tabular">{formatTokens(e.bonusTokens)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="mt-0.5 font-semibold tabular">{formatTokens(e.totalTokens)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="mt-0.5 font-semibold tabular">{formatTokens(e.remainingTokens)}</p>
                  </div>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div>
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "keys", label: "API keys", count: data?.keys.length },
            { value: "payments", label: "Payments", count: data?.payments.length },
            { value: "transactions", label: "Transactions", count: data?.transactions.length },
          ]}
          className="mb-4"
        />
        <Card className="overflow-hidden">
          {isLoading || !data ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-6" />
              <Skeleton className="h-6" />
              <Skeleton className="h-6" />
            </div>
          ) : tab === "keys" ? (
            !data.keys.length ? (
              <EmptyState icon={<KeyRound />} title="No API keys" />
            ) : (
              <Table head={["Name", "Key", "Status", "Requests", "Tokens", "Last used", ""]} minWidth={760}>
                {data.keys.map((k) => (
                  <tr key={k.id} className="border-t border-border">
                    <td className={cn(TD, "font-medium")}>{k.name}</td>
                    <td className={TD}>
                      <code className="font-mono text-xs text-muted-foreground">{k.preview}</code>
                    </td>
                    <td className={TD}>
                      <Badge tone={k.status === "active" ? "success" : k.status === "paused" ? "warning" : "danger"}>{k.status}</Badge>
                    </td>
                    <td className={cn(TD, "tabular")}>{formatNumber(k.requests)}</td>
                    <td className={cn(TD, "tabular")}>{formatTokens(k.tokensUsed)}</td>
                    <td className={cn(TD, "text-muted-foreground")}>{relativeTime(k.lastUsedAt)}</td>
                    <td className={cn(TD, "text-right")}>
                      {k.status !== "revoked" && (
                        <Button size="xs" variant="danger-ghost" onClick={() => setRevoke({ id: k.id, name: k.name })}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )
          ) : tab === "payments" ? (
            !data.payments.length ? (
              <EmptyState icon={<ReceiptText />} title="No payments" />
            ) : (
              <Table head={["Created", "Amount", "Method", "Purpose", "Reference", "Status"]} minWidth={760}>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-t border-border transition-colors hover:bg-muted/40">
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <Link href={`/admin/payments?id=${p.id}`} className="text-accent hover:underline">
                        {formatDateTime(p.createdAt)}
                      </Link>
                    </td>
                    <td className={cn(TD, "font-medium tabular")}>{formatUsd(p.amountMicros)}</td>
                    <td className={TD}>{p.methodLabel}</td>
                    <td className={cn(TD, "text-muted-foreground")}>{purposeLabel(p)}</td>
                    <td className={TD}>
                      <code className="block max-w-[160px] truncate font-mono text-xs text-muted-foreground">{p.reference || "—"}</code>
                    </td>
                    <td className={TD}>
                      <PaymentStatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            )
          ) : !data.transactions.length ? (
            <EmptyState icon={<ReceiptText />} title="No transactions" />
          ) : (
            <Table head={["Date", "Description", "Type", "Wallet", <th key="a" className="px-3 py-2.5 pr-5 text-right font-medium">Amount</th>]} minWidth={700}>
              {data.transactions.map((t) => {
                const tokens = t.wallet === "tokens";
                const v = tokens ? t.tokens : t.amountMicros;
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{formatDateTime(t.createdAt)}</td>
                    <td className={cn(TD, "font-medium")}>{t.description}</td>
                    <td className={TD}>
                      <Badge tone="outline">{t.type.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className={cn(TD, "text-muted-foreground")}>{t.wallet}</td>
                    <td className={cn(TD, "text-right font-medium tabular", v > 0 ? "text-success" : v < 0 ? "text-danger" : "")}>
                      {tokens ? `${v > 0 ? "+" : ""}${formatTokens(v)} tokens` : formatUsd(v, { sign: true })}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>

      {u && (
        <>
          <AdjustDialog userId={id} open={dialog === "adjust"} onOpenChange={(o) => setDialog(o ? "adjust" : null)} />
          <GrantPlanDialog userId={id} open={dialog === "plan"} onOpenChange={(o) => setDialog(o ? "plan" : null)} />
          <ConfirmDialog
            open={dialog === "ban"}
            onOpenChange={(o) => setDialog(o ? "ban" : null)}
            title={banned ? "Unban this user?" : "Ban this user?"}
            description={u.email}
            confirmLabel={banned ? "Unban" : "Ban user"}
            danger={!banned}
            loading={patch.isPending}
            onConfirm={() => patch.mutate({ status: banned ? "active" : "banned" })}
          >
            <p className="text-sm text-muted-foreground">{banned ? "They can sign in and use their API keys again." : "They are signed out, can't sign in, and every API request with their keys is refused."}</p>
          </ConfirmDialog>
          <ConfirmDialog
            open={dialog === "role"}
            onOpenChange={(o) => setDialog(o ? "role" : null)}
            title={isAdmin ? "Remove admin access?" : "Make this user an admin?"}
            description={u.email}
            confirmLabel={isAdmin ? "Remove admin" : "Make admin"}
            danger={isAdmin}
            loading={patch.isPending}
            onConfirm={() => patch.mutate({ role: isAdmin ? "user" : "admin" })}
          >
            <p className="text-sm text-muted-foreground">{isAdmin ? "They lose access to this admin panel." : "Admins can approve payments, change prices, manage users and see every request log."}</p>
          </ConfirmDialog>
          <ConfirmDialog
            open={Boolean(revoke)}
            onOpenChange={(o) => !o && setRevoke(null)}
            title="Revoke API key?"
            description={revoke?.name}
            confirmLabel="Revoke key"
            loading={revokeKey.isPending}
            onConfirm={() => revoke && revokeKey.mutate(revoke.id)}
          >
            <p className="text-sm text-muted-foreground">Requests with this key fail immediately. The user can create a new key.</p>
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}

function AdjustDialog({ userId, open, onOpenChange }: { userId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [wallet, setWallet] = useState<"main" | "image" | "tokens">("main");
  const [dir, setDir] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setWallet("main");
      setDir("add");
      setAmount("");
      setNote("");
    }
  }, [open]);
  const value = Math.abs(num(amount));
  const signed = (dir === "add" ? 1 : -1) * (wallet === "tokens" ? Math.round(value) : value);
  const valid = value > 0 && note.trim().length >= 2;
  const adjust = useAction(() => api(`/api/admin/users/${userId}/adjust`, { body: { wallet, amount: signed, note: note.trim() } }), {
    success: "Balance updated",
    invalidate: [qk.user(userId), qk.users],
    onSuccess: () => onOpenChange(false),
  });
  const label = wallet === "tokens" ? `${formatTokens(Math.abs(signed))} tokens` : formatUsd(Math.round(Math.abs(signed) * 1_000_000));
  const target = wallet === "main" ? "main balance" : wallet === "image" ? "image wallet" : "bonus tokens";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adjust balance"
      description="Credit or debit a wallet. The user is notified about credits."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={dir === "add" ? "accent" : "danger"} disabled={!valid} loading={adjust.isPending} onClick={() => adjust.mutate()}>
            {dir === "add" ? "Add" : "Remove"} {value > 0 ? label : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Wallet">
          <Segmented
            value={wallet}
            onChange={setWallet}
            options={[
              { value: "main", label: "Main balance" },
              { value: "image", label: "Image wallet" },
              { value: "tokens", label: "Tokens" },
            ]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <Field label="Direction">
            <Segmented
              value={dir}
              onChange={setDir}
              options={[
                { value: "add", label: "Add" },
                { value: "remove", label: "Remove" },
              ]}
            />
          </Field>
          <Field label={wallet === "tokens" ? "Tokens" : "Amount (USD)"}>
            <Input type="number" inputMode="decimal" min={0} step={wallet === "tokens" ? 1000 : 0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={wallet === "tokens" ? "e.g. 1000000" : "e.g. 5.00"} />
          </Field>
        </div>
        <Field label="Note" hint="Shown in the user's transaction history and the audit log.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="min-h-16" placeholder="e.g. Refund for failed requests" />
        </Field>
        {value > 0 && (
          <p className={cn("rounded-xl border px-3.5 py-3 text-[13px]", dir === "add" ? "border-success/30 bg-success-soft text-success" : "border-danger/30 bg-danger-soft text-danger")}>
            {dir === "add" ? "Adds" : "Removes"} <strong className="tabular">{label}</strong> {dir === "add" ? "to" : "from"} the user&apos;s {target}.
          </p>
        )}
      </div>
    </Dialog>
  );
}

function GrantPlanDialog({ userId, open, onOpenChange }: { userId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: plans } = useAdminPlans();
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState("30");
  useEffect(() => {
    if (open) {
      setPlanId("");
      setDays("30");
    }
  }, [open]);
  const plan = plans?.find((p) => p.id === planId);
  const d = Math.round(num(days));
  const valid = Boolean(plan) && d >= 1 && d <= 3650;
  const grant = useAction(() => api(`/api/admin/users/${userId}/grant-plan`, { body: { planId, days: d } }), {
    success: () => `${plan?.name ?? "Plan"} granted for ${d} days`,
    invalidate: [qk.user(userId), qk.users, qk.plans],
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Grant plan"
      description="Free of charge. Replaces the user's current plan (or pass) of the same kind."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!valid} loading={grant.isPending} onClick={() => grant.mutate()}>
            Grant plan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Plan">
          <NativeSelect
            value={planId}
            onChange={(ev) => {
              setPlanId(ev.target.value);
              const p = plans?.find((x) => x.id === ev.target.value);
              if (p) setDays(p.kind === "pass" ? String(Math.max(1, Math.round(p.durationHours / 24))) : "30");
            }}
          >
            <option value="">Choose a plan…</option>
            <optgroup label="Monthly plans">
              {plans
                ?.filter((p) => p.kind === "monthly")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatTokens(p.tokens)} tokens{p.active ? "" : " (inactive)"}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Passes">
              {plans
                ?.filter((p) => p.kind === "pass")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatTokens(p.tokens)} tokens{p.active ? "" : " (inactive)"}
                  </option>
                ))}
            </optgroup>
          </NativeSelect>
        </Field>
        <Field label="Duration (days)" hint={d > 30 && plan?.kind === "monthly" ? "Token quota still resets every 30 days." : "1–3650 days"}>
          <Input type="number" min={1} max={3650} value={days} onChange={(ev) => setDays(ev.target.value)} />
        </Field>
        {plan && (
          <p className="rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">{plan.name}</span> · {formatTokens(plan.tokens)} tokens · {plan.rpm} RPM · {plan.modelAccess} models
          </p>
        )}
      </div>
    </Dialog>
  );
}
