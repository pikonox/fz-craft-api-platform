"use client";

import Link from "next/link";
import { formatTokens } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Textarea } from "@/components/ui/primitives";
import { Segmented, Slider, Switch } from "@/components/ui/controls";
import { CAP_META, VendorMark } from "@/components/model-meta";
import type { ModelInfo } from "@/lib/types";
import { RotateCcw } from "lucide-react";
import { DEFAULT_PARAMS, type Params } from "./types";

const PRESETS = [
  { label: "Concise engineer", text: "You are a concise senior engineer. Answer with code first, then a short explanation." },
  { label: "Friendly tutor", text: "You are a patient tutor. Explain step by step with simple examples and check understanding." },
  { label: "JSON extractor", text: "Extract the requested fields and reply with valid JSON only. No prose." },
];

function Row({ label, value, children }: { label: string; value?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        {value !== undefined && <span className="font-mono text-xs text-muted-foreground tabular">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/** Chat settings, shown in the gear pop-over above the Playground. */
export function ParamsPanel({ model, params, defaults = DEFAULT_PARAMS, onChange }: { model: ModelInfo | undefined; params: Params; defaults?: Params; onChange: (p: Partial<Params>) => void }) {
  const maxOut = Math.max(256, model?.maxOutput || 16_384);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <p className="text-[13.5px] font-semibold">Chat settings</p>
        <Button variant="ghost" size="xs" onClick={() => onChange({ ...defaults, webSearch: params.webSearch })} title="Back to the default settings">
          <RotateCcw /> Reset
        </Button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border px-5 py-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">Model</p>
          {model ? (
            <div className="rounded-xl border border-border bg-muted/40 p-3.5">
              <div className="flex items-center gap-3">
                <VendorMark vendor={model.vendor} modelId={model.id} className="size-9 rounded-lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{model.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{model.id}</p>
                </div>
              </div>
              {model.description && <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{model.description}</p>}
              <div className="mt-2.5 flex flex-wrap gap-1">
                {model.capabilities.map((c) => {
                  const meta = CAP_META[c];
                  return meta ? (
                    <Badge key={c} tone="neutral">
                      <meta.icon className="size-3" /> {meta.label}
                    </Badge>
                  ) : null;
                })}
              </div>
              <div className="mt-3 flex justify-between text-xs">
                <span className="text-muted-foreground">Context</span>
                <span className="font-medium">{formatTokens(model.contextLength)} tokens</span>
              </div>
            </div>
          ) : null}
        </div>

        <Row label="Temperature" value={params.temperature.toFixed(1)}>
          <Slider value={params.temperature} min={0} max={2} step={0.1} onValueChange={(v) => onChange({ temperature: v })} />
        </Row>
        <Row label="Max output tokens" value={params.maxTokens.toLocaleString()}>
          <Slider value={Math.min(params.maxTokens, maxOut)} min={256} max={maxOut} step={256} onValueChange={(v) => onChange({ maxTokens: v })} />
        </Row>
        <Row label="Top P" value={params.topP.toFixed(2)}>
          <Slider value={params.topP} min={0} max={1} step={0.05} onValueChange={(v) => onChange({ topP: v })} />
        </Row>
        {model?.capabilities.includes("reasoning") && (
          <Row label="Reasoning effort">
            <Segmented
              size="sm"
              className="w-full"
              value={params.reasoningEffort || "auto"}
              onChange={(v) => onChange({ reasoningEffort: v === "auto" ? "" : (v as Params["reasoningEffort"]) })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
            />
          </Row>
        )}
        {model?.capabilities.includes("json") && (
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <p className="text-[13px] font-medium">JSON mode</p>
              <p className="text-xs text-muted-foreground">Force a valid JSON object</p>
            </div>
            <Switch checked={params.jsonMode} onCheckedChange={(v) => onChange({ jsonMode: v })} />
          </div>
        )}
        <Row label="System prompt">
          <Textarea value={params.system} onChange={(e) => onChange({ system: e.target.value })} placeholder="e.g. You are a concise senior engineer. Answer with code first." className="min-h-32 text-[13px]" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => onChange({ system: p.text })} className="rounded-md border border-border px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground">
                {p.label}
              </button>
            ))}
          </div>
        </Row>
      </div>
      <div className="border-t border-border p-3">
        <Button variant="ghost" size="sm" className="w-full" asChild>
          <Link href="/dashboard/usage?source=playground">Playground usage →</Link>
        </Button>
      </div>
    </div>
  );
}
