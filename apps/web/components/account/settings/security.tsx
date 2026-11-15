"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Check, ExternalLink, KeyRound, LockKeyhole, Send, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CopyButton, Field, Input, Spinner } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/api";
import { useRefreshAccount } from "@/lib/queries";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Password ────────────────────────────────────────────
export function PasswordCard({ user }: { user: User }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = (!user.hasPassword || current.length > 0) && next.length >= 8 && confirm === next;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/password", { body: { current: user.hasPassword ? current : undefined, next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(user.hasPassword ? "Password changed. Your other sessions were signed out." : "Password set. You can now sign in with it.");
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["settings", "sessions"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={user.hasPassword ? "Password" : "Set a password"}
        description={user.hasPassword ? "Changing it signs you out everywhere else." : "You sign in with Google. Add a password to sign in with your email too."}
      />
      <CardBody>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          {user.hasPassword && (
            <Field label="Current password" htmlFor="pw-current" className="sm:col-span-2">
              <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
          )}
          <Field label="New password" htmlFor="pw-next" error={tooShort ? "Use at least 8 characters" : null} hint="At least 8 characters.">
            <Input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={tooShort} />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-confirm" error={mismatch ? "Passwords don't match" : null}>
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
          </Field>
          {error && <p className="text-[13px] text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="primary" disabled={!ready || busy}>
              <KeyRound /> {busy ? "Saving…" : user.hasPassword ? "Change password" : "Set password"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// ── Two-factor ──────────────────────────────────────────
const cleanCode = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export function TwoFactorCard({ user }: { user: User }) {
  const refresh = useRefreshAccount();
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      setSetup(await api<{ secret: string; otpauth: string }>("/api/me/2fa/setup", { body: {} }));
      setCode("");
      setError(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/2fa/enable", { body: { code } });
      toast.success("Two-factor authentication is on");
      setSetup(null);
      setCode("");
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        description="Ask for a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…) when you sign in."
        action={
          user.twoFactorEnabled ? (
            <Badge tone="success" dot>
              On
            </Badge>
          ) : (
            <Badge tone="neutral">Off</Badge>
          )
        }
      />
      <CardBody>
        {user.twoFactorEnabled ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                <ShieldCheck className="size-5" />
              </span>
              <p className="text-[13.5px] text-muted-foreground">Your account is protected with an authenticator app.</p>
            </div>
            <Button variant="danger-ghost" onClick={() => setDisabling(true)}>
              <ShieldOff /> Turn off
            </Button>
          </div>
        ) : setup ? (
          <form onSubmit={enable} className="grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
            <div className="mx-auto rounded-xl border border-border bg-white p-3 md:mx-0">
              <QRCodeSVG value={setup.otpauth} size={156} marginSize={0} />
            </div>
            <div className="min-w-0 space-y-4">
              <ol className="list-decimal space-y-1 pl-4 text-[13.5px] text-muted-foreground">
                <li>Scan the QR code with your authenticator app.</li>
                <li>Or enter this key manually:</li>
              </ol>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 py-1 pl-3 pr-1">
                <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] tracking-wider">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                <CopyButton value={setup.secret} label="Setup key" />
              </div>
              <Field label="Enter the 6-digit code from the app" htmlFor="tfa-code" error={error}>
                <Input
                  id="tfa-code"
                  value={code}
                  onChange={(e) => setCode(cleanCode(e.target.value))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="max-w-[180px] font-mono text-base tracking-[0.3em]"
                  aria-invalid={Boolean(error)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" disabled={code.length !== 6 || busy}>
                  {busy ? "Checking…" : "Turn on"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <LockKeyhole className="size-5" />
              </span>
              <p className="text-[13.5px] text-muted-foreground">Recommended. Stops anyone who learns your password from signing in.</p>
            </div>
            <Button variant="primary" onClick={start} disabled={starting}>
              {starting ? <Spinner className="text-current" /> : <ShieldCheck />} Set up
            </Button>
          </div>
        )}
      </CardBody>
      <DisableTwoFactorDialog open={disabling} onOpenChange={setDisabling} onDone={refresh} />
    </Card>
  );
}

function DisableTwoFactorDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/2fa/disable", { body: { code } });
      toast.success("Two-factor authentication is off");
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Turn off two-factor?"
      description="Enter a current code from your authenticator app to confirm."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={code.length !== 6 || busy} onClick={submit}>
            {busy ? "Turning off…" : "Turn off"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Authenticator code" htmlFor="tfa-off" error={error}>
          <Input
            id="tfa-off"
            autoFocus
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="font-mono text-base tracking-[0.3em]"
            aria-invalid={Boolean(error)}
          />
        </Field>
      </form>
    </Dialog>
  );
}

// ── Telegram ────────────────────────────────────────────
type TelegramStatus = { verified: boolean; username: string };

export function TelegramCard({ user }: { user: User }) {
  const refresh = useRefreshAccount();
  const [link, setLink] = useState<{ url: string; until: number } | null>(null);
  const [starting, setStarting] = useState(false);

  // While a link is open, check every 3 seconds whether the bot confirmed it
  const waiting = Boolean(link) && !user.telegram.verified;
  const { data: status } = useQuery({
    queryKey: ["settings", "telegram"],
    queryFn: () => api<TelegramStatus>("/api/me/telegram/status"),
    enabled: waiting,
    refetchInterval: waiting ? 3000 : false,
  });

  useEffect(() => {
    if (!waiting || !status?.verified) return;
    setLink(null);
    toast.success(`Telegram verified${status.username ? ` as @${status.username}` : ""}`);
    refresh();
  }, [waiting, status, refresh]);

  useEffect(() => {
    if (!link) return;
    const ms = link.until - Date.now();
    const t = window.setTimeout(() => setLink(null), Math.max(0, ms));
    return () => window.clearTimeout(t);
  }, [link]);

  const start = async () => {
    setStarting(true);
    try {
      const r = await api<{ url?: string; expiresInSec?: number; verified?: boolean; dev?: boolean }>("/api/me/telegram/link", { body: {} });
      if (r.dev) {
        if (r.verified) toast.success("Verified (development mode — no Telegram bot is configured)");
        else toast.error("Couldn't verify. This account or Telegram id may already be used.");
        refresh();
        return;
      }
      if (r.url) {
        setLink({ url: r.url, until: Date.now() + (r.expiresInSec ?? 900) * 1000 });
        window.open(r.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const verified = user.telegram.verified;

  return (
    <Card id="telegram">
      <CardHeader
        title="Telegram verification"
        description="Verify once with our Telegram bot to unlock the free tier and referral rewards. One Telegram account per user."
        action={
          verified ? (
            <Badge tone="success">
              <Check className="size-3" /> Verified
            </Badge>
          ) : (
            <Badge tone="warning">Not verified</Badge>
          )
        }
      />
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", verified ? "bg-info-soft text-info" : "bg-muted text-muted-foreground")}>
              <Send className="size-5" />
            </span>
            <p className="min-w-0 text-[13.5px] text-muted-foreground">
              {verified ? (
                <>
                  Linked{user.telegram.username ? (
                    <>
                      {" "}
                      to <span className="font-medium text-foreground">@{user.telegram.username}</span>
                    </>
                  ) : null}
                  . You can get alerts there — turn them on under Notifications.
                </>
              ) : waiting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Waiting for you to press <b className="font-medium text-foreground">Start</b> in Telegram…
                </span>
              ) : (
                "Opens the bot in Telegram. Press Start and you're done — this page updates by itself."
              )}
            </p>
          </div>
          {!verified &&
            (waiting && link ? (
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" asChild>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Open again
                  </a>
                </Button>
                <Button variant="ghost" onClick={() => setLink(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="primary" onClick={start} disabled={starting}>
                {starting ? <Spinner className="text-current" /> : <Send />} Verify with Telegram
              </Button>
            ))}
        </div>
      </CardBody>
    </Card>
  );
}
