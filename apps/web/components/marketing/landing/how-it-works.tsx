"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Mail, Timer, UserPlus, Zap } from "lucide-react";
import { API_BASE_URL, KEY_PREFIX, cn } from "@/lib/utils";
import { useInView, useReducedMotion, useScramble, useTimeline, useTypewriter } from "../motion";

/**
 * "How it works": the three steps play out in order — sign up, create a key, make the first
 * request — with a progress line between them and a stopwatch. Static (finished) on the
 * server, paused off-screen and for reduced motion.
 */

// Sub-steps of one 14.5s loop. Steps 0–2: account · 3–5: key · 6–8: first request.
const TIMELINE = [0, 1900, 2500, 4500, 5100, 6700, 9000, 11300, 11900];
const CYCLE = 14500;
const EMAIL = "you@company.com";
const KEY = `${KEY_PREFIX}8kQ2…f3a9`;
const CODE = `base_url="${API_BASE_URL}"`;
const REPLY = "Hello! How can I help today?";
const FIRST_TOKEN_SECONDS = 47;

const STEPS = [
  { icon: UserPlus, title: "Create a free account", body: "Sign up with email or Google. The free plan includes a monthly token allowance and the free models — no payment details." },
  { icon: KeyRound, title: "Create an API key", body: "Name it, choose scopes and optional limits. The key is shown once — store it as a secret." },
  { icon: Zap, title: "Point your SDK at us", body: "Set the base URL and key in any OpenAI or Anthropic SDK, framework or tool. Your existing code keeps working." },
];

function Caret() {
  return <span className="hiw-caret ml-px inline-block w-[0.5ch] text-accent">▍</span>;
}

export function HowItWorksDemo() {
  const ref = React.useRef<HTMLOListElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const on = inView && !reduced;
  const { step, cycles } = useTimeline(on, TIMELINE, CYCLE);
  const card = on ? (step < 3 ? 0 : step < 6 ? 1 : 2) : -1; // -1 = everything finished (static)
  const reached = (s: number) => !on || step >= s;

  // 1 · account
  const email = useTypewriter(EMAIL, on && step === 0, 70);
  // 2 · key
  const key = useScramble(KEY, on && step === 4, 1300);
  // 3 · first request
  const code = useTypewriter(CODE, on && step === 6, 38);
  const reply = useTypewriter(REPLY, on && step === 8, 40);

  // Stopwatch: story-time from sign-up to first token
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (!on) return;
    const start = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Date.now() - start), 200);
    return () => window.clearInterval(id);
  }, [on, cycles]);
  const seconds = on ? Math.min(FIRST_TOKEN_SECONDS, Math.floor((elapsed / TIMELINE[8]) * FIRST_TOKEN_SECONDS)) : FIRST_TOKEN_SECONDS;
  const finished = !on || step === 8;

  // Progress line: 0 → 50% → 100% across the three cards
  const progress = card === -1 ? 100 : card * 50;

  return (
    <div>
      <style>{`
        @keyframes hiw-pop { from { opacity: 0; transform: translateY(4px) scale(.96) } to { opacity: 1; transform: none } }
        @keyframes hiw-caret { 50% { opacity: 0 } }
        @keyframes hiw-glow { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 35%, transparent) } 50% { box-shadow: 0 0 0 8px transparent } }
        .hiw-pop { animation: hiw-pop .35s ease-out both }
        .hiw-caret { animation: hiw-caret 1s steps(1) infinite }
        .hiw-glow { animation: hiw-glow 1.8s ease-out infinite }
        @media (prefers-reduced-motion: reduce) { .hiw-pop, .hiw-caret, .hiw-glow { animation: none } }
      `}</style>

      <ol ref={ref} className="relative grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
        {/* Connector with a fill that follows the active step */}
        <div className="pointer-events-none absolute left-[16%] right-[16%] top-[42px] hidden h-px bg-border-strong md:block" aria-hidden>
          <div className="h-full bg-linear-to-r from-violet-500 to-sky-400 transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
        </div>

        {STEPS.map((s, i) => {
          const active = card === i;
          const done = card === -1 || card > i;
          return (
            <li
              key={s.title}
              className={cn(
                "relative flex min-w-0 flex-col rounded-2xl border bg-card p-5 transition-[border-color,box-shadow,transform] duration-500 sm:p-6",
                active ? "-translate-y-1 border-accent/40 shadow-xl shadow-accent/10" : "border-border",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-sky-400 text-white shadow-lg shadow-accent/20 transition-transform duration-500",
                    active && "hiw-glow scale-105",
                    !active && !done && "opacity-60 saturate-50",
                  )}
                >
                  <s.icon className="size-5" />
                </span>
                <span
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-mono text-[11.5px] transition-colors duration-500",
                    done ? "bg-success-soft text-success" : active ? "bg-accent-soft text-accent" : "text-subtle-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : `0${i + 1}`}
                </span>
              </div>
              <h3 className="mt-5 text-[16px] font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{s.body}</p>

              <div className="mt-5 min-h-[92px] min-w-0 rounded-lg border border-border bg-muted/50 p-3 text-[12.5px] text-foreground/85">
                {i === 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                      <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        {on && step === 0 ? email.text : EMAIL}
                        {on && step === 0 && !email.done && <Caret />}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-all duration-200",
                          on && step === 1 ? "scale-95 bg-accent text-white" : "bg-foreground text-background",
                        )}
                      >
                        Create account
                      </span>
                      {reached(2) && (
                        <span key={`acc${cycles}`} className="hiw-pop inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11.5px] font-medium text-success">
                          <Check className="size-3" strokeWidth={3} /> Free plan · 1M tokens
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {i === 1 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                      <KeyRound className="size-3.5 shrink-0 text-accent" />
                      <code className="truncate font-mono text-[12px]">{reached(4) ? key : `${KEY_PREFIX}••••••••`}</code>
                      {reached(5) && (
                        <span key={`cp${cycles}`} className="hiw-pop ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-success">
                          <Copy className="size-3" /> Copied
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      {["inference", "120 req/min", "no expiry"].map((t) => (
                        <span key={t} className="rounded-md border border-border bg-background/70 px-1.5 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {i === 2 && (
                  <div className="space-y-2 font-mono text-[11.5px] leading-relaxed">
                    <p className="truncate text-foreground/85">
                      {on && step === 6 ? code.text : CODE}
                      {on && step === 6 && !code.done && <Caret />}
                    </p>
                    <p className="text-muted-foreground">
                      {reached(7) ? (
                        reached(8) ? (
                          <span key={`ok${cycles}`} className="hiw-pop inline-flex items-center gap-1 text-success">
                            <Check className="size-3" strokeWidth={3} /> 200 OK · first token in 312ms
                          </span>
                        ) : (
                          <span className="text-muted-foreground">→ sending request…</span>
                        )
                      ) : (
                        <span className="opacity-0">.</span>
                      )}
                    </p>
                    <p className="truncate font-sans text-[12.5px] text-foreground/90">
                      {reached(8) ? (on && step === 8 ? reply.text : REPLY) : <span className="opacity-0">.</span>}
                      {on && step === 8 && !reply.done && <Caret />}
                    </p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 flex justify-center">
        <div className={cn("inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] shadow-sm transition-colors", finished && "border-success/40")}>
          <Timer className={cn("size-4", finished ? "text-success" : "text-accent")} />
          <span className="font-mono font-semibold tabular-nums">
            0:{String(seconds).padStart(2, "0")}
          </span>
          <span className="text-muted-foreground">from sign-up to your first token</span>
        </div>
      </div>
    </div>
  );
}
