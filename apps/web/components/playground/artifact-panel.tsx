"use client";

import { useState } from "react";
import { Code, Download, Eye, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { CopyButton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import type { Artifact } from "./types";

/** Side panel that renders HTML/SVG from the chat inside a sandboxed iframe (no access to this app). */
export function ArtifactPanel({ artifact, onClose, expanded, onToggleExpand }: { artifact: Artifact; onClose: () => void; expanded: boolean; onToggleExpand: () => void }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [nonce, setNonce] = useState(0);
  const doc =
    artifact.lang === "html"
      ? artifact.code
      : `<!doctype html><html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${artifact.code}</body></html>`;

  const download = () => {
    const blob = new Blob([artifact.code], { type: artifact.lang === "html" ? "text/html" : "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `artifact.${artifact.lang === "html" ? "html" : "svg"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const iconBtn = "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold">{artifact.title}</p>
          <p className="font-mono text-[11px] uppercase text-muted-foreground">{artifact.lang}</p>
        </div>
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            {
              value: "preview",
              label: (
                <>
                  <Eye className="size-3.5" /> Preview
                </>
              ),
            },
            {
              value: "code",
              label: (
                <>
                  <Code className="size-3.5" /> Code
                </>
              ),
            },
          ]}
        />
        <div className="flex items-center">
          {view === "preview" && (
            <button onClick={() => setNonce((n) => n + 1)} className={iconBtn} aria-label="Reload preview">
              <RefreshCw className="size-4" />
            </button>
          )}
          <CopyButton value={artifact.code} label="Code" />
          <button onClick={download} className={iconBtn} aria-label="Download">
            <Download className="size-4" />
          </button>
          <button onClick={onToggleExpand} className={`${iconBtn} hidden lg:flex`} aria-label={expanded ? "Shrink" : "Expand"}>
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button onClick={onClose} className={iconBtn} aria-label="Close preview">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {view === "preview" ? (
          // allow-scripts without allow-same-origin keeps the page isolated from the dashboard
          <iframe key={nonce} title={artifact.title} srcDoc={doc} sandbox="allow-scripts allow-forms allow-modals allow-popups" className="size-full bg-white" />
        ) : (
          <pre className="scrollbar-thin size-full overflow-auto p-4 font-mono text-[12.5px] leading-relaxed">
            <code>{artifact.code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
