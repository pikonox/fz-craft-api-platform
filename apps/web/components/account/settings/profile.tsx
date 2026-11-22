"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, Field, Input, NativeSelect, Skeleton } from "@/components/ui/primitives";
import { Slider } from "@/components/ui/controls";
import { useModels } from "@/lib/queries";
import type { User } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useSaveMe } from "./common";

const FALLBACK_ZONES = ["UTC", "Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles"];

function timeZones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    return all?.length ? all : FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

export function ProfileCard({ user }: { user: User }) {
  const { save, saving } = useSaveMe();
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  useEffect(() => {
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
  }, [user.name, user.phone]);

  const dirty = name.trim() !== (user.name ?? "") || phone.trim() !== (user.phone ?? "");
  const nameError = name.trim() ? null : "Enter your name";

  return (
    <Card>
      <CardHeader title="Profile" description="How you appear on invoices, support tickets and emails." />
      <CardBody>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dirty || nameError) return;
            void save({ name: name.trim(), phone: phone.trim() }, "Profile saved");
          }}
        >
          <Field label="Full name" htmlFor="s-name" error={dirty ? nameError : null}>
            <Input id="s-name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="s-phone" hint="Optional. Helps us match JazzCash / Easypaisa payments.">
            <Input id="s-phone" value={phone} maxLength={30} inputMode="tel" autoComplete="tel" placeholder="+92 300 1234567" onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="s-email" className="sm:col-span-2" hint="Your sign-in email can't be changed here. Contact support if you need to move your account.">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input id="s-email" value={user.email} readOnly className="truncate pl-9 pr-28 text-muted-foreground" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                {user.emailVerified ? (
                  <Badge tone="success">
                    <Check className="size-3" /> Verified
                  </Badge>
                ) : (
                  <Badge tone="warning">Unverified</Badge>
                )}
              </span>
            </div>
          </Field>
          <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-subtle-foreground">
              Member since {formatDate(user.createdAt)} · Sign-in with {[user.hasPassword && "password", user.googleLinked && "Google", user.githubLinked && "GitHub"].filter(Boolean).join(" + ") || "email code"}
            </p>
            <Button type="submit" variant="primary" disabled={!dirty || Boolean(nameError) || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function DefaultsCard({ user }: { user: User }) {
  const { save, saving } = useSaveMe();
  const { data: models, isLoading } = useModels();
  const zones = useMemo(timeZones, []);
  const d = user.defaults ?? { model: "", maxTokens: 1024, temperature: 0.7, timezone: "UTC" };
  const [model, setModel] = useState(d.model ?? "");
  const [temperature, setTemperature] = useState(d.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(String(d.maxTokens ?? 1024));
  const [timezone, setTimezone] = useState(d.timezone || "UTC");
  useEffect(() => {
    setModel(d.model ?? "");
    setTemperature(d.temperature ?? 0.7);
    setMaxTokens(String(d.maxTokens ?? 1024));
    setTimezone(d.timezone || "UTC");
  }, [d.model, d.temperature, d.maxTokens, d.timezone]);

  const chatModels = (models ?? []).filter((m) => m.type === "chat" && m.status !== "maintenance");
  const tokens = Number(maxTokens);
  const tokensError = !Number.isInteger(tokens) || tokens < 16 || tokens > 65_536 ? "Between 16 and 65,536" : null;
  const dirty = model !== (d.model ?? "") || temperature !== (d.temperature ?? 0.7) || tokens !== (d.maxTokens ?? 1024) || timezone !== (d.timezone || "UTC");
  const zoneList = zones.includes(timezone) ? zones : [timezone, ...zones];

  return (
    <Card>
      <CardHeader title="Playground defaults" description="Used when you start a new chat in the Playground. You can still change them per chat." />
      <CardBody>
        <form
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dirty || tokensError) return;
            void save({ defaults: { model, temperature: Math.round(temperature * 10) / 10, maxTokens: tokens, timezone } }, "Defaults saved");
          }}
        >
          <Field label="Default model" htmlFor="s-model">
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <NativeSelect id="s-model" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">Automatic (recommended)</option>
                {model && !chatModels.some((m) => m.id === model) && <option value={model}>{model}</option>}
                {chatModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.vendor}
                    {m.available ? "" : " (needs a paid plan)"}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Time zone" htmlFor="s-tz" hint="Used for dates and daily charts in your dashboard.">
            <NativeSelect id="s-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {zoneList.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label={
              <span className="flex items-center justify-between">
                Temperature <span className="font-mono text-xs text-muted-foreground tabular">{temperature.toFixed(1)}</span>
              </span>
            }
            hint="Lower is more focused, higher is more creative."
          >
            <Slider value={temperature} onValueChange={setTemperature} min={0} max={2} step={0.1} className="mt-2" />
          </Field>
          <Field label="Max output tokens" htmlFor="s-max" error={tokensError}>
            <Input id="s-max" type="number" inputMode="numeric" min={16} max={65536} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} aria-invalid={Boolean(tokensError)} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="primary" disabled={!dirty || Boolean(tokensError) || saving}>
              {saving ? "Saving…" : "Save defaults"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
