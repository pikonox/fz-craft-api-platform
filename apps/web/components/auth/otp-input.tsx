"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Six single-digit boxes with paste support. */
export function OtpInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");

  const set = (i: number, d: string) => {
    const arr = value.padEnd(6, " ").split("").slice(0, 6);
    arr[i] = d || " ";
    const next = arr.join("").replace(/\s+$/, "");
    onChange(next);
    if (next.replace(/\s/g, "").length === 6) onComplete?.(next.replace(/\s/g, ""));
  };

  return (
    <div className="flex justify-between gap-2" onPaste={(e) => {
      const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      if (!text) return;
      e.preventDefault();
      onChange(text);
      refs.current[Math.min(text.length, 5)]?.focus();
      if (text.length === 6) onComplete?.(text);
    }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={d.trim()}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(-1);
            set(i, v);
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d.trim() && i > 0) {
              refs.current[i - 1]?.focus();
              set(i - 1, "");
            }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          className={cn(
            "h-13 w-full min-w-0 rounded-xl border border-border bg-card text-center font-mono text-xl font-semibold shadow-xs outline-none transition-colors focus:border-accent focus:ring-3 focus:ring-ring/40",
          )}
        />
      ))}
    </div>
  );
}
