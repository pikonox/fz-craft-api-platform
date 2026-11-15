/**
 * Tiny, dependency-free syntax colouring for the marketing site and docs.
 * Not a parser — a handful of sticky regexes per language is plenty for short samples.
 */
import * as React from "react";

export type Lang = "bash" | "python" | "js" | "json" | "http" | "sse" | "text";

export type Token = { text: string; cls?: string };

const C = {
  kw: "text-violet-600 dark:text-violet-300",
  str: "text-emerald-700 dark:text-emerald-300",
  num: "text-amber-700 dark:text-amber-300",
  com: "text-subtle-foreground italic",
  fn: "text-sky-700 dark:text-sky-300",
  key: "text-indigo-700 dark:text-indigo-200",
  flag: "text-pink-600 dark:text-pink-300",
  lit: "text-orange-600 dark:text-orange-300",
  punct: "text-muted-foreground",
  head: "text-violet-600 dark:text-violet-300 font-medium",
} as const;

type Rule = [RegExp, string];

const STR_D = /"(?:[^"\\\n]|\\.)*"/y;
const NUM = /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y;

const RULES: Record<Exclude<Lang, "text">, Rule[]> = {
  bash: [
    [/#[^\n]*/y, C.com],
    [/'(?:[^'\\]|\\.)*'/y, C.str],
    [STR_D, C.str],
    [/\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*/y, C.lit],
    [/(?<=\s)--?[A-Za-z][\w-]*/y, C.flag],
    [/\b(?:curl|export|pip|npm|pnpm|python|node|echo)\b/y, C.fn],
    [/\\(?=\n)/y, C.punct],
  ],
  python: [
    [/#[^\n]*/y, C.com],
    [/[fFrRbB]?"""[\s\S]*?"""/y, C.str],
    [/[fFrRbB]?"(?:[^"\\\n]|\\.)*"/y, C.str],
    [/[fFrRbB]?'(?:[^'\\\n]|\\.)*'/y, C.str],
    [/\b(?:from|import|as|def|return|for|in|if|else|elif|with|while|try|except|raise|class|and|or|not|is|await|async|lambda|pass|break|continue)\b/y, C.kw],
    [/\b(?:None|True|False)\b/y, C.lit],
    [NUM, C.num],
    [/\b[A-Za-z_]\w*(?==(?!=))/y, C.key],
    [/\b[A-Za-z_]\w*(?=\()/y, C.fn],
    [/[()[\]{}.,:=]/y, C.punct],
  ],
  js: [
    [/\/\/[^\n]*/y, C.com],
    [/\/\*[\s\S]*?\*\//y, C.com],
    [/`(?:[^`\\]|\\.)*`/y, C.str],
    [STR_D, C.str],
    [/'(?:[^'\\\n]|\\.)*'/y, C.str],
    [/\b(?:const|let|var|await|async|import|from|export|default|for|of|in|new|return|if|else|function|throw|try|catch)\b/y, C.kw],
    [/\b(?:true|false|null|undefined)\b/y, C.lit],
    [NUM, C.num],
    [/\b[A-Za-z_$][\w$]*(?=\s*:(?!:))/y, C.key],
    [/\b[A-Za-z_$][\w$]*(?=\()/y, C.fn],
    [/[()[\]{}.,:;=?]/y, C.punct],
  ],
  json: [
    [/"(?:[^"\\\n]|\\.)*"(?=\s*:)/y, C.key],
    [STR_D, C.str],
    [/-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y, C.num],
    [/\b(?:true|false|null)\b/y, C.lit],
    [/…/y, C.com],
    [/[{}[\],:]/y, C.punct],
  ],
  http: [
    [/^(?:HTTP\/[\d.]+ \d+[^\n]*|(?:GET|POST|PUT|DELETE|PATCH) [^\n]*)/my, C.head],
    [/^[A-Za-z][\w-]*(?=:)/my, C.key],
    [/"(?:[^"\\\n]|\\.)*"(?=\s*:)/y, C.key],
    [STR_D, C.str],
    [/\b(?:true|false|null)\b/y, C.lit],
    [/[{}[\],]/y, C.punct],
  ],
  sse: [
    [/^:[^\n]*/my, C.com],
    [/^data:/my, C.flag],
    [/\[DONE\]/y, C.lit],
    [/"(?:[^"\\\n]|\\.)*"(?=\s*:)/y, C.key],
    [STR_D, C.str],
    [NUM, C.num],
    [/\b(?:true|false|null)\b/y, C.lit],
    [/…/y, C.com],
    [/[{}[\],:]/y, C.punct],
  ],
};

export function tokenize(code: string, lang: Lang): Token[] {
  if (lang === "text") return [{ text: code }];
  const rules = RULES[lang];
  const out: Token[] = [];
  let plain = "";
  let i = 0;
  outer: while (i < code.length) {
    for (const [re, cls] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length > 0) {
        if (plain) {
          out.push({ text: plain });
          plain = "";
        }
        out.push({ text: m[0], cls });
        i += m[0].length;
        continue outer;
      }
    }
    // consume a whole identifier at once so keyword rules can't match mid-word
    const word = /[A-Za-z0-9_$]+/y;
    word.lastIndex = i;
    const w = word.exec(code);
    if (w) {
      plain += w[0];
      i += w[0].length;
    } else {
      plain += code[i];
      i++;
    }
  }
  if (plain) out.push({ text: plain });
  return out;
}

/** Render tokens, optionally only the first `limit` characters (for typing animations). */
export function renderTokens(tokens: Token[], limit = Infinity): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let left = limit;
  for (let k = 0; k < tokens.length && left > 0; k++) {
    const t = tokens[k];
    const text = t.text.length > left ? t.text.slice(0, left) : t.text;
    left -= text.length;
    nodes.push(t.cls ? <span key={k} className={t.cls}>{text}</span> : <React.Fragment key={k}>{text}</React.Fragment>);
  }
  return nodes;
}

export function Highlight({ code, lang }: { code: string; lang: Lang }) {
  const tokens = React.useMemo(() => tokenize(code, lang), [code, lang]);
  return <>{renderTokens(tokens)}</>;
}
