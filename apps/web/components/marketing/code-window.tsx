"use client";

import * as React from "react";
import { CircleCheck } from "lucide-react";
import { CopyButton } from "@/components/ui/primitives";
import { API_BASE_URL, KEY_PREFIX, cn } from "@/lib/utils";
import { renderTokens, tokenize, type Lang } from "./highlight";

type Scenario = {
  file: string;
  lang: Lang;
  label: string;
  model: string;
  code: (base: string) => string;
  output: string[];
  stats: string;
};

const SCENARIOS: Scenario[] = [
  {
    file: "stream.py",
    lang: "python",
    label: "Python",
    model: "deepseek-v4.1-flash",
    code: (base) => `from openai import OpenAI

client = OpenAI(
    base_url="${base}",
    api_key="${KEY_PREFIX}…",
)

stream = client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[{"role": "user", "content": "What is SSE?"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")`,
    output: ["Server", "-Sent", " Events", " keep", " one", " HTTP", " response", " open", " and", " push", " each", " new", " token", " to", " the", " client", " the", " moment", " it's", " ready", " —", " no", " polling,", " no", " websockets."],
    stats: "29 tokens · 0.41s",
  },
  {
    file: "stream.mjs",
    lang: "js",
    label: "Node.js",
    model: "claude-sonnet-5-5",
    code: (base) => `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${base}",
  apiKey: "${KEY_PREFIX}…",
});

const stream = await client.chat.completions.create({
  model: "claude-sonnet-5-5",
  messages: [{ role: "user", content: "Debounce in one line?" }],
  stream: true,
});
for await (const chunk of stream)
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");`,
    output: ["const", " debounce", " =", " (fn,", " ms)", " =>", " {", " let", " t;", " return", " (...a)", " =>", " {", " clearTimeout(t);", " t", " =", " setTimeout(()", " =>", " fn(...a),", " ms);", " };", " };"],
    stats: "31 tokens · 0.38s",
  },
];

type Phase = "typing" | "connecting" | "streaming" | "done";

/** Deterministic jitter so the stream feels organic without Math.random (no hydration surprises). */
const jitter = (i: number) => 38 + ((i * 37) % 7) * 11;

export function CodeWindow({ className }: { className?: string }) {
  const base = API_BASE_URL;
  const [idx, setIdx] = React.useState(0);
  const [chars, setChars] = React.useState(0);
  const [words, setWords] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>("typing");

  const s = SCENARIOS[idx];
  const code = React.useMemo(() => s.code(base), [s, base]);
  const tokens = React.useMemo(() => tokenize(code, s.lang), [code, s.lang]);

  React.useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const full = s.code(base).length;
    if (reduce) {
      setChars(full);
      setWords(s.output.length);
      setPhase("done");
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => !cancelled && fn(), ms));

    setChars(0);
    setWords(0);
    setPhase("typing");

    let c = 0;
    const type = () => {
      c = Math.min(full, c + 3);
      setChars(c);
      if (c < full) later(type, 14);
      else later(connect, 450);
    };
    const connect = () => {
      setPhase("connecting");
      later(stream, 420);
    };
    let w = 0;
    const stream = () => {
      setPhase("streaming");
      const step = () => {
        w += 1;
        setWords(w);
        if (w < s.output.length) later(step, jitter(w));
        else {
          setPhase("done");
          later(() => setIdx((i) => (i + 1) % SCENARIOS.length), 4200);
        }
      };
      later(step, 60);
    };
    later(type, 500);

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [base, idx, s]);

  const typing = phase === "typing";
  const answer = s.output.slice(0, words).join("");

  return (
    <div className={cn("relative", className)}>
      <div className="absolute -inset-px rounded-[18px] bg-gradient-to-b from-accent/50 via-sky-400/20 to-transparent opacity-70 blur-[1px]" aria-hidden />
      <div className="absolute -inset-8 -z-10 rounded-[40px] bg-accent/15 blur-3xl dark:bg-accent/20" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl shadow-black/10 backdrop-blur dark:shadow-black/40">
        {/* title bar */}
        <div className="flex h-11 items-center gap-3 border-b border-border bg-muted/40 px-4">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-danger/70" />
            <span className="size-2.5 rounded-full bg-warning/70" />
            <span className="size-2.5 rounded-full bg-success/70" />
          </div>
          <div className="flex min-w-0 items-center gap-1" role="tablist" aria-label="Language">
            {SCENARIOS.map((x, i) => (
              <button
                key={x.file}
                type="button"
                role="tab"
                aria-selected={i === idx}
                onClick={() => setIdx(i)}
                className={cn(
                  "h-7 rounded-md px-2.5 font-mono text-[11.5px] transition-colors",
                  i === idx ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-subtle-foreground hover:text-foreground",
                )}
              >
                {x.file}
              </button>
            ))}
          </div>
          <CopyButton value={code} label="Code" size="xs" className="ml-auto size-7" />
        </div>

        {/* code */}
        <pre className="no-scrollbar h-[336px] sm:h-[342px] overflow-x-auto overflow-y-hidden px-4 py-4 font-mono text-[12px] leading-[1.75] text-foreground/90 sm:text-[12.5px]" aria-label={`${s.label} example`}>
          <code>
            {renderTokens(tokens, chars)}
            {typing && <span className="ml-px inline-block h-[1.1em] w-[7px] translate-y-[2px] animate-pulse bg-accent align-baseline" aria-hidden />}
          </code>
        </pre>

        {/* output */}
        <div className="border-t border-border bg-background/60">
          <div className="flex h-9 items-center justify-between gap-3 px-4 text-[11.5px]">
            <span className="font-mono text-subtle-foreground">output · {s.model}</span>
            <span className="flex items-center gap-1.5 font-medium">
              {phase === "connecting" && <span className="text-muted-foreground">connecting…</span>}
              {phase === "streaming" && (
                <span className="flex items-center gap-1.5 text-accent">
                  <span className="relative flex size-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative size-1.5 rounded-full bg-accent" />
                  </span>
                  streaming
                </span>
              )}
              {phase === "done" && (
                <span className="flex items-center gap-1 text-success">
                  <CircleCheck className="size-3.5" /> {s.stats}
                </span>
              )}
            </span>
          </div>
          <div className="h-[116px] overflow-hidden px-4 pb-4 sm:h-[96px] font-mono text-[12.5px] leading-relaxed text-foreground" aria-live="off">
            <span className="text-subtle-foreground">$ </span>
            {answer}
            {phase === "streaming" && <span className="ml-0.5 inline-block h-[1em] w-[6px] translate-y-[2px] bg-foreground/70" aria-hidden />}
          </div>
        </div>
      </div>
    </div>
  );
}
