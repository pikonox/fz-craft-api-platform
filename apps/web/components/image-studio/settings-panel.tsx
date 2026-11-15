"use client";

import * as React from "react";
import { Check, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { formatUsd, imageDimensions, type AspectRatioId } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { VendorMark } from "@/components/model-meta";
import { cn } from "@/lib/utils";
import { STYLE_LOOK, ratio, type Draft, type Quality, type StudioSummary } from "./lib";

const FALLBACK_ASPECTS = ["1:1", "16:9", "9:16", "3:2", "2:3", "4:3", "3:4"];
export const REF_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_REF_BYTES = 10 * 1024 * 1024;

/** Validates a picked reference image; returns it or null (after telling the user why). */
export function acceptReference(f: File | undefined | null): File | null {
  if (!f) return null;
  if (!REF_TYPES.includes(f.type)) {
    toast.error("Use a PNG, JPG, WEBP or GIF image");
    return null;
  }
  if (f.size > MAX_REF_BYTES) {
    toast.error("The reference image must be 10 MB or smaller");
    return null;
  }
  return f;
}

type Props = {
  summary?: StudioSummary;
  draft: Draft;
  setDraft: (patch: Partial<Draft>) => void;
  refImage: File | null;
  setRefImage: (f: File | null) => void;
};

/** Everything except the prompt: model, style, shape, quality, count and reference image. */
export function SettingsPanel({ summary, draft, setDraft, refImage, setRefImage }: Props) {
  const dims = imageDimensions((draft.aspect as AspectRatioId) || "1:1", draft.quality);

  return (
    <div className="space-y-6 p-4">
      <Group title="Model">
        {!summary ? (
          <div className="space-y-2">
            <Skeleton className="h-[58px] w-full rounded-xl" />
            <Skeleton className="h-[58px] w-full rounded-xl" />
          </div>
        ) : summary.models.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">No image models are available right now.</p>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Model">
            {summary.models.map((m) => {
              const active = draft.model === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDraft({ model: m.id })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                    active ? "border-accent bg-accent-soft/60 ring-1 ring-accent/30" : "border-border bg-card hover:border-border-strong",
                  )}
                >
                  <VendorMark vendor={m.vendor} type="image" modelId={m.id} className="size-9 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13.5px] font-medium">{m.name}</span>
                      <span className="shrink-0 text-[11.5px] tabular text-muted-foreground">{formatUsd(m.pricing?.[draft.quality] ?? 0)}</span>
                    </span>
                    {m.description && <span className="mt-0.5 line-clamp-1 block text-[11.5px] text-muted-foreground">{m.description}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Group>

      <Group title="Style" hint={summary?.styles.find((s) => s.id === draft.style)?.label}>
        <div className="grid grid-cols-4 gap-2">
          {(summary?.styles ?? []).map((s) => {
            const look = STYLE_LOOK[s.id] ?? STYLE_LOOK.none;
            const Icon = look.icon;
            const active = draft.style === s.id;
            return (
              <button key={s.id} type="button" onClick={() => setDraft({ style: s.id })} aria-pressed={active} title={s.label} className="group flex min-w-0 flex-col items-center gap-1">
                <span
                  className={cn(
                    "relative flex aspect-square w-full items-center justify-center rounded-xl ring-1 ring-border transition-all",
                    !look.bg && "bg-muted",
                    active ? "ring-2 ring-accent ring-offset-2 ring-offset-sidebar" : "group-hover:scale-[1.04] group-hover:ring-border-strong",
                  )}
                  style={look.bg ? { background: look.bg } : undefined}
                >
                  <Icon className={cn("size-4", look.bg ? (look.dark ? "text-zinc-800" : "text-white drop-shadow") : "text-muted-foreground")} />
                  {active && (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-white shadow">
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className={cn("w-full truncate text-center text-[11px]", active ? "font-medium text-foreground" : "text-muted-foreground")}>{s.label}</span>
              </button>
            );
          })}
          {!summary && Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-square w-full rounded-xl" />)}
        </div>
      </Group>

      <Group title="Shape" hint={`${dims.width} × ${dims.height}`}>
        <div className="grid grid-cols-4 gap-1.5">
          {(summary?.aspects ?? FALLBACK_ASPECTS).map((a) => {
            const { w, h } = ratio(a);
            const scale = 20 / Math.max(w, h);
            const active = draft.aspect === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => setDraft({ aspect: a })}
                aria-pressed={active}
                className={cn(
                  "flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-xl border text-[11px] font-medium tabular transition-colors",
                  active ? "border-accent bg-accent-soft/60 text-foreground" : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                <span className="flex h-5 items-center justify-center">
                  <span className={cn("rounded-[3px] border-[1.5px]", active ? "border-accent bg-accent/15" : "border-current")} style={{ width: w * scale, height: h * scale }} />
                </span>
                {a}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Quality" hint={`${formatUsd(summary?.models.find((m) => m.id === draft.model)?.pricing?.[draft.quality] ?? 0)} per image`}>
        <Segmented<Quality>
          className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
          value={draft.quality}
          onChange={(q) => setDraft({ quality: q })}
          options={(summary?.qualities ?? ["1K", "2K", "4K"]).map((q) => ({ value: q, label: q }))}
        />
      </Group>

      <Group title="Number of images">
        <Segmented<string>
          className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
          value={String(draft.n)}
          onChange={(v) => setDraft({ n: Number(v) })}
          options={["1", "2", "3", "4"].map((v) => ({ value: v, label: v }))}
        />
      </Group>

      <Group title="Reference image" hint="Optional">
        <ReferenceDrop file={refImage} onChange={setRefImage} />
      </Group>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-wider text-subtle-foreground">{title}</h3>
        {hint && <span className="truncate text-[11.5px] tabular text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Drop zone / preview for the image-to-image reference. */
export function ReferenceDrop({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [over, setOver] = React.useState(false);

  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | undefined | null) => {
    const ok = acceptReference(f);
    if (ok) onChange(ok);
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={REF_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {file && preview ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Reference" className="size-12 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{file.name}</p>
            <p className="text-[11.5px] text-muted-foreground">Your prompt describes the change</p>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={() => onChange(null)} aria-label="Remove reference image">
            <X />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-3 py-4 text-center text-[12px] transition-colors",
            over ? "border-accent bg-accent-soft text-foreground" : "border-border-strong/70 text-muted-foreground hover:border-accent hover:text-foreground",
          )}
        >
          <ImagePlus className="size-5" />
          <span>
            <span className="font-medium text-foreground">Drop an image</span> or click to upload
          </span>
          <span className="text-[11px] text-subtle-foreground">Edit or restyle a picture · PNG, JPG, WEBP</span>
        </button>
      )}
    </>
  );
}
