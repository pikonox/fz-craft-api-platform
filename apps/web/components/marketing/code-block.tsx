"use client";

import * as React from "react";
import { CopyButton } from "@/components/ui/primitives";
import { API_BASE_URL, KEY_PREFIX, SITE_URL, cn } from "@/lib/utils";
import { Highlight, type Lang } from "./highlight";

/** Replaces {{BASE_URL}} / {{ORIGIN}} / {{KEY_PREFIX}} with the public API base URL, site origin and key prefix. */
export function useFillOrigin() {
  return React.useCallback((s: string) => s.replaceAll("{{BASE_URL}}", API_BASE_URL).replaceAll("{{ORIGIN}}", SITE_URL).replaceAll("{{KEY_PREFIX}}", KEY_PREFIX), []);
}

/** Inline base URL, e.g. inside prose. */
export function BaseUrl({ path = "", className }: { path?: string; className?: string }) {
  return <code className={cn("break-all", className)}>{`${API_BASE_URL}${path}`}</code>;
}

const LANG_LABEL: Record<Lang, string> = { bash: "Shell", python: "Python", js: "Node.js", json: "JSON", http: "HTTP", sse: "Event stream", text: "Text" };

function Pre({ code, lang, className }: { code: string; lang: Lang; className?: string }) {
  return (
    <pre className={cn("scrollbar-thin overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.7] text-foreground/90", className)}>
      <code>
        <Highlight code={code} lang={lang} />
      </code>
    </pre>
  );
}

export function CodeBlock({ code, lang, title, className }: { code: string; lang: Lang; title?: string; className?: string }) {
  const fill = useFillOrigin();
  const text = fill(code);
  return (
    <div className={cn("group/code min-w-0 overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex h-10 items-center justify-between gap-3 border-b border-border bg-muted/40 pl-4 pr-1.5">
        <span className="truncate font-mono text-[11.5px] text-muted-foreground">{title ?? LANG_LABEL[lang]}</span>
        <CopyButton value={text} label="Code" size="xs" className="size-7" />
      </div>
      <Pre code={text} lang={lang} />
    </div>
  );
}

// ── Tabbed samples (curl / Python / Node) with a shared language preference ──

export type SampleTab = { id: string; label: string; lang: Lang; code: string; title?: string };

const LangPref = React.createContext<{ value: string; set: (v: string) => void } | null>(null);
const PREF_KEY = "docs:lang";

export function LangPrefProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = React.useState("python");
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(PREF_KEY);
      if (v) setValue(v);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const set = React.useCallback((v: string) => {
    setValue(v);
    try {
      localStorage.setItem(PREF_KEY, v);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const ctx = React.useMemo(() => ({ value, set }), [value, set]);
  return <LangPref.Provider value={ctx}>{children}</LangPref.Provider>;
}

export function CodeTabs({ tabs, className, title }: { tabs: SampleTab[]; className?: string; title?: string }) {
  const pref = React.useContext(LangPref);
  const [local, setLocal] = React.useState(tabs[0]?.id);
  const wanted = pref ? pref.value : local;
  const active = tabs.find((t) => t.id === wanted) ?? tabs[0];
  const select = (id: string) => (pref ? pref.set(id) : setLocal(id));
  const fill = useFillOrigin();
  const text = fill(active.code);

  return (
    <div className={cn("min-w-0 overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border bg-muted/40 pl-1.5 pr-1.5">
        <div role="tablist" aria-label={title ?? "Code samples"} className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === active.id}
              onClick={() => select(t.id)}
              className={cn(
                "h-7 shrink-0 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                t.id === active.id ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {title && <span className="hidden font-mono text-[11px] text-subtle-foreground sm:inline">{title}</span>}
          <CopyButton value={text} label="Code" size="xs" className="size-7" />
        </div>
      </div>
      <Pre code={text} lang={active.lang} />
    </div>
  );
}
