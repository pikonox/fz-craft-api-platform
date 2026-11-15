"use client";

import { memo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy, Eye, WrapText } from "lucide-react";
import { copyText, cn } from "@/lib/utils";
import type { Artifact } from "./types";

const PREVIEWABLE = new Set(["html", "svg", "xml"]);

let shikiPromise: Promise<typeof import("shiki")> | null = null;
const loadShiki = () => (shikiPromise ??= import("shiki"));
const htmlCache = new Map<string, string>();

function CodeBlock({ code, lang, streaming, onPreview }: { code: string; lang: string; streaming?: boolean; onPreview?: (a: Artifact) => void }) {
  const [html, setHtml] = useState<string | null>(() => htmlCache.get(`${lang}\n${code}`) ?? null);
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);

  useEffect(() => {
    // Highlight once the block stops changing (cheap while streaming)
    const key = `${lang}\n${code}`;
    if (htmlCache.has(key)) return setHtml(htmlCache.get(key)!);
    let cancelled = false;
    const t = setTimeout(
      async () => {
        try {
          const shiki = await loadShiki();
          const language = (shiki.bundledLanguages as Record<string, unknown>)[lang] ? lang : "text";
          const out = await shiki.codeToHtml(code, { lang: language, themes: { light: "github-light", dark: "github-dark-default" }, defaultColor: "light" });
          htmlCache.set(key, out);
          if (!cancelled) setHtml(out);
        } catch {
          /* plain fallback */
        }
      },
      streaming ? 400 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, lang, streaming]);

  const canPreview = onPreview && PREVIEWABLE.has(lang) && (lang !== "xml" || code.includes("<svg"));
  return (
    <div className="not-prose group/code my-4 overflow-hidden rounded-xl border border-border bg-muted/50">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[11.5px] text-muted-foreground">{lang || "text"}</span>
        <div className="flex items-center gap-0.5">
          {canPreview && (
            <button
              onClick={() => onPreview!({ id: `${lang}-${code.length}-${code.slice(0, 20)}`, title: lang === "html" ? "HTML preview" : "SVG preview", lang, code })}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent-soft"
            >
              <Eye className="size-3.5" /> Preview
            </button>
          )}
          <button onClick={() => setWrap((w) => !w)} className={cn("flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", wrap && "text-foreground")} aria-label="Toggle wrap">
            <WrapText className="size-3.5" />
          </button>
          <button
            onClick={async () => {
              if (await copyText(code)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {html ? (
        <div className={cn("scrollbar-thin overflow-x-auto px-4 py-3.5 text-[13px] leading-relaxed [&_pre]:!bg-transparent", wrap && "[&_pre]:whitespace-pre-wrap")} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className={cn("scrollbar-thin overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-relaxed", wrap && "whitespace-pre-wrap")}>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

export const Markdown = memo(function Markdown({ content, streaming, onPreview }: { content: string; streaming?: boolean; onPreview?: (a: Artifact) => void }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code({ className, children, ...props }) {
            const match = /language-([\w+-]+)/.exec(className || "");
            const text = String(children ?? "");
            const isBlock = Boolean(match) || text.includes("\n");
            if (!isBlock) return <code {...props}>{children}</code>;
            return <CodeBlock code={text.replace(/\n$/, "")} lang={(match?.[1] ?? "").toLowerCase()} streaming={streaming} onPreview={onPreview} />;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

/** Find previewable artifacts (html / svg code blocks) in a message. */
export function extractArtifacts(content: string): Artifact[] {
  const out: Artifact[] = [];
  const re = /```(html|svg|xml)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const code = m[2].trim();
    if (m[1] === "xml" && !code.includes("<svg")) continue;
    const title = /<title>([^<]{1,80})<\/title>/i.exec(code)?.[1] ?? (m[1] === "html" ? "HTML page" : "SVG image");
    out.push({ id: `${m[1]}-${code.length}-${code.slice(0, 20)}`, title, lang: m[1], code });
  }
  return out;
}
