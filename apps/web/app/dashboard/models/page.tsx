"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Layers, Lock, Search, Sparkles, Wrench } from "lucide-react";
import { formatTokens, formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CopyButton, EmptyState, Input, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/overlay";
import { CodeTabs, type Snippet } from "@/components/code-tabs";
import { useModels } from "@/lib/queries";
import type { ModelInfo } from "@/lib/types";
import { API_BASE_URL, cn } from "@/lib/utils";
import { CAP_META, TYPE_LABEL, priceLine, VendorMark } from "@/components/model-meta";

export default function ModelsPage() {
  const { data: models, isLoading } = useModels();
  const [type, setType] = useState<"all" | "chat" | "image" | "embedding">("all");
  const [caps, setCaps] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ModelInfo | null>(null);

  const list = useMemo(
    () =>
      (models ?? []).filter(
        (m) =>
          (type === "all" || m.type === type) &&
          caps.every((c) => m.capabilities.includes(c as never)) &&
          (!q || `${m.name} ${m.id} ${m.vendor} ${m.description}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [models, type, caps, q],
  );
  const counts = useMemo(() => {
    const c = { all: models?.length ?? 0, chat: 0, image: 0, embedding: 0 };
    for (const m of models ?? []) c[m.type]++;
    return c;
  }, [models]);

  return (
    <>
      <PageHeader title="Models" description="Every model is reachable through the same endpoint and key. Switch by changing one string." />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "chat", label: "Chat", count: counts.chat },
            { value: "image", label: "Image", count: counts.image },
            { value: "embedding", label: "Embedding", count: counts.embedding },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CAP_META).map(([k, v]) => {
              const on = caps.includes(k);
              return (
                <button
                  key={k}
                  onClick={() => setCaps((c) => (on ? c.filter((x) => x !== k) : [...c, k]))}
                  className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors", on ? "border-accent bg-accent-soft text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
                >
                  <v.icon className="size-3.5" /> {v.label}
                </button>
              );
            })}
          </div>
          <div className="relative sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" className="pl-9" />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)
          : list.map((m) => (
              <Card key={m.id} className="group flex flex-col p-5 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <VendorMark vendor={m.vendor} type={m.type} modelId={m.id} />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">{m.name}</p>
                      <p className="flex items-center gap-1 truncate font-mono text-xs text-muted-foreground">
                        {m.id}
                        <CopyButton value={m.id} label="Model id" size="xs" className="opacity-0 group-hover:opacity-100" />
                      </p>
                    </div>
                  </div>
                  {m.status === "maintenance" ? (
                    <Badge tone="outline">
                      <Wrench className="size-3" /> Maintenance
                    </Badge>
                  ) : !m.available ? (
                    <Badge tone="warning">
                      <Lock className="size-3" /> {m.access === "early" ? "Top plan" : "Paid plans"}
                    </Badge>
                  ) : m.featured ? (
                    <Badge tone="accent">
                      <Sparkles className="size-3" /> Featured
                    </Badge>
                  ) : (
                    <Badge tone="outline">{TYPE_LABEL[m.type]}</Badge>
                  )}
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-[13px] text-muted-foreground">{m.description || "—"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.capabilities.map((c) => {
                    const meta = CAP_META[c];
                    return meta ? (
                      <Badge key={c} tone="neutral">
                        <meta.icon className="size-3" /> {meta.label}
                      </Badge>
                    ) : null;
                  })}
                </div>
                <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4 text-[12.5px]">
                  <div>
                    <p className="text-muted-foreground">{m.type === "image" ? "Up to" : "Context"}</p>
                    <p className="font-medium tabular">{m.type === "image" ? "4K" : m.contextLength ? formatTokens(m.contextLength) : "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">Model price</p>
                    <p className="font-medium tabular">{priceLine(m)}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setOpen(m)}>
                    Details
                  </Button>
                  {m.status === "maintenance" ? (
                    <Button size="sm" variant="secondary" className="flex-1" disabled>
                      Unavailable
                    </Button>
                  ) : m.type === "chat" ? (
                    <Button size="sm" variant="secondary" className="flex-1" asChild>
                      <Link href={`/dashboard/playground?model=${encodeURIComponent(m.id)}`}>Try it</Link>
                    </Button>
                  ) : m.type === "image" ? (
                    <Button size="sm" variant="secondary" className="flex-1" asChild>
                      <Link href={`/dashboard/image-studio?model=${encodeURIComponent(m.id)}`}>Create</Link>
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
      </div>
      {!isLoading && !list.length && <EmptyState icon={<Layers />} title="No models match" description="Try removing a filter." />}

      <ModelDialog model={open} onClose={() => setOpen(null)} />
    </>
  );
}

function ModelDialog({ model, onClose }: { model: ModelInfo | null; onClose: () => void }) {
  if (!model) return null;
  const base = API_BASE_URL;
  const snippets: Snippet[] =
    model.type === "image"
      ? [
          {
            id: "curl",
            label: "curl",
            code: `curl ${base}/images/generations \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${model.id}","prompt":"a red fox in the snow","size":"1792x1024","n":1}'`,
          },
          {
            id: "python",
            label: "python",
            code: `from openai import OpenAI\nclient = OpenAI(base_url="${base}", api_key="YOUR_KEY")\n\nimg = client.images.generate(model="${model.id}", prompt="a red fox in the snow", size="1792x1024")\nprint(img.data[0].url)`,
          },
        ]
      : model.type === "embedding"
        ? [
            {
              id: "curl",
              label: "curl",
              code: `curl ${base}/embeddings \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${model.id}","input":["hello world"]}'`,
            },
          ]
        : [
            {
              id: "curl",
              label: "curl",
              code: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${model.id}","stream":true,"messages":[{"role":"user","content":"Hello!"}]}'`,
            },
            {
              id: "python",
              label: "python",
              code: `from openai import OpenAI\nclient = OpenAI(base_url="${base}", api_key="YOUR_KEY")\n\nstream = client.chat.completions.create(\n    model="${model.id}",\n    messages=[{"role": "user", "content": "Hello!"}],\n    stream=True,\n)\nfor chunk in stream:\n    print(chunk.choices[0].delta.content or "", end="")`,
            },
          ];

  const rows: [string, string][] =
    model.type === "image"
      ? [
          ["1K image", formatUsd(model.pricing.perImage["1K"])],
          ["2K image", formatUsd(model.pricing.perImage["2K"])],
          ["4K image", formatUsd(model.pricing.perImage["4K"])],
        ]
      : [
          ["Input / 1M tokens", formatUsd(model.pricing.inputPer1M)],
          ["Cached input / 1M", formatUsd(model.pricing.cachedInputPer1M || model.pricing.inputPer1M)],
          ["Output / 1M tokens", formatUsd(model.pricing.outputPer1M)],
          ["Context window", formatTokens(model.contextLength)],
          ["Max output", formatTokens(model.maxOutput)],
        ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={model.name} description={model.description} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-border bg-muted px-2 py-1 text-xs">{model.id}</code>
          <CopyButton value={model.id} label="Model id" size="xs" />
          <Badge tone="outline">{model.vendor || "—"}</Badge>
          {model.status === "maintenance" ? (
            <Badge tone="outline">
              <Wrench className="size-3" /> Under maintenance
            </Badge>
          ) : (
            <Badge tone={model.available ? "success" : "warning"}>{model.available ? "Available on your plan" : model.access === "early" ? "Top plan only" : "Paid plans"}</Badge>
          )}
        </div>
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between bg-card px-4 py-2.5 text-[13px]">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium tabular">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {model.type === "image"
            ? "Images are paid per image from your image wallet — you're only charged for images you receive."
            : "Token usage counts against your plan's monthly tokens. Model price is shown for reference and in your usage reports."}
        </p>
        <CodeTabs snippets={snippets} />
      </div>
    </Dialog>
  );
}
