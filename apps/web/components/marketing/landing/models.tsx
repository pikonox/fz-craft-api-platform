"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/primitives";
import { useModels } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand";
import { VendorLogo, hasVendorLogo, isOwnBrand } from "@/components/vendor-logo";

const HUES = [
  "from-violet-500 to-indigo-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-pink-500 to-rose-400",
  "from-fuchsia-500 to-violet-400",
];

function hueFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

/** Provider logo on a neutral tile; a coloured monogram when the vendor has no known logo. */
function Monogram({ name, modelId, className }: { name: string; modelId?: string; className?: string }) {
  if (isOwnBrand(name)) {
    return (
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background", className)} aria-hidden>
        <LogoMark className="size-[82%]" />
      </span>
    );
  }
  if (hasVendorLogo(name, modelId)) {
    return (
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground", className)} aria-hidden>
        <VendorLogo vendor={name} modelId={modelId} className="size-[64%]" />
      </span>
    );
  }
  return (
    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-[11px] font-semibold text-white", hueFor(name), className)} aria-hidden>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

// ── Marquee strip under the hero ───────────────────────

export function ModelStrip() {
  const { data, isPending } = useModels();
  const models = data ?? [];
  // Repeat short catalogs so one copy is always wider than the viewport, then duplicate for a seamless loop.
  const base = models.length ? Array.from({ length: Math.max(1, Math.ceil(10 / models.length)) }, () => models).flat() : [];
  const vendors = new Set(models.map((m) => m.vendor).filter(Boolean));

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-center text-[13px] text-muted-foreground">
        {isPending ? (
          "Loading the model catalog…"
        ) : models.length ? (
          <>
            <span className="font-medium text-foreground">{models.length} models</span> from <span className="font-medium text-foreground">{vendors.size} labs</span> behind one endpoint — chat, reasoning, vision, embeddings and images
          </>
        ) : (
          "Chat, reasoning, vision, embeddings and images behind one endpoint"
        )}
      </p>
      <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <style>{`@keyframes mkt-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
        {isPending ? (
          <div className="flex justify-center gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-48 shrink-0 rounded-full" />
            ))}
          </div>
        ) : (
          <div
            className="flex w-max animate-[mkt-marquee_50s_linear_infinite] gap-3 hover:[animation-play-state:paused] motion-reduce:animate-none"
            // Speed stays the same however many models there are: ~1.8s per model chip
            style={{ animationDuration: `${Math.max(40, Math.round(base.length * 1.8))}s` }}
          >
            {[...base, ...base].map((m, i) => (
              <span key={`${m.id}-${i}`} className="flex h-10 shrink-0 items-center gap-2.5 rounded-full border border-border bg-card/70 pl-2 pr-4 text-[13px] backdrop-blur" aria-hidden={i >= base.length}>
                <Monogram name={m.vendor || m.name} modelId={m.id} />
                <span className="font-medium">{m.vendor || "—"}</span>
                <span className="text-subtle-foreground">·</span>
                <span className="text-muted-foreground">{m.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
