"use client";

import { formatTokens } from "@nova/shared";
import { Badge, CopyButton, Skeleton } from "@/components/ui/primitives";
import { useModels } from "@/lib/queries";
import type { ModelInfo } from "@/lib/types";

const TYPE_LABEL: Record<ModelInfo["type"], string> = { chat: "Chat", image: "Image", embedding: "Embedding" };
const ACCESS: Record<ModelInfo["access"], { label: string; tone: "success" | "accent" | "warning" }> = {
  free: { label: "All plans", tone: "success" },
  paid: { label: "Paid plans", tone: "accent" },
  early: { label: "Top plan", tone: "warning" },
};

/** Live catalog from GET /api/models (public). */
export function ModelsTable() {
  const { data, isPending, isError } = useModels();
  if (isPending) return <Skeleton className="h-64 rounded-xl" />;
  if (isError || !data?.length) return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">The live model list is unavailable right now — call GET /v1/models instead.</p>;
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[12px] text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 font-medium">Model id</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Type</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Context</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Capabilities</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Available on</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2">
                <span className="flex items-center gap-1">
                  <code className="font-mono text-[12.5px] text-foreground">{m.id}</code>
                  <CopyButton value={m.id} label="Model id" size="xs" />
                </span>
                <span className="block text-[11.5px] text-subtle-foreground">{m.name}</span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{TYPE_LABEL[m.type]}</td>
              <td className="px-3 py-2 text-muted-foreground tabular">{m.contextLength ? formatTokens(m.contextLength) : "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{m.capabilities.length ? m.capabilities.join(", ") : "—"}</td>
              <td className="px-3 py-2">
                <Badge tone={ACCESS[m.access].tone}>{ACCESS[m.access].label}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
