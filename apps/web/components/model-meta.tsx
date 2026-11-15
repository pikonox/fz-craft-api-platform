"use client";

import { Brain, Eye, FileJson, ImageIcon, Wrench, Zap } from "lucide-react";
import { formatTokenPrice, formatUsd } from "@nova/shared";
import type { ModelInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand";
import { VendorLogo, hasVendorLogo, isOwnBrand } from "@/components/vendor-logo";

export const CAP_META: Record<string, { label: string; icon: typeof Brain }> = {
  reasoning: { label: "Reasoning", icon: Brain },
  vision: { label: "Vision", icon: Eye },
  tools: { label: "Tools", icon: Wrench },
  streaming: { label: "Streaming", icon: Zap },
  json: { label: "JSON", icon: FileJson },
};

export const TYPE_LABEL = { chat: "Chat", image: "Image", embedding: "Embedding" };

export function priceLine(m: ModelInfo) {
  if (m.type === "image") return `from ${formatUsd(m.pricing.perImage["1K"])} / image`;
  if (!m.pricing.inputPer1M && !m.pricing.outputPer1M) return "Included";
  return `${formatTokenPrice(m.pricing.inputPer1M)} in · ${formatTokenPrice(m.pricing.outputPer1M)} out / 1M`;
}

const VENDOR_HUES = ["from-violet-500 to-indigo-500", "from-sky-500 to-cyan-400", "from-emerald-500 to-teal-400", "from-amber-500 to-orange-400", "from-pink-500 to-rose-400"];

/** Provider logo on a neutral tile; falls back to a coloured monogram for vendors without a known logo. */
export function VendorMark({ vendor, type, modelId, className }: { vendor: string; type?: string; modelId?: string; className?: string }) {
  if (isOwnBrand(vendor)) {
    return (
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm dark:bg-muted", className)}>
        <LogoMark className="size-[78%]" />
      </span>
    );
  }
  if (hasVendorLogo(vendor, modelId)) {
    return (
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm dark:bg-muted", className)}>
        <VendorLogo vendor={vendor} modelId={modelId} className="size-[58%]" />
      </span>
    );
  }
  const h = [...(vendor || "?")].reduce((n, c) => n + c.charCodeAt(0), 0) % VENDOR_HUES.length;
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-sm", VENDOR_HUES[h], className)}>
      {type === "image" ? <ImageIcon className="size-[18px]" /> : (vendor || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

