"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Brain, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, FileText, Globe, LoaderCircle, Pencil, RotateCcw, Square, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { formatMs, formatNumber } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlay";
import { VendorMark } from "@/components/model-meta";
import { copyText, cn } from "@/lib/utils";
import { Markdown, extractArtifacts } from "./markdown";
import type { Artifact, Msg, ToolCall } from "./types";

type Branch = { index: number; count: number; onPrev: () => void; onNext: () => void } | null;

function ActionButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <Tooltip content={label}>
      <button onClick={onClick} className={cn("flex size-7 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3.5", active && "text-foreground")} aria-label={label}>
        {children}
      </button>
    </Tooltip>
  );
}

function BranchSwitcher({ branch }: { branch: Branch }) {
  if (!branch || branch.count < 2) return null;
  return (
    <span className="mr-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular">
      <button onClick={branch.onPrev} disabled={branch.index === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" aria-label="Previous version">
        <ChevronLeft className="size-3.5" />
      </button>
      {branch.index + 1}/{branch.count}
      <button onClick={branch.onNext} disabled={branch.index === branch.count - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" aria-label="Next version">
        <ChevronRight className="size-3.5" />
      </button>
    </span>
  );
}

function CopyAction({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <ActionButton
      label={done ? "Copied" : "Copy"}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? <Check className="text-success" /> : <Copy />}
    </ActionButton>
  );
}

// ── User ────────────────────────────────────────────────
export const UserMessage = memo(function UserMessage({
  msg,
  branch,
  disabled,
  onEdit,
  onDelete,
}: {
  msg: Msg;
  branch: Branch;
  disabled: boolean;
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.setSelectionRange(draft.length, draft.length);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="group flex flex-col items-end">
      {msg.attachments.length > 0 && (
        <div className="mb-2 flex max-w-[85%] flex-wrap justify-end gap-2">
          {msg.attachments.map((a, i) =>
            a.kind === "image" && a.url ? (
              <a key={i} href={a.url} target="_blank" rel="noreferrer">
                <img src={a.url} alt={a.name} className="max-h-48 max-w-60 rounded-xl border border-border object-cover" />
              </a>
            ) : (
              <span key={i} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px]">
                <FileText className="size-4 text-accent" />
                <span className="max-w-48 truncate">{a.name}</span>
              </span>
            ),
          )}
        </div>
      )}
      {editing ? (
        <div className="w-full max-w-[85%] rounded-2xl border border-accent/50 bg-card p-2">
          <Textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) {
                  setEditing(false);
                  onEdit(draft);
                }
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-h-20 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <div className="flex justify-end gap-2 px-1 pb-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!draft.trim()}
              onClick={() => {
                setEditing(false);
                onEdit(draft);
              }}
            >
              Save & send
            </Button>
          </div>
        </div>
      ) : (
        msg.content && <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-muted-2 px-4 py-2.5 text-[15px] leading-relaxed">{msg.content}</div>
      )}
      {!editing && (
        <div className="mt-1 flex h-7 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <BranchSwitcher branch={branch} />
          <CopyAction text={msg.content} />
          {!disabled && (
            <ActionButton
              label="Edit"
              onClick={() => {
                setDraft(msg.content);
                setEditing(true);
              }}
            >
              <Pencil />
            </ActionButton>
          )}
          {!disabled && (
            <ActionButton label="Delete" onClick={onDelete}>
              <Trash2 />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
});

// ── Thinking ────────────────────────────────────────────
function ThinkingBlock({ text, ms, live }: { text: string; ms: number; live: boolean }) {
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!live) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(t);
  }, [live]);
  const secs = Math.max(1, Math.round((live ? elapsed : ms) / 1000));
  return (
    <div className="mb-3">
      <button onClick={() => setOpen((o) => !o)} className="group/think flex items-center gap-2 rounded-lg py-1 text-[13px] text-muted-foreground hover:text-foreground">
        <Brain className={cn("size-4", live && "animate-pulse text-accent")} />
        {live ? <span className="bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-transparent [animation:shimmer_2s_linear_infinite]">Thinking… {secs}s</span> : `Thought for ${secs}s`}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-border pl-4 text-[13.5px] leading-relaxed text-muted-foreground">{text}</div>}
    </div>
  );
}

// ── Tool calls ──────────────────────────────────────────
function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const query = String((call.args as { query?: string })?.query ?? "");
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  };
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-border bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13px]">
        <span className="flex size-7 items-center justify-center rounded-lg bg-info-soft text-info">{call.status === "running" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}</span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{call.status === "running" ? "Searching the web" : "Searched the web"}</span>
          {query && <span className="ml-1.5 truncate text-muted-foreground">“{query}”</span>}
        </span>
        {call.status !== "running" && <span className="shrink-0 text-xs text-muted-foreground">{call.summary}</span>}
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && call.sources.length > 0 && (
        <ul className="border-t border-border">
          {call.sources.map((s, i) => (
            <li key={i}>
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="flex gap-3 px-3.5 py-2.5 hover:bg-muted/50">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold uppercase text-muted-foreground">{host(s.url)[0]}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{s.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{host(s.url)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Assistant ───────────────────────────────────────────
export const AssistantMessage = memo(function AssistantMessage({
  msg,
  modelName,
  vendor,
  branch,
  busy,
  isLast,
  onRegenerate,
  onDelete,
  onFeedback,
  onPreview,
}: {
  msg: Msg;
  modelName: string;
  vendor: string;
  branch: Branch;
  busy: boolean;
  isLast: boolean;
  onRegenerate: () => void;
  onDelete: () => void;
  onFeedback: (f: "" | "up" | "down") => void;
  onPreview: (a: Artifact) => void;
}) {
  const streaming = msg.status === "streaming";
  const thinkingLive = streaming && !msg.content && Boolean(msg.reasoning);
  const tokPerSec = msg.usage.output && msg.latencyMs > msg.ttftMs ? msg.usage.output / ((msg.latencyMs - msg.ttftMs) / 1000) : 0;
  const artifacts = !streaming ? extractArtifacts(msg.content) : [];

  return (
    <div className="group flex gap-3.5">
      <VendorMark vendor={vendor} modelId={msg.model} className="mt-0.5 size-8 rounded-lg text-xs" />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex h-6 items-center gap-2">
          <span className="text-[13.5px] font-semibold">{modelName}</span>
          {!streaming && msg.usage.output > 0 && (
            <span className="hidden truncate font-mono text-[11px] text-subtle-foreground sm:inline">
              {formatNumber(msg.usage.output)} tok · {formatMs(msg.latencyMs)}
              {tokPerSec > 0 ? ` · ${Math.round(tokPerSec)} tok/s` : ""} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {msg.reasoning && <ThinkingBlock text={msg.reasoning} ms={msg.reasoningMs} live={thinkingLive} />}
        {msg.toolCalls.map((c) => (
          <ToolCallCard key={c.id} call={c} />
        ))}

        {msg.content ? (
          <Markdown content={msg.content} streaming={streaming} onPreview={onPreview} />
        ) : streaming && !msg.reasoning && !msg.toolCalls.length ? (
          <div className="flex h-7 items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dot" style={{ animationDelay: `${i * 0.16}s` }} />
            ))}
          </div>
        ) : null}
        {streaming && msg.content && <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-sm bg-accent" />}

        {artifacts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {artifacts.map((a) => (
              <button key={a.id} onClick={() => onPreview(a)} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:border-accent/60">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft font-mono text-[10px] font-bold uppercase text-accent">{a.lang}</span>
                <span>
                  <span className="block text-[13px] font-medium">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">Click to open preview</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {msg.status === "stopped" && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Square className="size-3" /> Stopped
          </p>
        )}
        {msg.error && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{msg.error}</span>
          </div>
        )}

        {!streaming && (
          <div className={cn("mt-2 flex h-7 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100", isLast && "opacity-100")}>
            <BranchSwitcher branch={branch} />
            {msg.content && <CopyAction text={msg.content} />}
            {!busy && (
              <ActionButton label="Regenerate" onClick={onRegenerate}>
                <RotateCcw />
              </ActionButton>
            )}
            <ActionButton label="Good response" active={msg.feedback === "up"} onClick={() => onFeedback(msg.feedback === "up" ? "" : "up")}>
              <ThumbsUp className={cn(msg.feedback === "up" && "fill-current")} />
            </ActionButton>
            <ActionButton label="Bad response" active={msg.feedback === "down"} onClick={() => onFeedback(msg.feedback === "down" ? "" : "down")}>
              <ThumbsDown className={cn(msg.feedback === "down" && "fill-current")} />
            </ActionButton>
            {!busy && (
              <ActionButton label="Delete" onClick={onDelete}>
                <Trash2 />
              </ActionButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
