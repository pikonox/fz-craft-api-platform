"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Coins, CreditCard, Gift, Info, Mail, Megaphone, MessageSquareReply, RotateCcw, Save, Send, Settings2, Sparkles, TriangleAlert } from "lucide-react";
import { formatPkr, formatTokens } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, Field, Input, NativeSelect, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { qk, useAdminModels, useAdminSettings } from "@/components/admin/queries";
import { ToggleRow, num, useAction } from "@/components/admin/ui";
import type { AdminModel, AdminSettings, QuickIntent, QuickReplies } from "@/components/admin/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Level = AdminSettings["statusBanner"]["level"];

type Form = {
  pkrPerUsd: string;
  level: Level;
  message: string;
  announcement: string;
  requireTelegramForFree: boolean;
  signupBonusTokens: string;
  referralRewardTokens: string;
  utilityModel: string;
  imageDefaultModel: string;
  supportEmail: string;
  quickEnabled: boolean;
  /** One answer per line, per intent */
  quick: Record<QuickIntent, string>;
};

/** Quick-reply intents in display order, with the kind of messages each one catches. */
const QUICK_INTENTS: { key: QuickIntent; label: string; catches: string }[] = [
  { key: "greeting", label: "Greeting", catches: "hi, hello, hlo, hey, good morning, what's up" },
  { key: "salam", label: "Salam", catches: "salam, assalam o alaikum, AOA" },
  { key: "howAreYou", label: "How are you", catches: "how are you, hi how r u, kaise ho, kya haal hai" },
  { key: "identity", label: "Which model / who are you", catches: "which model are you, who are you, who made you, what's your name, are you ChatGPT" },
  { key: "thanks", label: "Thanks", catches: "thanks, thank you so much, thx, jazakallah" },
];
const MAX_QUICK_ANSWERS = 10;
const MAX_QUICK_LENGTH = 600;

const quickLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function quickFromForm(f: Form): QuickReplies {
  return { enabled: f.quickEnabled, ...(Object.fromEntries(QUICK_INTENTS.map(({ key }) => [key, quickLines(f.quick[key])])) as Record<QuickIntent, string[]>) };
}

const LEVELS: { value: Level; label: string }[] = [
  { value: "none", label: "None" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "outage", label: "Outage" },
];

const BANNER_STYLE: Record<Exclude<Level, "none">, { cls: string; icon: typeof Info }> = {
  info: { cls: "border-info/30 bg-info-soft text-info", icon: Info },
  warning: { cls: "border-warning/30 bg-warning-soft text-warning", icon: AlertTriangle },
  outage: { cls: "border-danger/30 bg-danger-soft text-danger", icon: TriangleAlert },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TOKENS = 1_000_000_000;

function toForm(s: AdminSettings): Form {
  return {
    pkrPerUsd: String(s.pkrPerUsd ?? ""),
    level: s.statusBanner?.level ?? "none",
    message: s.statusBanner?.message ?? "",
    announcement: s.announcement ?? "",
    requireTelegramForFree: Boolean(s.requireTelegramForFree),
    signupBonusTokens: String(s.signupBonusTokens ?? 0),
    referralRewardTokens: String(s.referralRewardTokens ?? 0),
    utilityModel: s.utilityModel ?? "",
    imageDefaultModel: s.imageDefaultModel ?? "",
    supportEmail: s.supportEmail ?? "",
    quickEnabled: s.quickReplies?.enabled ?? true,
    quick: Object.fromEntries(QUICK_INTENTS.map(({ key }) => [key, (s.quickReplies?.[key] ?? []).join("\n")])) as Record<QuickIntent, string>,
  };
}

/** Only the keys that changed, in the shape PATCH /api/admin/settings accepts. */
function toPatch(f: Form, s: AdminSettings): Partial<AdminSettings> {
  const patch: Partial<AdminSettings> = {};
  const pkr = num(f.pkrPerUsd, Number.NaN);
  if (pkr !== s.pkrPerUsd) patch.pkrPerUsd = pkr;
  if (f.level !== s.statusBanner?.level || f.message.trim() !== (s.statusBanner?.message ?? "")) patch.statusBanner = { level: f.level, message: f.message.trim() };
  if (f.announcement.trim() !== (s.announcement ?? "")) patch.announcement = f.announcement.trim();
  if (f.requireTelegramForFree !== s.requireTelegramForFree) patch.requireTelegramForFree = f.requireTelegramForFree;
  const signup = num(f.signupBonusTokens, Number.NaN);
  if (signup !== s.signupBonusTokens) patch.signupBonusTokens = signup;
  const referral = num(f.referralRewardTokens, Number.NaN);
  if (referral !== s.referralRewardTokens) patch.referralRewardTokens = referral;
  if (f.utilityModel !== (s.utilityModel ?? "")) patch.utilityModel = f.utilityModel;
  if (f.imageDefaultModel !== (s.imageDefaultModel ?? "")) patch.imageDefaultModel = f.imageDefaultModel;
  if (f.supportEmail.trim() !== (s.supportEmail ?? "")) patch.supportEmail = f.supportEmail.trim();
  const quick = quickFromForm(f);
  if (JSON.stringify(quick) !== JSON.stringify({ enabled: s.quickReplies?.enabled ?? true, ...Object.fromEntries(QUICK_INTENTS.map(({ key }) => [key, s.quickReplies?.[key] ?? []])) })) {
    patch.quickReplies = quick;
  }
  return patch;
}

const tokenError = (v: string) => {
  const n = num(v, Number.NaN);
  return !Number.isInteger(n) || n < 0 || n > MAX_TOKENS ? "Enter a whole number from 0 to 1,000,000,000" : null;
};

export default function AdminSettingsPage() {
  const { data, isLoading, error } = useAdminSettings();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Runtime settings for the whole platform. Changes apply right away, no restart needed."
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/payment-methods">
              <CreditCard /> Payment methods
            </Link>
          </Button>
        }
      />
      {isLoading ? (
        <div className="space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : error || !data ? (
        <Card>
          <EmptyState icon={<Settings2 />} title="Couldn't load settings" description={error?.message ?? "Please try again."} />
        </Card>
      ) : (
        <SettingsForm settings={data.settings} defaults={data.defaults} />
      )}
    </div>
  );
}

