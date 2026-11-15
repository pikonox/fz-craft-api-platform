"use client";

import * as React from "react";
import { formatTokenPrice } from "@nova/shared";
import { BrandLogo } from "@/components/brand";
import { VendorLogo } from "@/components/vendor-logo";
import { useModels } from "@/lib/queries";
import { API_BASE_URL, cn } from "@/lib/utils";

/** Tools that accept a custom base URL (OpenAI-compatible, or Anthropic for Claude Code). */
const TOOLS = [
  { id: "cursor", name: "Cursor" },
  { id: "claudecode", name: "Claude Code" },
  { id: "cline", name: "Cline" },
  { id: "roocode", name: "Roo Code" },
  { id: "kilocode", name: "Kilo Code" },
  { id: "opencode", name: "opencode" },
  { id: "openaisdk", name: "OpenAI SDK" },
];

type Row = { id: string; name: string; vendor: string; price: number };

/** Shown before the live catalog loads (and if it can't be reached). */
const FALLBACK: Row[] = [
  { id: "claude-fable-5", name: "Claude Fable 5", vendor: "Anthropic", price: 16_610_000 },
  { id: "gpt-5.5", name: "GPT-5.5", vendor: "OpenAI", price: 8_950_000 },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", vendor: "Google", price: 4_470_000 },
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", vendor: "DeepSeek", price: 56_000 },
  { id: "kimi-k3", name: "Kimi K3", vendor: "Moonshot", price: 4_980_000 },
  { id: "qwen3.7-max", name: "Qwen3.7 Max", vendor: "Alibaba", price: 1_760_000 },
  { id: "grok-4.6", name: "Grok 4.6", vendor: "xAI", price: 2_810_000 },
];

