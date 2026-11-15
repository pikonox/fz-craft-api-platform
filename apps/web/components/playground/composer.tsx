"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, FileText, Globe, LoaderCircle, Paperclip, Square, X } from "lucide-react";
import { Tooltip } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Attachment } from "./types";

type Pending = { id: string; status: "uploading" | "ready" | "error"; preview?: string; name: string; attachment?: Attachment };

export type ComposerHandle = { focus: () => void; setText: (t: string) => void };

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.txt,.csv,.json,.ts,.tsx,.js,.py,.go,.rs,.java,.html,.css,.yaml,.yml";

export const Composer = forwardRef<ComposerHandle, {
  busy: boolean;
  disabled?: boolean;
  vision: boolean;
  searchAvailable: boolean;
  webSearch: boolean;
  onToggleSearch: () => void;
  footnote?: React.ReactNode;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  autoFocus?: boolean;
}>(function Composer({ busy, disabled, vision, searchAvailable, webSearch, onToggleSearch, footnote, onSend, onStop, autoFocus }, ref) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [drag, setDrag] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus(), setText: (t) => setText(t) }));

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) ta.current?.focus();
  }, [autoFocus]);

  const upload = async (list: FileList | File[]) => {
    for (const file of Array.from(list).slice(0, 10)) {
      const isImage = file.type.startsWith("image/");
      if (isImage && !vision) {
        toast.error("This model can't read images. Pick a model with Vision.");
        continue;
      }
      const id = `${Date.now()}-${Math.random()}`;
      setFiles((f) => [...f, { id, status: "uploading", name: file.name, preview: isImage ? URL.createObjectURL(file) : undefined }]);
      try {
        const form = new FormData();
        form.append("file", file);
        const r = await api<{ attachment: Attachment }>("/api/playground/attachments", { form });
        setFiles((f) => f.map((p) => (p.id === id ? { ...p, status: "ready", attachment: r.attachment } : p)));
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
        setFiles((f) => f.filter((p) => p.id !== id));
      }
    }
  };

  const uploading = files.some((f) => f.status === "uploading");
  const canSend = !busy && !disabled && !uploading && (text.trim().length > 0 || files.some((f) => f.status === "ready"));

  const send = () => {
    if (!canSend) return;
    onSend(
      text.trim(),
      files.filter((f) => f.status === "ready" && f.attachment).map((f) => f.attachment!),
    );
    setText("");
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
  };

  return (
    <div
      className={cn("relative rounded-2xl border border-border bg-card shadow-lg shadow-black/5 transition-colors focus-within:border-border-strong", drag && "border-accent ring-2 ring-accent/30")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
    >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {files.map((f) => (
            <div key={f.id} className="group/att relative">
              {f.preview ? (
                <img src={f.preview} alt={f.name} className={cn("size-16 rounded-lg border border-border object-cover", f.status === "uploading" && "opacity-50")} />
              ) : (
                <div className="flex h-16 w-44 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3">
                  <FileText className="size-5 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{f.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{f.status === "uploading" ? "Reading…" : `${Math.round((f.attachment?.text?.length ?? 0) / 4).toLocaleString()} tokens`}</span>
                  </span>
                </div>
              )}
              {f.status === "uploading" && <LoaderCircle className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 animate-spin" />}
              <button
                onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground opacity-0 shadow transition-opacity hover:text-foreground group-hover/att:opacity-100"
                aria-label="Remove attachment"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={ta}
        value={text}
        rows={1}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
          if (e.key === "Escape" && busy) onStop();
        }}
        onPaste={(e) => {
          const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (imgs.length) {
            e.preventDefault();
            void upload(imgs);
          }
        }}
        placeholder={disabled ? "Pick a model to start…" : "Message the model…"}
        className="block max-h-60 min-h-[52px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-subtle-foreground"
      />
      <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && upload(e.target.files).finally(() => (e.target.value = ""))} />
        <Tooltip content={vision ? "Attach images or files" : "Attach files"}>
          <button onClick={() => input.current?.click()} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Attach">
            <Paperclip className="size-4" />
          </button>
        </Tooltip>
        {searchAvailable && (
          <button
            onClick={onToggleSearch}
            className={cn("flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors", webSearch ? "border-info/40 bg-info-soft text-info" : "border-border text-muted-foreground hover:text-foreground")}
            aria-pressed={webSearch}
          >
            <Globe className="size-3.5" /> Search
          </button>
        )}
        <span className="ml-1 hidden truncate text-xs text-subtle-foreground sm:inline">{footnote}</span>
        <div className="ml-auto">
          {busy ? (
            <button onClick={onStop} className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90" aria-label="Stop generating">
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button onClick={send} disabled={!canSend} className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:bg-muted-2 disabled:text-subtle-foreground" aria-label="Send">
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
