"use client";

import { ArrowUp, Check, Clock, Download, ExternalLink, FileText, KeyRound, Pencil, Plus, Search, Slash, Sparkles, Terminal, Zap } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CopyButton } from "@/components/ui/primitives";
import { cn, KEY_PREFIX, VSCODE_EXTENSION } from "@/lib/utils";

/** "Install in VS Code" (opens the editor on the extension) and "View on Marketplace". */
export function VsCodeInstallButtons({ size = "lg", className }: { size?: "lg" | "sm"; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      <Button variant="accent" size={size} asChild>
        <a href={VSCODE_EXTENSION.installUrl}>
          <Download /> Install in VS Code
        </a>
      </Button>
      <Button variant="outline" size={size} asChild>
        <a href={VSCODE_EXTENSION.marketplaceUrl} target="_blank" rel="noopener noreferrer">
          View on Marketplace <ExternalLink />
        </a>
      </Button>
    </div>
  );
}

/** The one-line terminal install, with a copy button. */
export function VsCodeCommand({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/50 py-1 pl-3 pr-1 font-mono text-[12.5px]", className)}>
      <Terminal className="size-3.5 shrink-0 text-subtle-foreground" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{VSCODE_EXTENSION.cli}</span>
      <CopyButton value={VSCODE_EXTENSION.cli} label="Install command" size="xs" />
    </div>
  );
}

const FEATURES = [
  { icon: Sparkles, title: "A real coding agent", body: "It explores your project, reads and edits files, runs commands and checks errors until the task is done." },
  { icon: Check, title: "You stay in control", body: "Every change opens as a diff to apply or reject. Switch to Auto-edit, Auto or read-only Plan mode anytime." },
  { icon: KeyRound, title: "Every model, one key", body: "Paste your FZ-craft key and pick any model on your plan, free models included. Locked models show how to unlock them." },
  { icon: Slash, title: "Built-in commands", body: "/fix, /test, /review, /explain and /init — plus your chat history saved per project." },
];

/** Home page section: what the extension does, a preview and the install options. */
export function VsCodeSection() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-accent">
          <span className="h-px w-5 bg-gradient-to-r from-accent to-sky-400" aria-hidden />
          VS Code extension
        </p>
        <h2 className="mt-3 text-balance text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[36px]">
          {VSCODE_EXTENSION.name}: an AI coding agent in your editor
        </h2>
        <p className="mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          Install it, paste your API key, and code with every model on your plan right inside VS Code. It&apos;s connected to FZ-craft out of the box.
        </p>

        <ul className="mt-7 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <f.icon className="size-4" />
              </span>
              <span>
                <span className="block text-[14px] font-semibold">{f.title}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{f.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <VsCodeInstallButtons className="mt-8" />
        <VsCodeCommand className="mt-3 max-w-md" />
        <p className="mt-3 text-[12.5px] text-subtle-foreground">
          Then click <b className="font-medium text-muted-foreground">Set API Key</b>, paste your <code className="font-mono">{KEY_PREFIX}…</code> key and open the chat with the FZ icon or <kbd className="font-mono">⌘⌥O</kbd>.
        </p>
      </div>

      <VsCodePreview />
    </div>
  );
}

/** A static picture of the extension's chat panel, drawn with HTML (always dark, like an editor). */
function VsCodePreview() {
  return (
    <div className="relative min-w-0">
      <div className="pointer-events-none absolute -inset-8 rounded-[40px] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--accent)_22%,transparent),transparent)] blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d12] text-zinc-300 shadow-2xl shadow-black/30" aria-label="Preview of FZ-Craft Code in VS Code" role="img">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-white/5 bg-[#16161d] px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-zinc-400">
            <LogoMark className="h-3.5" /> FZ-CRAFT CODE
          </span>
        </div>

        <div className="space-y-3 p-4 text-[12.5px] leading-relaxed">
          <div className="ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm bg-white/10 px-3 py-2 text-zinc-100">Add input validation to the signup form</div>

          <div className="space-y-1.5 font-mono text-[11.5px] text-zinc-400">
            <p className="flex items-center gap-2">
              <FileText className="size-3.5 text-sky-400" /> read_file <span className="text-zinc-500">src/auth/signup.ts</span>
            </p>
            <p className="flex items-center gap-2">
              <Search className="size-3.5 text-sky-400" /> search_text <span className="text-zinc-500">&quot;zod&quot;</span>
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/10">
            <div className="flex items-center justify-between bg-white/5 px-3 py-1.5 font-mono text-[11px]">
              <span className="flex items-center gap-2 text-zinc-300">
                <Pencil className="size-3 text-violet-400" /> edit_file src/auth/signup.ts
              </span>
              <span>
                <span className="text-emerald-400">+12</span> <span className="text-rose-400">−2</span>
              </span>
            </div>
            <div className="font-mono text-[11px] leading-[1.7]">
              <p className="bg-rose-500/10 px-3 text-rose-300">- if (!email) return res.status(400).end()</p>
              <p className="bg-emerald-500/10 px-3 text-emerald-300">+ const body = SignupSchema.safeParse(req.body)</p>
              <p className="bg-emerald-500/10 px-3 text-emerald-300">+ if (!body.success) return res.status(400).json(body.error)</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/5 px-3 py-2">
              <span className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400">Reject</span>
              <span className="rounded-md bg-violet-500 px-2.5 py-1 text-[11px] font-medium text-white">Apply</span>
            </div>
          </div>

          <p className="text-zinc-300">Done — the form now rejects invalid emails and passwords shorter than 8 characters.</p>
        </div>

        {/* Composer bar */}
        <div className="border-t border-white/5 p-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <p className="px-1 text-[12px] text-zinc-500">Ask anything, / for commands, + to add context</p>
            <div className="mt-2 flex items-center gap-1.5 text-[11px]">
              <span className="flex size-6 items-center justify-center rounded-md border border-white/10 text-zinc-400">
                <Plus className="size-3" />
              </span>
              <span className="flex size-6 items-center justify-center rounded-md border border-white/10 text-zinc-400">
                <Slash className="size-3" />
              </span>
              <span className="hidden items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-zinc-400 sm:flex">
                <Clock className="size-3" /> 12m
              </span>
              <span className="truncate rounded-md border border-white/10 px-2 py-0.5 text-zinc-200">DeepSeek V4.1 Flash · High</span>
              <span className="ml-auto flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-amber-300">
                <Zap className="size-3" /> Ask
              </span>
              <span className="flex size-6 items-center justify-center rounded-md bg-violet-500 text-white">
                <ArrowUp className="size-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact card for the dashboard. */
export function VsCodeCard({ className }: { className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm dark:bg-muted">
          <LogoMark className="size-[78%]" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold tracking-tight">{VSCODE_EXTENSION.name} for VS Code</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">An AI coding agent in your editor. Install it, click Set API Key and paste one of your keys.</p>
          <VsCodeCommand className="mt-2.5 max-w-md" />
        </div>
      </div>
      <VsCodeInstallButtons size="sm" className="shrink-0" />
    </Card>
  );
}
