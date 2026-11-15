"use client";

import * as React from "react";
import { Brain, ChartLine, Check, FileCode2, Globe, ImagePlus, KeyRound, Loader2, ShieldCheck, Sparkles, Wallet, X, Zap } from "lucide-react";
import { formatTokens } from "@nova/shared";
import { VendorLogo } from "@/components/vendor-logo";
import { KEY_PREFIX, cn } from "@/lib/utils";
import { useInView, useReducedMotion, useTicker, useTimeline, useTypewriter } from "../motion";

/**
 * "Platform" feature grid with small self-running demos. Everything renders as a finished,
 * static frame on the server; animation starts after mount, only while the grid is on screen,
 * and never for visitors who prefer reduced motion.
 */

export type ShowcaseImage = { src: string | null; fallback: string };

const KEYFRAMES = `
@keyframes fz-rise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
@keyframes fz-pop { from { opacity: 0; transform: translateY(4px) scale(.97) } to { opacity: 1; transform: none } }
@keyframes fz-caret { 50% { opacity: 0 } }
@keyframes fz-sweep { from { transform: translateX(-100%) } to { transform: translateX(100%) } }
@keyframes fz-drift { from { transform: scale(1) } to { transform: scale(1.12) translate(-2%, -2%) } }
@keyframes fz-flash { 0%, 100% { opacity: 1 } 50% { opacity: .55 } }
.fz-rise { animation: fz-rise .6s cubic-bezier(.2,.7,.2,1) both }
.fz-pop { animation: fz-pop .35s ease-out both }
.fz-caret { animation: fz-caret 1s steps(1) infinite }
.fz-sweep { animation: fz-sweep 1.1s ease-in-out infinite }
.fz-drift { animation: fz-drift 14s ease-in-out infinite alternate }
.fz-flash { animation: fz-flash .5s ease-in-out 2 }
@media (prefers-reduced-motion: reduce) { .fz-rise, .fz-pop, .fz-caret, .fz-sweep, .fz-drift, .fz-flash { animation: none !important } }
`;

// ── Hooks ───────────────────────────────────────────────

/** True while animations should run (grid on screen and motion allowed). */
const MotionOn = React.createContext(false);

// ── Building blocks ─────────────────────────────────────

const Chip = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 text-[12px] text-muted-foreground transition-colors duration-300", className)}>
    {children}
  </span>
);

type Phase = "static" | "armed" | "in";

function Card({ index, phase, icon, title, body, className, children }: { index: number; phase: Phase; icon: React.ReactNode; title: string; body: string; className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-xl hover:shadow-accent/5",
        phase === "armed" && "opacity-0",
        phase === "in" && "fz-rise",
        className,
      )}
      style={phase === "in" ? { animationDelay: `${index * 90}ms` } : undefined}
    >
      {/* Soft glow that follows the cursor */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), color-mix(in oklab, var(--accent) 10%, transparent), transparent 65%)" }}
      />
      <div className="relative p-6 pb-0">
        <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted text-accent transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 [&_svg]:size-4">
          {icon}
        </span>
        <h3 className="mt-4 text-[16px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="relative mt-auto p-6 pt-5">{children}</div>
    </div>
  );
}

// ── 1. One key, every model ─────────────────────────────

const SWAP = ["claude-sonnet-5-5", "gpt-5.5", "gemini-3.1-pro", "kimi-k3", "qwen3.7-max", "grok-4.6", "deepseek-v4.1-flash"];
const ENDPOINTS = ["/chat/completions", "/embeddings", "/images/generations", "/images/edits", "/models"];
const HITS = [0, 2, 0, 1, 0, 4, 0, 3, 0, 1];

