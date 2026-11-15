"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Lock, Search, Wrench } from "lucide-react";
import { formatTokens } from "@nova/shared";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { CAP_META, VendorMark } from "@/components/model-meta";
import type { ModelInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModelPicker({ models, value, onChange, className }: { models: ModelInfo[]; value: string; onChange: (id: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = models.find((m) => m.id === value);
  const list = useMemo(() => models.filter((m) => !q || `${m.name} ${m.id} ${m.vendor}`.toLowerCase().includes(q.toLowerCase())), [models, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn("flex h-9 min-w-0 items-center gap-2 rounded-lg border border-border bg-card pl-1.5 pr-2.5 text-[13.5px] font-medium transition-colors hover:bg-muted", className)}>
          <VendorMark vendor={current?.vendor ?? ""} modelId={current?.id} className="size-6 rounded-md text-[10px]" />
          <span className="truncate">{current?.name ?? "Select a model"}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] max-w-[calc(100vw-24px)] p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground" />
        </div>
        <ul className="scrollbar-thin max-h-[360px] overflow-y-auto p-1.5">
          {list.map((m) => (
            <li key={m.id}>
              <button
                disabled={!m.available || m.status === "maintenance"}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={cn("flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50", m.id === value && "bg-muted")}
              >
                <VendorMark vendor={m.vendor} modelId={m.id} className="size-8 rounded-lg text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium">
                    {m.name}
                    {m.status === "maintenance" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-normal text-subtle-foreground">
                        <Wrench className="size-3" /> Maintenance
                      </span>
                    ) : (
                      !m.available && <Lock className="size-3 text-warning" />
                    )}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {m.id} · {formatTokens(m.contextLength)} ctx
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {m.capabilities
                      .filter((c) => c !== "streaming")
                      .map((c) => {
                        const meta = CAP_META[c];
                        return meta ? (
                          <span key={c} className="inline-flex items-center gap-1 rounded bg-muted-2 px-1.5 py-px text-[10.5px] text-muted-foreground">
                            <meta.icon className="size-2.5" /> {meta.label}
                          </span>
                        ) : null;
                      })}
                  </span>
                </span>
                {m.id === value && <Check className="mt-1 size-4 text-accent" />}
              </button>
            </li>
          ))}
          {!list.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No models found</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
