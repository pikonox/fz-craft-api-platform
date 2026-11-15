"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CopyButton, Field, Input } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/api";
import type { MeResponse } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SettingRow } from "./common";

export function AccountInfoCard({ me }: { me: MeResponse }) {
  const { user, entitlement } = me;
  return (
    <Card>
      <CardHeader title="Account" />
      <CardBody>
        <div className="divide-y divide-border">
          <SettingRow title="Account ID" description="Share this with support if they ask for it.">
            <code className="max-w-[220px] truncate rounded-md bg-muted px-2 py-1 font-mono text-[12px]">{user.id}</code>
            <CopyButton value={user.id} label="Account ID" />
          </SettingRow>
          <SettingRow title="Plan" description={entitlement.plan?.isFree === false && entitlement.plan.periodEndsAt ? `Current period ends ${formatDate(entitlement.plan.periodEndsAt)}.` : "Upgrade any time from Plans."}>
            <Badge tone={entitlement.isPaid ? "accent" : "neutral"}>{entitlement.plan?.name ?? "Free"}</Badge>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/billing/plan">Manage</Link>
            </Button>
          </SettingRow>
          <SettingRow title="Referral code" description="Friends who sign up with it earn you bonus tokens.">
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-[12.5px]">{user.referralCode}</code>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/rewards">Rewards</Link>
            </Button>
          </SettingRow>
        </div>
      </CardBody>
    </Card>
  );
}

export function DangerZoneCard({ me }: { me: MeResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-danger/40">
      <CardHeader title={<span className="text-danger">Delete account</span>} description="Permanently delete your account and personal data. This can't be undone." />
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted-foreground">
            <li>All API keys stop working immediately.</li>
            <li>Playground chats, generated images and notifications are deleted.</li>
            <li>Remaining balance and plan time are forfeited. Payment records are kept for accounting.</li>
          </ul>
          <Button variant="danger" className="shrink-0" onClick={() => setOpen(true)}>
            <Trash2 /> Delete account
          </Button>
        </div>
      </CardBody>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} hasPassword={me.user.hasPassword} email={me.user.email} />
    </Card>
  );
}

function DeleteAccountDialog({ open, onOpenChange, hasPassword, email }: { open: boolean; onOpenChange: (v: boolean) => void; hasPassword: boolean; email: string }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setConfirm("");
      setPassword("");
      setError(null);
    }
  }, [open]);

  const ready = confirm === "DELETE" && (!hasPassword || password.length > 0);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/delete", { body: { confirm: "DELETE", password: hasPassword ? password : undefined } });
      qc.clear();
      window.location.href = "/";
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !busy && onOpenChange(v)}
      size="sm"
      title="Delete your account?"
      description={`This permanently deletes ${email} and everything listed. There's no undo.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!ready || busy} onClick={submit}>
            {busy ? "Deleting…" : "Delete forever"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Any balance left in your account will be lost.
        </div>
        <Field label={<>Type <code className="rounded bg-muted px-1 font-mono">DELETE</code> to confirm</>} htmlFor="del-confirm">
          <Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        </Field>
        {hasPassword && (
          <Field label="Your password" htmlFor="del-pw">
            <Input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