function ModelSwapDemo() {
  const on = React.useContext(MotionOn);
  const tick = useTicker(on, 3200);
  const next = SWAP[tick % SWAP.length];
  const prev = SWAP[(tick + SWAP.length - 1) % SWAP.length];
  const typed = useTypewriter(next, on && tick > 0, 40);
  const hit = HITS[useTicker(on, 1100) % HITS.length];
  const latency = 180 + ((tick * 67) % 170);

  return (
    <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr]">
      <div className="overflow-hidden rounded-xl border border-border bg-background/70 font-mono text-[12px] leading-[1.9]">
        <div className="flex bg-danger-soft/70 px-3 text-danger">
          <span className="w-4 select-none">-</span>
          <span className="truncate">model=&quot;{prev}&quot;</span>
        </div>
        <div className="flex items-center gap-2 bg-success-soft/70 px-3 text-success">
          <span className="-mr-2 w-4 select-none">+</span>
          <span className="truncate">
            model=&quot;{typed.text}
            {!typed.done && <span className="fz-caret">▍</span>}
            {typed.done && '"'}
          </span>
          <VendorLogo modelId={next} className="ml-auto size-3.5 shrink-0" />
        </div>
        <div className="flex items-center px-3 text-subtle-foreground">
          <span className="inline-block w-4" /># same client, same code
          {typed.done && (
            <span key={tick} className="fz-pop ml-auto rounded bg-success-soft px-1.5 text-[10.5px] leading-[1.7] text-success">
              200 OK · {latency}ms
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap content-start gap-1.5">
        {ENDPOINTS.map((e, i) => (
          <Chip key={e} className={cn("font-mono text-[11.5px]", on && i === hit && "border-success/40 bg-success-soft text-foreground")}>
            <span className="relative flex size-1.5">
              {on && i === hit && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />}
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            {e}
          </Chip>
        ))}
      </div>
    </div>
  );
}

// ── 2. Live usage analytics ─────────────────────────────

const barAt = (n: number) => Math.round(Math.min(100, Math.max(18, 52 + 26 * Math.sin(n * 0.62) + ((n * 37) % 9) * 3.2)));

function AnalyticsDemo() {
  const on = React.useContext(MotionOn);
  const tick = useTicker(on, 1000);
  const bars = Array.from({ length: 14 }, (_, i) => barAt(i + tick));
  const requests = 12_480 + tick * 7 + ((tick * 13) % 5);
  const tokens = 8_240_000 + tick * 38_400;
  const p95 = 210 + ((tick * 29) % 90);

  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="relative flex size-1.5">
          {on && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />}
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        Live
      </div>
      <div className="flex h-16 items-end gap-1" aria-hidden>
        {bars.map((h, i) => (
          <div
            key={i}
            className={cn("flex-1 rounded-t-[3px] bg-linear-to-t from-accent/40 to-accent transition-[height] duration-700 ease-out", i === bars.length - 1 && "to-success from-success/40")}
            style={{ height: `${h}%`, opacity: 0.4 + i * 0.045 }}
          />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-subtle-foreground">Requests</p>
          <p className="font-medium tabular-nums text-foreground">{requests.toLocaleString("en-US")}</p>
        </div>
        <div>
          <p className="text-subtle-foreground">Tokens</p>
          <p className="font-medium tabular-nums text-foreground">{formatTokens(tokens)}</p>
        </div>
        <div className="text-right">
          <p className="text-subtle-foreground">p95</p>
          <p className="font-medium tabular-nums text-foreground">{p95}ms</p>
        </div>
      </div>
    </div>
  );
}

// ── 3. Per-key limits ───────────────────────────────────

const IP_LOG = [
  { ip: "203.0.113.4", ok: true },
  { ip: "203.0.113.4", ok: true },
  { ip: "198.51.100.7", ok: false },
  { ip: "203.0.113.4", ok: true },
  { ip: "192.0.2.55", ok: false },
];

function KeyLimitsDemo() {
  const on = React.useContext(MotionOn);
  const tick = useTicker(on, 1300);
  const step = tick % 10;
  const capped = on && step === 9;
  const spend = capped ? 5 : on ? 2.4 + step * 0.3 : 3.12;
  const pct = Math.min(100, (spend / 5) * 100);
  const rpm = on ? 54 + ((tick * 23) % 62) : 87;
  const log = [IP_LOG[(tick + IP_LOG.length - 1) % IP_LOG.length], IP_LOG[tick % IP_LOG.length]];

  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-accent" />
        <code className="font-mono text-[12px]">{KEY_PREFIX}••••3f9a</code>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-success">
          <span className="size-1.5 rounded-full bg-success" /> active
        </span>
      </div>

      <div className="mt-3 space-y-2 text-[11px]">
        <div>
          <div className="flex justify-between text-muted-foreground">
            <span>Spend</span>
            <span className={cn("tabular-nums", capped ? "fz-flash font-medium text-danger" : "text-foreground")}>
              {capped ? "cap reached → 402" : `$${spend.toFixed(2)} / $5.00`}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-[width,background-color] duration-700", capped ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-accent")} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-muted-foreground">
            <span>Requests this minute</span>
            <span className="tabular-nums text-foreground">{rpm} / 120</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-info transition-[width] duration-700" style={{ width: `${(rpm / 120) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 font-mono text-[11px]">
        {log.map((r, i) => (
          <div key={`${tick}-${i}`} className={cn("flex items-center gap-1.5", i === 1 && on && "fz-pop")}>
            {r.ok ? <Check className="size-3 text-success" /> : <X className="size-3 text-danger" />}
            <span className="text-foreground/80">{r.ip}</span>
            <span className={cn("ml-auto", r.ok ? "text-success" : "text-danger")}>{r.ok ? "allowed" : "blocked · 403"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. Image Studio ─────────────────────────────────────

const PROMPTS = [
  "a nebula shaped like a phoenix · cinematic · 2K",
  "aurora over a sleeping planet · photoreal · 4K",
  "storm clouds as an oil painting · watercolor · 1K",
  "a galaxy inside a glass marble · 3D · 2K",
];
const IMAGE_PRICE = 0.003;

function ImageStudioDemo({ images }: { images: ShowcaseImage[] }) {
  const on = React.useContext(MotionOn);
  // 0 typing → 1 generating → 2 done, one tile per cycle
  const { step, cycles } = useTimeline(on, [0, 1700, 3000], 4200);
  const round = Math.max(0, cycles - 1);
  const current = round % images.length;
  const prompt = useTypewriter(PROMPTS[current % PROMPTS.length], on && step === 0, 26);
  const made = on ? round + (step === 2 ? 1 : 0) : 0;
  const wallet = 2 - made * IMAGE_PRICE;
  const justMade = on && step === 2;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-[12px]">
        <Sparkles className="size-3.5 shrink-0 text-accent" />
        <span className="truncate text-foreground/90">
          {prompt.text}
          {on && step === 0 && !prompt.done && <span className="fz-caret">▍</span>}
        </span>
        <span className={cn("ml-auto shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors", on && step === 1 ? "bg-accent text-white" : "bg-muted text-muted-foreground")}>
          {on && step === 1 ? "Generating…" : "Generate"}
        </span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="grid flex-1 grid-cols-4 gap-2" aria-hidden>
          {images.map((img, i) => {
            const generating = on && i === current && step === 1;
            const fresh = on && i === current && step === 2;
            return (
              <div key={i} className={cn("relative aspect-square overflow-hidden rounded-lg ring-1 ring-border transition-shadow duration-500", fresh && "ring-2 ring-accent/70")}>
                <div
                  className={cn("fz-drift size-full bg-cover bg-center transition-[filter] duration-700", generating && "blur-md saturate-50")}
                  style={{ backgroundImage: img.src ? `url(${img.src}), ${img.fallback}` : img.fallback, animationDelay: `${i * -3.5}s`, animationPlayState: on ? "running" : "paused" }}
                />
                {generating && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/30 text-[10.5px] font-medium text-foreground">
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                      <div className="fz-sweep absolute inset-y-0 w-1/2 bg-linear-to-r from-transparent via-white/40 to-transparent" />
                    </div>
                    <Loader2 className="relative size-4 animate-spin" />
                    <span className="relative mt-1">Generating</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:w-52.5 sm:shrink-0">
          <Chip className={cn(justMade && "border-accent/40 text-foreground")}>
            <Wallet className="size-3.5" /> Image wallet <span className="tabular-nums text-foreground">${wallet.toFixed(4)}</span>
          </Chip>
          <Chip>1K · 2K · 4K</Chip>
          <Chip>16:9 · 1:1 · 9:16</Chip>
        </div>
      </div>
    </div>
  );
}

// ── 5. Playground ───────────────────────────────────────

const ANSWER = "Plan B is 18% cheaper per 1M tokens and adds vision. Here's a chart comparing both.";

function PlaygroundDemo() {
  const on = React.useContext(MotionOn);
  // 0 question · 1 thinking · 2 thought + searching · 3 searched · 4 answer typing · 5 artifact
  const { step } = useTimeline(on, [0, 700, 2300, 3700, 4300, 7400], 11000);
  const answer = useTypewriter(ANSWER, on && step === 4, 26);
  const show = (s: number) => !on || step >= s;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-background/70 p-3 text-[12.5px]">
      <div className="ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm bg-muted px-3 py-2">Compare these two pricing pages and build a summary chart</div>
      <div className="flex min-h-7 flex-wrap gap-1.5">
        {show(1) && (
          <Chip key={step >= 2 ? "t2" : "t1"} className="fz-pop">
            {on && step === 1 ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <Brain className="size-3.5 text-accent" />}
            {on && step === 1 ? "Thinking…" : "Thought for 6s"}
          </Chip>
        )}
        {show(2) && (
          <Chip key={step >= 3 ? "s2" : "s1"} className="fz-pop">
            {on && step === 2 ? <Loader2 className="size-3.5 animate-spin text-info" /> : <Globe className="size-3.5 text-info" />}
            {on && step === 2 ? "Searching the web…" : "Searched · 4 sources"}
            {(!on || step >= 3) && (
              <span className="ml-0.5 flex -space-x-1">
                {["bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-pink-400"].map((c) => (
                  <span key={c} className={cn("size-2.5 rounded-full ring-1 ring-card", c)} />
                ))}
              </span>
            )}
          </Chip>
        )}
        {show(5) && (
          <Chip className="fz-pop">
            <FileCode2 className="size-3.5 text-success" /> Artifact · chart.html
            <span className="ml-0.5 flex h-3 items-end gap-px">
              {[40, 75, 55, 100].map((h, i) => (
                <span key={i} className="w-1 rounded-sm bg-success/70" style={{ height: `${h}%` }} />
              ))}
            </span>
          </Chip>
        )}
      </div>
      {show(4) && (
        <p className="min-h-[2.5em] leading-relaxed text-foreground/85">
          {on && step === 4 ? answer.text : ANSWER}
          {on && step === 4 && !answer.done && <span className="fz-caret">▍</span>}
        </p>
      )}
    </div>
  );
}

// ── 6. Payments ─────────────────────────────────────────

const METHODS = [
  { name: "Binance Pay", auto: true, wait: "Verifying…", done: "Plan activated" },
  { name: "USDT · BEP-20", auto: true, wait: "Checking chain…", done: "Confirmed" },
  { name: "JazzCash", auto: false, wait: "In review…", done: "Approved" },
  { name: "Easypaisa", auto: false, wait: "In review…", done: "Approved" },
  { name: "Bank transfer", auto: false, wait: "In review…", done: "Approved" },
];

function PaymentsDemo() {
  const on = React.useContext(MotionOn);
  const { step, cycles } = useTimeline(on, [0, 1300], 2600);
  const current = on ? Math.max(0, cycles - 1) % METHODS.length : 0;
  const m = METHODS[current];
  const done = !on || step === 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {METHODS.map((x, i) => (
          <Chip key={x.name} className={cn(on && i === current && "border-accent/50 bg-accent-soft text-foreground")}>
            {x.name}
          </Chip>
        ))}
      </div>
      <div key={`${current}-${done}`} className="fz-pop flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-[12px]">
        {done ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-success text-white">
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{m.name}</span> <span className="text-muted-foreground">· {done ? m.done : m.wait}</span>
        </span>
        <span className={cn("ml-auto shrink-0 rounded px-1.5 text-[10.5px] font-medium", m.auto ? "bg-success-soft text-success" : "bg-info-soft text-info")}>{m.auto ? "auto" : "reviewed"}</span>
      </div>
    </div>
  );
}

// ── Grid ────────────────────────────────────────────────

export function FeaturesGrid({ images }: { images: ShowcaseImage[] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [phase, setPhase] = React.useState<Phase>("static");

  // Entrance: if the grid starts below the fold, hide the cards and fade them in when it scrolls into view
  React.useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top > window.innerHeight) setPhase("armed");
  }, []);
  React.useEffect(() => {
    if (inView && phase === "armed") setPhase("in");
  }, [inView, phase]);

  const on = inView && !reduced;
  const card = (i: number) => ({ index: i, phase });

  return (
    <MotionOn.Provider value={on}>
      <style>{KEYFRAMES}</style>
      <div ref={ref} className="grid gap-4 md:grid-cols-3">
        <Card
          {...card(0)}
          icon={<Zap />}
          title="One key, every model"
          body="A single OpenAI-compatible /v1 endpoint for chat, reasoning, vision, embeddings and images. Switching models is a one-string change."
          className="md:col-span-2"
        >
          <ModelSwapDemo />
        </Card>
        <Card {...card(1)} icon={<ChartLine />} title="Live usage analytics" body="Tokens, requests, latency and cost per key and per model — updated as requests land, with full request logs.">
          <AnalyticsDemo />
        </Card>
        <Card {...card(2)} icon={<ShieldCheck />} title="Per-key spend caps & IP allowlists" body="Give every app its own key with scopes, a request-rate cap, token and spend limits, model and IP allowlists, and an expiry date.">
          <KeyLimitsDemo />
        </Card>
        <Card
          {...card(3)}
          icon={<ImagePlus />}
          title="Image Studio with its own wallet"
          body="Generate and edit up to 4K with style presets and any aspect ratio. Images are paid per image from a separate image wallet — failed images are never charged."
          className="md:col-span-2"
        >
          <ImageStudioDemo images={images} />
        </Card>
        <Card
          {...card(4)}
          icon={<Brain />}
          title="A Playground that thinks out loud"
          body="Test any model in the browser with visible reasoning, live web search with sources, and artifacts you can preview, copy or download."
          className="md:col-span-2"
        >
          <PlaygroundDemo />
        </Card>
        <Card {...card(5)} icon={<Wallet />} title="Pay the way you already pay" body="Crypto is verified automatically; local PKR transfers are reviewed by a person and credited to your balance.">
          <PaymentsDemo />
        </Card>
      </div>
    </MotionOn.Provider>
  );
}