function SettingsForm({ settings, defaults }: { settings: AdminSettings; defaults: AdminSettings }) {
  const { data: models } = useAdminModels();
  const initial = useMemo(() => toForm(settings), [settings]);
  const initialKey = JSON.stringify(initial);
  const [form, setForm] = useState<Form>(initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Take the server's values again after a save
  useEffect(() => setForm(JSON.parse(initialKey) as Form), [initialKey]);

  const patch = toPatch(form, settings);
  const changed = Object.keys(patch).length;

  const pkr = num(form.pkrPerUsd, Number.NaN);
  const email = form.supportEmail.trim();
  const errors = {
    pkrPerUsd: !Number.isFinite(pkr) || pkr < 1 || pkr > 10_000 ? "Enter a rate from 1 to 10,000" : null,
    message: form.level !== "none" && !form.message.trim() ? "Write a message for the banner" : null,
    signupBonusTokens: tokenError(form.signupBonusTokens),
    referralRewardTokens: tokenError(form.referralRewardTokens),
    supportEmail: email && !EMAIL.test(email) ? "Enter a valid email address" : null,
    ...Object.fromEntries(
      QUICK_INTENTS.map(({ key }) => {
        const lines = quickLines(form.quick[key]);
        const msg =
          lines.length > MAX_QUICK_ANSWERS
            ? `Up to ${MAX_QUICK_ANSWERS} answers`
            : lines.some((l) => l.length > MAX_QUICK_LENGTH)
              ? `Each answer can be up to ${MAX_QUICK_LENGTH} characters`
              : null;
        return [`quick_${key}`, msg];
      }),
    ),
  } as Record<string, string | null>;
  const invalid = Object.values(errors).some(Boolean);

  const save = useAction(() => api<{ settings: AdminSettings }>("/api/admin/settings", { method: "PATCH", body: patch }), {
    success: () => `Settings saved (${changed} change${changed === 1 ? "" : "s"})`,
    invalidate: [qk.settings, ["status"], ["billing"]],
  });

  const chatModels = (models ?? []).filter((m) => m.type === "chat").sort((a, b) => a.sort - b.sort);
  const imageModels = (models ?? []).filter((m) => m.type === "image").sort((a, b) => a.sort - b.sort);
  const banner = form.level !== "none" ? BANNER_STYLE[form.level] : null;

  return (
    <form
      className="space-y-5 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && !invalid) save.mutate();
      }}
    >
      {/* Status & announcement */}
      <Card>
        <CardHeader title="Status & announcement" description="Tell users about incidents, maintenance or news." />
        <CardBody className="space-y-5">
          <Field label="Status banner" hint="Warning reports the platform as degraded and Outage as down on the public status endpoint.">
            <Segmented size="sm" value={form.level} onChange={(v) => set("level", v)} options={LEVELS} className="self-start" />
          </Field>
          <Field label="Banner message" error={errors.message} hint={`${form.message.length}/300`}>
            <Input
              value={form.message}
              maxLength={300}
              placeholder={form.level === "none" ? "Choose a level above to show a banner" : "e.g. Image generation is slower than usual — we're on it."}
              onChange={(e) => set("message", e.target.value)}
              aria-invalid={!!errors.message}
            />
          </Field>
          {banner && form.message.trim() && (
            <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px]", banner.cls)}>
              <banner.icon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">{form.message.trim()}</span>
            </div>
          )}
          <Field label="Announcement" hint={`A short note for everyone, such as new models or a promotion · ${form.announcement.length}/500`}>
            <Textarea rows={3} maxLength={500} value={form.announcement} placeholder="Optional" onChange={(e) => set("announcement", e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader
          title="Billing"
          description="Exchange rate used to show and collect PKR amounts for JazzCash, Easypaisa and bank transfers."
          action={<Coins className="size-4 text-muted-foreground" />}
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-start">
            <Field label="PKR per 1 USD" error={errors.pkrPerUsd} hint={`Default: ${defaults.pkrPerUsd}`}>
              <Input type="number" inputMode="decimal" min={1} max={10000} step="0.01" value={form.pkrPerUsd} onChange={(e) => set("pkrPerUsd", e.target.value)} aria-invalid={!!errors.pkrPerUsd} />
            </Field>
            {!errors.pkrPerUsd && (
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px] sm:mt-6">
                <p className="text-muted-foreground">At this rate</p>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-medium tabular">
                  {[1, 5, 10, 25].map((usd) => (
                    <span key={usd}>
                      ${usd} = {formatPkr(Math.round(usd * pkr))}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Free tier & rewards */}
      <Card>
        <CardHeader title="Free tier & rewards" action={<Gift className="size-4 text-muted-foreground" />} />
        <CardBody className="space-y-5">
          <ToggleRow
            label="Require Telegram verification for the free plan"
            description="Free-plan API use needs a verified Telegram account. Only applies when the Telegram bot is set up in the server .env."
            checked={form.requireTelegramForFree}
            onChange={(v) => set("requireTelegramForFree", v)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Sign-up bonus (tokens)"
              error={errors.signupBonusTokens}
              hint={`${!errors.signupBonusTokens ? `${formatTokens(num(form.signupBonusTokens))} for every new account · ` : ""}Default: ${formatTokens(defaults.signupBonusTokens)}`}
            >
              <Input type="number" inputMode="numeric" min={0} step={1} value={form.signupBonusTokens} onChange={(e) => set("signupBonusTokens", e.target.value)} aria-invalid={!!errors.signupBonusTokens} />
            </Field>
            <Field
              label="Referral reward (tokens)"
              error={errors.referralRewardTokens}
              hint={`${!errors.referralRewardTokens ? `${formatTokens(num(form.referralRewardTokens))} per verified referral · ` : ""}Default: ${formatTokens(defaults.referralRewardTokens)}`}
            >
              <Input type="number" inputMode="numeric" min={0} step={1} value={form.referralRewardTokens} onChange={(e) => set("referralRewardTokens", e.target.value)} aria-invalid={!!errors.referralRewardTokens} />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* Default models */}
      <Card>
        <CardHeader title="Default models" action={<Sparkles className="size-4 text-muted-foreground" />} />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Utility model" hint="Writes chat titles and powers the Image Studio prompt enhancer. Pick a fast, cheap chat model.">
              <ModelSelect value={form.utilityModel} onChange={(v) => set("utilityModel", v)} models={chatModels} autoLabel="Automatic (first enabled free chat model)" loading={!models} />
            </Field>
            <Field label="Image Studio default" hint="Model selected when someone opens Image Studio.">
              <ModelSelect value={form.imageDefaultModel} onChange={(v) => set("imageDefaultModel", v)} models={imageModels} autoLabel="Automatic (first enabled image model)" loading={!models} />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* Quick replies */}
      <Card>
        <CardHeader
          title="Quick replies"
          description="Instant answers for messages that are only a greeting, “which model are you?” or thanks. No provider call, so they cost no tokens. Real questions always go to the model."
          action={<MessageSquareReply className="size-4 text-muted-foreground" />}
        />
        <CardBody className="space-y-5">
          <ToggleRow
            label="Answer these messages instantly"
            description="Used in the Playground and the API. Skipped when the request has its own system prompt, tools, JSON mode or images, so apps built on the API keep their own persona."
            checked={form.quickEnabled}
            onChange={(v) => set("quickEnabled", v)}
          />
          <div className={cn("space-y-4", !form.quickEnabled && "pointer-events-none opacity-50")}>
            {QUICK_INTENTS.map(({ key, label, catches }) => (
              <Field key={key} label={label} error={errors[`quick_${key}`]} hint={`Catches: ${catches}. One answer per line (one is picked at random); leave empty to send these to the model.`}>
                <Textarea
                  rows={key === "greeting" || key === "thanks" ? 3 : 2}
                  value={form.quick[key]}
                  onChange={(e) => set("quick", { ...form.quick, [key]: e.target.value })}
                  placeholder="Empty: these messages go to the model"
                  className="text-[13px]"
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Placeholders: <code className="font-mono">{"{model}"}</code> the model&apos;s name, <code className="font-mono">{"{vendor}"}</code> its maker,{" "}
              <code className="font-mono">{"{brand}"}</code> your platform name.
            </p>
            <Button type="button" size="xs" variant="ghost" onClick={() => setForm((f) => ({ ...f, ...{ quickEnabled: defaults.quickReplies.enabled, quick: toForm(defaults).quick } }))}>
              <RotateCcw /> Restore defaults
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader title="Contact" action={<Mail className="size-4 text-muted-foreground" />} />
        <CardBody className="space-y-3">
          <Field label="Support email" error={errors.supportEmail} hint="Shown in the website footer. Addresses at example.com are treated as placeholders and hidden.">
            <Input type="email" value={form.supportEmail} maxLength={200} placeholder="support@yourdomain.com" onChange={(e) => set("supportEmail", e.target.value)} aria-invalid={!!errors.supportEmail} />
          </Field>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Send className="mt-0.5 size-3.5 shrink-0" />
            The Telegram contact link comes from TELEGRAM_BOT_USERNAME in the server .env and can&apos;t be changed here.
          </p>
        </CardBody>
      </Card>

      {/* Save bar */}
      <div
        className={cn(
          "sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-elevated/95 px-4 py-3 shadow-lg backdrop-blur transition-colors",
          changed ? "border-accent/40 shadow-accent/10" : "border-border shadow-black/5",
        )}
      >
        <span className={cn("flex items-center gap-2 text-[13px]", changed ? "text-foreground" : "text-muted-foreground")}>
          <Megaphone className={cn("size-4", changed ? "text-accent" : "text-subtle-foreground")} />
          {changed ? `${changed} unsaved change${changed === 1 ? "" : "s"}` : "All changes saved"}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={!changed || save.isPending} onClick={() => setForm(initial)}>
            <RotateCcw /> Reset
          </Button>
          <Button type="submit" size="sm" variant="primary" disabled={!changed || invalid} loading={save.isPending}>
            {!save.isPending && <Save />} Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}

function ModelSelect({ value, onChange, models, autoLabel, loading }: { value: string; onChange: (v: string) => void; models: AdminModel[]; autoLabel: string; loading: boolean }) {
  const known = models.some((m) => m.publicId === value);
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      <option value="">{autoLabel}</option>
      {/* Keep a saved value visible even if that model was deleted */}
      {value && !known && !loading && <option value={value}>{value} (not found)</option>}
      {models.map((m) => (
        <option key={m.id} value={m.publicId}>
          {m.name} · {m.publicId}
          {!m.enabled ? " (disabled)" : m.access !== "free" ? ` (${m.access})` : ""}
        </option>
      ))}
    </NativeSelect>
  );
}
