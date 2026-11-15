"use client";

import { useEffect, useState } from "react";
import { formatNumber, formatTokens } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/controls";
import { qk } from "@/components/admin/queries";
import { SectionLabel, ToggleRow, num, useAction, usdField } from "@/components/admin/ui";
import type { Access, AdminPlan } from "@/components/admin/types";
import { api } from "@/lib/api";

export const PLAN_ACCESS_LABEL: Record<Access, string> = { free: "Free models", paid: "Free + paid models", early: "All models (early access)" };

export type PlanEditorTarget = { mode: "edit"; plan: AdminPlan } | { mode: "new"; kind: AdminPlan["kind"] } | null;

/** Request body for POST/PUT /api/admin/plans built from a stored plan (prices back to USD). */
export function planBody(p: AdminPlan, patch: Partial<Record<string, unknown>> = {}) {
  return {
    slug: p.slug,
    name: p.name,
    kind: p.kind,
    isFree: p.isFree,
    priceMonthlyUsd: num(usdField(p.priceMonthly)),
    priceYearlyUsd: num(usdField(p.priceYearly)),
    pricePassUsd: num(usdField(p.pricePass)),
    durationHours: p.durationHours || 24,
    tokens: p.tokens,
    rpm: p.rpm,
    modelAccess: p.modelAccess,
    features: p.features ?? [],
    badge: p.badge ?? "",
    highlight: p.highlight,
    sort: p.sort,
    active: p.active,
    ...patch,
  };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function PlanDialog({ target, plans, onClose }: { target: PlanEditorTarget; plans: AdminPlan[]; onClose: () => void }) {
  const editing = target?.mode === "edit" ? target.plan : null;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState<AdminPlan["kind"]>("monthly");
  const [isFree, setIsFree] = useState(false);
  const [monthly, setMonthly] = useState("0");
  const [yearly, setYearly] = useState("0");
  const [pass, setPass] = useState("0");
  const [hours, setHours] = useState("24");
  const [tokens, setTokens] = useState("");
  const [rpm, setRpm] = useState("60");
  const [access, setAccess] = useState<Access>("free");
  const [features, setFeatures] = useState("");
  const [badge, setBadge] = useState("");
  const [highlight, setHighlight] = useState(false);
  const [sort, setSort] = useState("100");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!target) return;
    const p = editing;
    setName(p?.name ?? "");
    setSlug(p?.slug ?? "");
    setSlugTouched(Boolean(p));
    setKind(p?.kind ?? (target.mode === "new" ? target.kind : "monthly"));
    setIsFree(p?.isFree ?? false);
    setMonthly(usdField(p?.priceMonthly));
    setYearly(usdField(p?.priceYearly));
    setPass(usdField(p?.pricePass));
    setHours(String(p?.durationHours || 24));
    setTokens(p ? String(p.tokens) : "");
    setRpm(String(p?.rpm ?? 60));
    setAccess(p?.modelAccess ?? "free");
    setFeatures((p?.features ?? []).join("\n"));
    setBadge(p?.badge ?? "");
    setHighlight(p?.highlight ?? false);
    setSort(String(p?.sort ?? (plans.length ? Math.max(...plans.map((x) => x.sort)) + 10 : 100)));
    setActive(p?.active ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const otherFree = plans.find((p) => p.isFree && p.id !== editing?.id);
  const m = num(monthly, -1);
  const y = num(yearly, -1);
  const ps = num(pass, -1);
  const h = num(hours, -1);
  const t = num(tokens, -1);
  const r = num(rpm, -1);
  const featureList = features
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const slugOk = /^[a-z0-9-]+$/.test(slug) && slug.length <= 40;
  const pricesOk = kind === "monthly" ? m >= 0 && y >= 0 : ps >= 0 && Number.isInteger(h) && h >= 1 && h <= 744;
  const tokensOk = Number.isInteger(t) && t >= 0;
  const rpmOk = Number.isInteger(r) && r >= 1 && r <= 100_000;
  const featuresOk = featureList.length <= 20 && featureList.every((f) => f.length <= 120);
  const freeOk = !(isFree && otherFree);
  const valid = name.trim() && slugOk && pricesOk && tokensOk && rpmOk && featuresOk && freeOk && Number.isInteger(num(sort, NaN));
  const yearlySaving = kind === "monthly" && m > 0 && y > 0 ? 1 - y / (m * 12) : 0;

  const save = useAction(
    () => {
      const body = {
        slug,
        name: name.trim(),
        kind,
        isFree,
        priceMonthlyUsd: kind === "monthly" && !isFree ? m : 0,
        priceYearlyUsd: kind === "monthly" && !isFree ? y : 0,
        pricePassUsd: kind === "pass" ? ps : 0,
        durationHours: kind === "pass" ? h : 24,
        tokens: t,
        rpm: r,
        modelAccess: access,
        features: featureList,
        badge: badge.trim(),
        highlight,
        sort: Math.round(num(sort, 100)),
        active,
      };
      return editing ? api(`/api/admin/plans/${editing.id}`, { method: "PUT", body }) : api(`/api/admin/plans`, { body });
    },
    { success: editing ? "Plan saved" : "Plan created", invalidate: [qk.plans, ["plans"], ["billing"]], onSuccess: onClose },
  );

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={editing ? `Edit ${editing.name}` : kind === "pass" ? "New pass" : "New plan"}
      description="Changes apply to new purchases and to renewals. Current subscriptions keep their tokens and rate limit until their term ends."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {editing ? "Save changes" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-7">
        <section className="space-y-4">
          <SectionLabel>Basics</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={name}
                maxLength={60}
                placeholder="e.g. Pro"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </Field>
            <Field label="Slug" hint={editing && slug !== editing.slug ? "Links that use the old slug will stop working." : "Used in URLs and logs"} error={slug && !slugOk ? "Lowercase letters, numbers and dashes" : null}>
              <Input
                value={slug}
                maxLength={40}
                placeholder="pro"
                className="font-mono text-[13px]"
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase());
                  setSlugTouched(true);
                }}
              />
            </Field>
          </div>
          <Field label="Type" hint={kind === "pass" ? "A one-off pass that adds tokens for a fixed number of hours (Free plan users only)." : "A subscription billed monthly or yearly from the user's balance."}>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: "monthly", label: "Monthly plan" },
                { value: "pass", label: "Pass" },
              ]}
            />
          </Field>
          {kind === "monthly" && (
            <ToggleRow
              label="Free plan"
              description={otherFree ? `"${otherFree.name}" is already the free plan — there can only be one.` : "The plan every account starts on and falls back to. It costs nothing."}
              checked={isFree}
              onChange={setIsFree}
              disabled={Boolean(otherFree) && !isFree}
            />
          )}
        </section>

        <section className="space-y-4">
          <SectionLabel>Price & allowance</SectionLabel>
          {kind === "monthly" ? (
            !isFree && (
              <div className="grid gap-4 sm:grid-cols-2">
                <UsdField label="Monthly price" value={monthly} onChange={setMonthly} invalid={m < 0} />
                <UsdField
                  label="Yearly price"
                  value={yearly}
                  onChange={setYearly}
                  invalid={y < 0}
                  hint={yearlySaving > 0 ? `${Math.round(yearlySaving * 100)}% less than 12 × monthly` : y > 0 && m > 0 ? "Not cheaper than 12 × monthly" : "0 hides the yearly option"}
                />
              </div>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <UsdField label="Pass price" value={pass} onChange={setPass} invalid={ps < 0} />
              <Field label="Valid for (hours)" hint={h >= 24 && h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : undefined} error={!(Number.isInteger(h) && h >= 1 && h <= 744) ? "1–744 hours" : null}>
                <Input type="number" min={1} max={744} step={1} value={hours} onChange={(e) => setHours(e.target.value)} className="tabular" />
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={kind === "pass" ? "Tokens included" : "Tokens per month"} hint={tokensOk && t > 0 ? `${formatTokens(t)} tokens` : undefined} error={tokens && !tokensOk ? "Whole number, 0 or more" : null}>
              <Input type="number" min={0} step={1_000_000} value={tokens} onChange={(e) => setTokens(e.target.value)} placeholder="30000000" className="tabular" />
            </Field>
            <Field label="Requests per minute" hint={rpmOk ? `${formatNumber(r)} RPM` : undefined} error={!rpmOk ? "1–100,000" : null}>
              <Input type="number" min={1} max={100000} step={1} value={rpm} onChange={(e) => setRpm(e.target.value)} className="tabular" />
            </Field>
          </div>
          <Field label="Model access">
            <NativeSelect value={access} onChange={(e) => setAccess(e.target.value as Access)}>
              {(Object.keys(PLAN_ACCESS_LABEL) as Access[]).map((a) => (
                <option key={a} value={a}>
                  {PLAN_ACCESS_LABEL[a]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </section>

        <section className="space-y-4">
          <SectionLabel>Pricing page</SectionLabel>
          <Field label="Features" hint={`One per line · ${featureList.length}/20`} error={!featuresOk ? "Up to 20 lines, 120 characters each" : null}>
            <Textarea value={features} onChange={(e) => setFeatures(e.target.value)} className="min-h-28 text-[13px]" placeholder={"All free models\nPriority routing\nEmail support"} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Badge" hint='Optional, e.g. "Most popular"'>
              <Input value={badge} maxLength={30} onChange={(e) => setBadge(e.target.value)} />
            </Field>
            <Field label="Sort" hint="Lower first">
              <Input type="number" step={1} value={sort} onChange={(e) => setSort(e.target.value)} className="tabular" />
            </Field>
          </div>
          <div className="space-y-3 rounded-xl border border-border p-4">
            <ToggleRow label="Highlight" description="Draws attention to this plan on the pricing page." checked={highlight} onChange={setHighlight} />
            <ToggleRow
              label="Active"
              description="Inactive plans are hidden from pricing and can't be bought. Current subscribers keep it until their term ends, then it won't renew."
              checked={active}
              onChange={setActive}
              disabled={isFree}
            />
          </div>
        </section>
      </div>
    </Dialog>
  );
}

function UsdField({ label, value, onChange, invalid, hint }: { label: string; value: string; onChange: (v: string) => void; invalid?: boolean; hint?: string }) {
  return (
    <Field label={label} hint={hint} error={invalid ? "Enter 0 or more" : null}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle-foreground">$</span>
        <Input type="number" min={0} step="any" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="pl-6 tabular" />
      </div>
    </Field>
  );
}