const STEP_MS = 2600;
const HOST = API_BASE_URL.replace(/^https?:\/\//, "");

type Paths = { left: string[]; right: string[]; w: number; h: number };

function curve(sx: number, sy: number, ex: number, ey: number) {
  const dx = (ex - sx) * 0.55;
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`;
}

export function RoutingDiagram() {
  const { data } = useModels();
  const live = React.useMemo(() => (data ?? []).filter((m) => m.type === "chat" && m.status !== "maintenance"), [data]);
  const total = React.useMemo(() => (data ?? []).filter((m) => m.status !== "maintenance").length, [data]);
  const rows: Row[] = React.useMemo(() => {
    if (!live.length) return FALLBACK;
    const picked = FALLBACK.map((f) => live.find((m) => m.id === f.id)).filter((m): m is (typeof live)[number] => Boolean(m));
    const list = picked.length >= 5 ? picked : live.slice(0, 7);
    return list.map((m) => ({ id: m.id, name: m.name, vendor: m.vendor, price: m.pricing.inputPer1M }));
  }, [live]);

  // ── Animation: one request every STEP_MS, paused off-screen and for reduced motion ──
  const wrap = React.useRef<HTMLDivElement>(null);
  const [step, setStep] = React.useState(0);
  const [animate, setAnimate] = React.useState(false);
  React.useEffect(() => {
    const el = wrap.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number | undefined;
    const io = new IntersectionObserver(([e]) => {
      window.clearInterval(timer);
      setAnimate(e.isIntersecting);
      if (e.isIntersecting) timer = window.setInterval(() => setStep((s) => s + 1), STEP_MS);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const tool = step % TOOLS.length;
  const target = (step * 3 + 3) % rows.length;
  const latency = 180 + ((step * 53) % 150);
  const tokens = 640 + ((step * 271) % 1400);

  // ── Connector geometry, measured from the real elements ──
  const leftRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const rightRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const card = React.useRef<HTMLDivElement>(null);
  const [paths, setPaths] = React.useState<Paths | null>(null);

  const measure = React.useCallback(() => {
    const root = wrap.current;
    const c = card.current;
    if (!root || !c || root.clientWidth < 960) return setPaths(null);
    const r = root.getBoundingClientRect();
    const cb = c.getBoundingClientRect();
    const at = (n: number, i: number, from: number, to: number) => cb.top - r.top + cb.height * (n === 1 ? 0.5 : from + ((to - from) * i) / (n - 1));
    const left = TOOLS.map((_, i) => {
      const b = leftRefs.current[i]?.getBoundingClientRect();
      if (!b) return "";
      return curve(b.right - r.left, b.top - r.top + b.height / 2, cb.left - r.left, at(TOOLS.length, i, 0.24, 0.76));
    });
    const right = rows.map((_, i) => {
      const b = rightRefs.current[i]?.getBoundingClientRect();
      if (!b) return "";
      return curve(cb.right - r.left, at(rows.length, i, 0.2, 0.8), b.left - r.left, b.top - r.top + b.height / 2);
    });
    setPaths({ left, right, w: r.width, h: r.height });
  }, [rows]);

  React.useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [measure]);

  const active = rows[target];

  return (
    <div ref={wrap} className="relative">
      <style>{`
        @keyframes fz-in { from { opacity: 0; transform: translateY(3px) } to { opacity: 1; transform: none } }
        @keyframes fz-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
        .fz-in { animation: fz-in .35s ease-out both }
        .fz-draw { stroke-dasharray: 1; animation: fz-draw .8s cubic-bezier(.4,0,.2,1) both }
      `}</style>

      {/* Connectors (large screens) */}
      {paths && (
        <svg className="pointer-events-none absolute inset-0 hidden lg:block" width={paths.w} height={paths.h} aria-hidden>
          <defs>
            <linearGradient id="fz-route-l" x1="0" x2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity=".25" />
              <stop offset="1" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          {paths.left.map((d, i) => (
            <path key={`l${i}`} d={d} fill="none" stroke="var(--border-strong)" strokeWidth={1.25} opacity={i === tool ? 0 : 0.9} />
          ))}
          {paths.right.map((d, i) => (
            <path key={`r${i}`} d={d} fill="none" stroke="var(--border-strong)" strokeWidth={1.25} strokeDasharray="1.5 5" strokeLinecap="round" opacity={i === target ? 0 : 0.9} />
          ))}
          {paths.left[tool] && (
            <g key={`al${step}`}>
              <path d={paths.left[tool]} fill="none" stroke="var(--accent)" strokeOpacity=".18" strokeWidth={7} strokeLinecap="round" />
              <path d={paths.left[tool]} pathLength={1} className={animate ? "fz-draw" : undefined} fill="none" stroke="url(#fz-route-l)" strokeWidth={2} strokeLinecap="round" />
              {animate && (
                <circle r={4} fill="var(--accent)">
                  <animateMotion dur="0.8s" fill="freeze" path={paths.left[tool]} />
                </circle>
              )}
            </g>
          )}
          {paths.right[target] && (
            <g key={`ar${step}`}>
              <path
                d={paths.right[target]}
                pathLength={1}
                className={animate ? "fz-draw" : undefined}
                style={animate ? { animationDelay: "0.85s" } : undefined}
                fill="none"
                stroke="var(--success)"
                strokeWidth={2}
                strokeLinecap="round"
              />
              {animate && (
                <circle r={4} fill="var(--success)" opacity={0}>
                  <set attributeName="opacity" to="1" begin="0.85s" />
                  <animateMotion dur="0.8s" begin="0.85s" fill="freeze" path={paths.right[target]} />
                </circle>
              )}
            </g>
          )}
        </svg>
      )}

      <div className="relative grid items-center gap-8 lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,290px)] lg:gap-20 xl:gap-24">
        {/* Tools */}
        <div className="flex flex-wrap justify-center gap-2.5 lg:flex-col lg:items-end lg:gap-4">
          {TOOLS.map((t, i) => (
            <div
              key={t.id}
              ref={(el) => {
                leftRefs.current[i] = el;
              }}
              className={cn(
                "flex h-12 items-center gap-2.5 rounded-xl border bg-card pl-2 pr-4 text-[14px] font-medium shadow-sm transition-all duration-300",
                i === tool ? "border-accent/60 ring-4 ring-accent/15" : "border-border",
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                <VendorLogo vendor={t.id} className="size-4.5" />
              </span>
              {t.name}
            </div>
          ))}
        </div>

        {/* Gateway card */}
        <div className="relative">
          <div className="pointer-events-none absolute -inset-10 rounded-[40px] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--accent)_22%,transparent),transparent)] blur-2xl" aria-hidden />
          <div ref={card} className="relative rounded-3xl border border-border bg-card/95 p-5 shadow-xl shadow-black/5 backdrop-blur sm:p-6 dark:shadow-black/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <BrandLogo className="h-10" />
                <p className="mt-1.5 truncate font-mono text-[12.5px] text-muted-foreground">{HOST}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-medium text-success">
                <span className="size-1.5 animate-pulse rounded-full bg-success" /> Live
              </span>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0b0b10] p-4 font-mono text-[13px] leading-[1.9] text-zinc-300 ring-1 ring-white/5 sm:p-5">
              <p>
                <span className="font-semibold text-violet-400">POST</span> <span className="text-zinc-100">/v1/chat/completions</span>
              </p>
              <p key={`f${step}`} className="fz-in flex gap-4">
                <span className="w-12 text-zinc-500">from</span>
                <span className="text-zinc-100">{TOOLS[tool].name}</span>
              </p>
              <p key={`m${step}`} className="fz-in flex gap-4" style={{ animationDelay: "0.25s" }}>
                <span className="w-12 text-zinc-500">model</span>
                <span className="truncate text-sky-300">{active?.id}</span>
              </p>
              <p key={`s${step}`} className="fz-in flex gap-4" style={{ animationDelay: "1.5s" }}>
                <span className="w-12 text-zinc-500">reply</span>
                <span className="text-emerald-400">
                  200 OK · {latency}ms · {tokens.toLocaleString()} tokens
                </span>
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {["One key", total ? `${total} models` : "30+ models", "OpenAI + Anthropic API", "Automatic failover"].map((c) => (
                <span key={c} className="rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-[12.5px] text-muted-foreground">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Models */}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 lg:gap-3">
          {rows.map((m, i) => (
            <div
              key={m.id}
              ref={(el) => {
                rightRefs.current[i] = el;
              }}
              className={cn(
                "relative flex h-12 items-center gap-2.5 rounded-xl border bg-card pl-2 pr-3.5 shadow-sm transition-all duration-300",
                i === target ? "border-success/60 ring-4 ring-success/15" : "border-border",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                <VendorLogo vendor={m.vendor} modelId={m.id} className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{m.name}</span>
              <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{formatTokenPrice(m.price)}</span>
              {i === target && (
                <span key={`b${step}`} className="fz-in absolute -top-2.5 right-3 rounded-full bg-success px-2 py-0.5 font-mono text-[10.5px] font-semibold text-white shadow-sm" style={{ animationDelay: "1.5s" }}>
                  200 · {latency}ms
                </span>
              )}
            </div>
          ))}
          <p className="text-center text-[11.5px] text-subtle-foreground lg:text-right">Price per 1M input tokens</p>
        </div>
      </div>
    </div>
  );
}
