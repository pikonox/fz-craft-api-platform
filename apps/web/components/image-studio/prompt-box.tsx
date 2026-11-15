"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Paperclip, SlidersHorizontal, Sparkles, Wallet, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/api";
import { useCheckout } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { unitPrice, type Draft, type StudioSummary } from "./lib";
import { REF_TYPES, acceptReference } from "./settings-panel";

const MAX_PROMPT = 4000;

type Props = {
  summary?: StudioSummary;
  draft: Draft;
  setDraft: (patch: Partial<Draft>) => void;
  refImage: File | null;
  setRefImage: (f: File | null) => void;
  onGenerate: () => void;
  generating: boolean;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Opens the settings sheet on small screens. */
  onOpenSettings: () => void;
};

export function PromptBox({ summary, draft, setDraft, refImage, setRefImage, onGenerate, generating, promptRef, onOpenSettings }: Props) {
  const start = useCheckout((s) => s.start);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [refPreview, setRefPreview] = React.useState<string | null>(null);

  const price = unitPrice(summary, draft);
  const total = price * draft.n;
  const balance = summary?.imageBalance;
  const short = balance !== undefined && summary !== undefined && summary.models.length > 0 && total > balance;
  const canGenerate = Boolean(summary && draft.model && draft.prompt.trim()) && !short && !generating;
  const model = summary?.models.find((m) => m.id === draft.model);
  // Same price at every quality → no need to mention the quality in the hint
  const flatPrice = new Set(Object.values(model?.pricing ?? {})).size <= 1;
  const styleLabel = summary?.styles.find((s) => s.id === draft.style)?.label;

  // Grow with the text, up to a limit
  React.useLayoutEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [draft.prompt, promptRef]);

  React.useEffect(() => {
    if (!refImage) {
      setRefPreview(null);
      return;
    }
    const url = URL.createObjectURL(refImage);
    setRefPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [refImage]);

  const enhance = useMutation({
    mutationFn: () => api<{ prompt: string }>("/api/studio/enhance", { body: { prompt: draft.prompt.trim(), style: draft.style } }),
    onSuccess: (r) => {
      setDraft({ prompt: r.prompt.slice(0, MAX_PROMPT) });
      toast.success("Prompt enhanced");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-accent/50 focus-within:shadow-lg focus-within:shadow-accent/5">
      {refImage && refPreview && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/60 py-1 pl-1 pr-1.5 text-[12px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refPreview} alt="" className="size-7 rounded-md object-cover" />
            <span className="truncate">Reference · {refImage.name}</span>
            <button type="button" onClick={() => setRefImage(null)} className="rounded p-0.5 text-muted-foreground hover:bg-muted-2 hover:text-foreground" aria-label="Remove reference image">
              <X className="size-3.5" />
            </button>
          </span>
        </div>
      )}

      <label htmlFor="studio-prompt" className="sr-only">
        Prompt
      </label>
      <textarea
        id="studio-prompt"
        ref={promptRef}
        value={draft.prompt}
        maxLength={MAX_PROMPT}
        rows={3}
        onChange={(e) => setDraft({ prompt: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canGenerate) onGenerate();
          }
        }}
        onPaste={(e) => {
          const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
          if (f) {
            e.preventDefault();
            const ok = acceptReference(f);
            if (ok) setRefImage(ok);
          }
        }}
        placeholder={refImage ? "Describe what to change in the reference image…" : "Describe the image you want to create…"}
        className="block min-h-[84px] w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed placeholder:text-subtle-foreground focus:outline-none"
      />

      <input
        ref={fileInput}
        type="file"
        accept={REF_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const ok = acceptReference(e.target.files?.[0]);
          if (ok) setRefImage(ok);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pt-1.5">
        <Tooltip content="Add a reference image (or paste one)">
          <Button variant="ghost" size="icon-sm" onClick={() => fileInput.current?.click()} aria-label="Add a reference image">
            <Paperclip />
          </Button>
        </Tooltip>
        <Tooltip content="Rewrite your idea into a detailed prompt">
          <Button variant="ghost" size="sm" disabled={draft.prompt.trim().length < 2 || enhance.isPending} onClick={() => enhance.mutate()}>
            {enhance.isPending ? <Spinner className="size-4" /> : <Wand2 />} Enhance
          </Button>
        </Tooltip>

        {/* On small screens the settings live in a sheet; this chip shows them and opens it */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-[12px] text-muted-foreground hover:text-foreground lg:hidden"
        >
          <SlidersHorizontal className="size-3.5 shrink-0" />
          <span className="truncate">{[model?.name, draft.style !== "none" ? styleLabel : null, draft.aspect, draft.quality, `×${draft.n}`].filter(Boolean).join(" · ")}</span>
        </button>

        <div className="ml-auto flex items-center gap-3 pl-1">
          {price > 0 && (
            <span className="hidden text-[12px] tabular text-muted-foreground sm:inline">
              {draft.n > 1 ? `${draft.n} × ${formatUsd(price)} = ` : ""}
              <span className="font-semibold text-foreground">{formatUsd(total)}</span>
            </span>
          )}
          <Button variant="accent" className="h-10 rounded-xl px-5" disabled={!canGenerate} onClick={onGenerate}>
            {generating ? <Spinner className="text-current" /> : <Sparkles />}
            {generating ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>

      {short && (
        <div className="flex flex-col gap-2.5 rounded-b-2xl border-t border-border bg-accent-soft/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-[13px]">
            <Wallet className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              {balance ? `You have ${formatUsd(balance)} in image credits — this needs ${formatUsd(total)}.` : "Add image credits to start generating."}
              {price > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  $1 makes about {formatNumber(Math.floor(1e6 / price))} images{flatPrice ? "" : ` at ${draft.quality}`}.
                </span>
              )}
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="accent" size="sm" onClick={() => start({ purpose: "image_wallet", amountUsd: 1 })}>
              Add $1
            </Button>
            <Button variant="outline" size="sm" onClick={() => start({ purpose: "image_wallet" })}>
              Other amount
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small hint line under the prompt box. */
export function PromptHint({ length }: { length: number }) {
  return (
    <div className="mt-2 hidden items-center justify-between px-1 text-[11.5px] text-subtle-foreground sm:flex">
      <span>⌘/Ctrl + Enter to generate · paste an image to use it as a reference</span>
      <span className={cn("tabular", length > MAX_PROMPT * 0.9 && "text-warning")}>
        {length}/{MAX_PROMPT}
      </span>
    </div>
  );
}
