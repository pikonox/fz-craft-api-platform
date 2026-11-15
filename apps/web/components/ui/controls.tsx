"use client";

import * as React from "react";
import { Slider as S, Switch as Sw } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ checked, onCheckedChange, disabled, className, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; className?: string; id?: string }) {
  return (
    <Sw.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-transparent bg-muted-2 transition-colors data-[state=checked]:bg-accent disabled:opacity-50",
        className,
      )}
    >
      <Sw.Thumb className="block size-[18px] translate-x-[1px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[17px]" />
    </Sw.Root>
  );
}

export function Slider({ value, onValueChange, min, max, step, className }: { value: number; onValueChange: (v: number) => void; min: number; max: number; step: number; className?: string }) {
  return (
    <S.Root className={cn("relative flex h-5 w-full touch-none select-none items-center", className)} value={[value]} min={min} max={max} step={step} onValueChange={(v) => onValueChange(v[0])}>
      <S.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted-2">
        <S.Range className="absolute h-full rounded-full bg-accent" />
      </S.Track>
      <S.Thumb className="block size-4 rounded-full border-2 border-accent bg-white shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40" aria-label="Value" />
    </S.Root>
  );
}

/** Pill-style segmented control (tabs, ranges, toggles). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={cn("no-scrollbar inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-all",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
            value === o.value ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("rounded px-1 text-[11px] tabular", value === o.value ? "bg-muted text-muted-foreground" : "text-subtle-foreground")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Underlined tabs for page sections. */
export function UnderlineTabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("no-scrollbar flex gap-1 overflow-x-auto border-b border-border", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors",
            value === o.value ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="rounded-md bg-muted px-1.5 text-[11px] text-muted-foreground tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
