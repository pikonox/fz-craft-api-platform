"use client";

import { useState } from "react";
import { CopyButton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type Snippet = { id: string; label: string; code: string };

/** Light-weight highlighter for snippets (strings, comments, keywords, numbers). */
function highlight(code: string) {
  const out: React.ReactNode[] = [];
  const re = /((?:^|(?<=\s))#.*$|(?<![:\w])\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(from|import|const|await|async|for|in|of|print|let|return|new|true|false|True|False|None|curl)\b|(\s-[A-Za-z]\b|\s--[a-z-]+)|\b(\d+(?:\.\d+)?)\b/gm;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [text, comment, str, kw, flag, num] = m;
    const cls = comment ? "text-subtle-foreground italic" : str ? "text-success" : kw ? "text-accent" : flag ? "text-info" : num ? "text-warning" : "";
    out.push(
      <span key={i++} className={cls}>
        {text}
      </span>,
    );
    last = m.index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeTabs({ snippets, className, maxHeight }: { snippets: Snippet[]; className?: string; maxHeight?: number }) {
  const [active, setActive] = useState(snippets[0]?.id);
  const current = snippets.find((s) => s.id === active) ?? snippets[0];
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-muted/40", className)}>
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <div className="flex gap-0.5">
          {snippets.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn("rounded-md px-2.5 py-1 font-mono text-xs transition-colors", active === s.id ? "bg-card text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}
            >
              {s.label}
            </button>
          ))}
        </div>
        {current && <CopyButton value={current.code} label="Code" size="xs" />}
      </div>
      <pre className="scrollbar-thin overflow-auto px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-foreground/90" style={{ maxHeight }}>
        <code>{current ? highlight(current.code) : null}</code>
      </pre>
    </div>
  );
}

export function quickstartSnippets(base: string, key = "$API_KEY", model = "deepseek-v4.1-flash"): Snippet[] {
  const k = key.startsWith("$") ? key : `"${key}"`;
  return [
    {
      id: "curl",
      label: "curl",
      code: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer ${key.startsWith("$") ? key : key}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"Hello!"}]}'`,
    },
    {
      id: "python",
      label: "python",
      code: `${key.startsWith("$") ? "import os\n" : ""}from openai import OpenAI

client = OpenAI(base_url="${base}", api_key=${key.startsWith("$") ? 'os.environ["API_KEY"]' : k})

resp = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)`,
    },
    {
      id: "node",
      label: "node",
      code: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${base}", apiKey: ${key.startsWith("$") ? "process.env.API_KEY" : k} });

const resp = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(resp.choices[0].message.content);`,
    },
    {
      id: "claude-code",
      label: "claude code",
      code: `# Claude Code uses the Anthropic API at ${base}/messages
export ANTHROPIC_BASE_URL="${base.replace(/\/v1$/, "")}"
export ANTHROPIC_AUTH_TOKEN=${key.startsWith("$") ? `"${key}"` : k}
export ANTHROPIC_MODEL="claude-sonnet-5-5"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="${model}"

claude`,
    },
  ];
}
