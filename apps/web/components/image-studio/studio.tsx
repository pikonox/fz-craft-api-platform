"use client";

import * as React from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, Heart, ImageIcon, ImagePlus, Info, Plus, RotateCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton, Spinner } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { Dialog, Sheet } from "@/components/ui/overlay";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useCheckout } from "@/lib/stores";
import { IMAGE_RETENTION_HOURS } from "@/lib/utils";
import { PromptBox, PromptHint } from "./prompt-box";
import { SettingsPanel } from "./settings-panel";
import { GalleryGrid, GenerationCard, IdeaGrid, Lightbox, PendingCard } from "./results";
import { SUMMARY_KEY, generationsKey, type Draft, type Generation, type GenerationsPage, type StudioSummary, type StudioTab, type ViewerItem } from "./lib";

const PREFS_KEY = "fz.studio.prefs";
const DEFAULT_DRAFT: Draft = { prompt: "", model: "", style: "none", aspect: "1:1", quality: "1K", n: 1 };

/** Last-used settings (not the prompt) are remembered per browser. */
function loadPrefs(): Partial<Draft> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Draft>) : {};
  } catch {
    return {};
  }
}
function savePrefs(d: Draft) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ model: d.model, style: d.style, aspect: d.aspect, quality: d.quality, n: d.n }));
  } catch {
    /* storage unavailable */
  }
}

const EMPTY: Record<Exclude<StudioTab, "history">, { icon: React.ReactNode; title: string; description: string }> = {
  gallery: { icon: <ImageIcon />, title: "Your gallery is empty", description: "Every image you generate shows up here." },
  favorites: { icon: <Heart />, title: "No favorites yet", description: "Tap the heart on any image to keep it here." },
};

export function ImageStudio() {
  const qc = useQueryClient();
  const start = useCheckout((s) => s.start);
  const promptRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const summaryQ = useQuery({ queryKey: SUMMARY_KEY, queryFn: () => api<StudioSummary>("/api/studio/summary") });
  const summary = summaryQ.data;

  const [draft, setDraftState] = React.useState<Draft>(DEFAULT_DRAFT);
  const setDraft = React.useCallback((patch: Partial<Draft>) => setDraftState((d) => ({ ...d, ...patch })), []);
  const [refImage, setRefImage] = React.useState<File | null>(null);
  const [tab, setTab] = React.useState<StudioTab>("history");
  const [pending, setPending] = React.useState<{ draft: Draft; startedAt: number } | null>(null);
  const [viewer, setViewer] = React.useState<number | null>(null);
  const [toDelete, setToDelete] = React.useState<Generation | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const defaultModel = summary ? (summary.defaultModel ?? summary.models[0]?.id ?? "") : "";

  // Restore the last-used settings once the model list is known
  const hydrated = React.useRef(false);
  React.useEffect(() => {
    if (!summary || hydrated.current) return;
    hydrated.current = true;
    const saved = loadPrefs();
    const ids = summary.models.map((m) => m.id);
    setDraftState((d) => ({
      ...d,
      model: saved.model && ids.includes(saved.model) ? saved.model : (summary.defaultModel ?? ids[0] ?? ""),
      style: saved.style && summary.styles.some((s) => s.id === saved.style) ? saved.style : d.style,
      aspect: saved.aspect && summary.aspects.includes(saved.aspect) ? saved.aspect : d.aspect,
      quality: saved.quality && summary.qualities.includes(saved.quality) ? saved.quality : d.quality,
      n: saved.n && saved.n >= 1 && saved.n <= 4 ? saved.n : d.n,
    }));
  }, [summary]);
  React.useEffect(() => {
    if (hydrated.current) savePrefs(draft);
  }, [draft]);

  const list = useInfiniteQuery({
    queryKey: generationsKey(tab),
    queryFn: ({ pageParam }) => api<GenerationsPage>(`/api/studio/generations?tab=${tab}&page=${pageParam}&limit=${tab === "history" ? 8 : 24}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const gens = React.useMemo(() => list.data?.pages.flatMap((p) => p.generations) ?? [], [list.data]);
  const items: ViewerItem[] = React.useMemo(() => gens.flatMap((gen) => gen.images.map((img, index) => ({ gen, img, index }))), [gens]);

  const names = React.useMemo(
    () => ({
      model: (id: string) => summary?.models.find((m) => m.id === id)?.name ?? id,
      style: (id: string) => summary?.styles.find((s) => s.id === id)?.label ?? id,
    }),
    [summary],
  );

  /** Apply a change to a generation in every cached tab (null removes it). */
  const patchCached = React.useCallback(
    (fn: (g: Generation) => Generation | null) => {
      qc.setQueriesData<InfiniteData<GenerationsPage>>({ queryKey: ["studio", "generations"] }, (old) =>
        old ? { ...old, pages: old.pages.map((p) => ({ ...p, generations: p.generations.map(fn).filter((g): g is Generation => g !== null) })) } : old,
      );
    },
    [qc],
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["studio"] });
    void qc.invalidateQueries({ queryKey: SUMMARY_KEY });
  };

  const toTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const focusPrompt = () => window.setTimeout(() => promptRef.current?.focus({ preventScroll: true }), 300);

  const generate = useMutation({
    mutationFn: (d: Draft) => {
      const form = new FormData();
      form.set("model", d.model);
      form.set("prompt", d.prompt.trim());
      form.set("style", d.style);
      form.set("aspect", d.aspect);
      form.set("quality", d.quality);
      form.set("n", String(d.n));
      if (refImage) form.set("image", refImage);
      return api<{ generation: Generation; imageBalance: number }>("/api/studio/generate", { form });
    },
    onMutate: (d) => {
      setPending({ draft: d, startedAt: Date.now() });
      setTab("history");
      setSettingsOpen(false);
    },
    onSuccess: (r) => {
      qc.setQueryData<StudioSummary>(SUMMARY_KEY, (s) => (s ? { ...s, imageBalance: r.imageBalance } : s));
      // Show the result right away (the refetch below confirms it)
      qc.setQueryData<InfiniteData<GenerationsPage>>(generationsKey("history"), (old) =>
        old ? { ...old, pages: old.pages.map((p, i) => (i === 0 ? { ...p, total: p.total + 1, generations: [r.generation, ...p.generations] } : p)) } : old,
      );
      const got = r.generation.images.length;
      if (r.generation.status === "partial") toast.warning(`Got ${got} of ${r.generation.n} images. You were only charged for ${got}.`);
      else toast.success(got > 1 ? `${got} images ready` : "Image ready");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 402) toast.error(e.message, { action: { label: "Add credits", onClick: () => start({ purpose: "image_wallet" }) } });
      else toast.error(errorMessage(e));
    },
    onSettled: () => {
      setPending(null);
      refresh();
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const favorite = useMutation({
    mutationFn: (g: Generation) => api<{ generation: Generation }>(`/api/studio/generations/${g.id}`, { method: "PATCH", body: { favorite: !g.favorite } }),
    onMutate: (g) => patchCached((x) => (x.id === g.id ? { ...x, favorite: !g.favorite } : x)),
    onError: (e, g) => {
      patchCached((x) => (x.id === g.id ? { ...x, favorite: g.favorite } : x));
      toast.error(errorMessage(e));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: generationsKey("favorites") });
      void qc.invalidateQueries({ queryKey: SUMMARY_KEY });
    },
  });

  const remove = useMutation({
    mutationFn: (g: Generation) => api(`/api/studio/generations/${g.id}`, { method: "DELETE" }),
    onSuccess: (_r, g) => {
      patchCached((x) => (x.id === g.id ? null : x));
      setToDelete(null);
      toast.success("Deleted");
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: refresh,
  });

  const remix = (g: Generation) => {
    const ids = summary?.models.map((m) => m.id) ?? [];
    setDraftState((d) => ({ ...d, prompt: g.prompt, model: ids.includes(g.model) ? g.model : d.model, style: g.style || "none", aspect: g.aspect, quality: g.quality, n: g.n }));
    toTop();
    focusPrompt();
    toast("Settings loaded. Edit the prompt and generate.");
  };

  const resetSettings = () => setDraft({ model: defaultModel, style: "none", aspect: "1:1", quality: "1K", n: 1 });
  const openImage = (g: Generation, index: number) => setViewer(items.findIndex((it) => it.gen.id === g.id && it.index === index));
  const onGenerate = () => {
    if (!generate.isPending) generate.mutate({ ...draft });
  };

  const showPending = tab === "history" && pending;
  const isEmpty = !list.isLoading && !list.isError && gens.length === 0 && !showPending;
  const balance = summary?.imageBalance;

  const settings = <SettingsPanel summary={summary} draft={draft} setDraft={setDraft} refImage={refImage} setRefImage={setRefImage} />;

  return (
    <div className="flex h-full">
      {/* Settings: side panel on desktop, sheet on smaller screens */}
      <aside className="hidden w-[320px] shrink-0 flex-col border-r border-border bg-sidebar/60 lg:flex">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <p className="text-[13.5px] font-semibold">Image settings</p>
          <Button variant="ghost" size="xs" onClick={resetSettings} title="Back to the default settings">
            <RotateCcw /> Reset
          </Button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{settings}</div>
      </aside>
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen} side="right" title="Image settings" className="w-[340px] lg:hidden">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <p className="text-[13.5px] font-semibold">Image settings</p>
          <Button variant="ghost" size="xs" onClick={resetSettings}>
            <RotateCcw /> Reset
          </Button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{settings}</div>
        <div className="border-t border-border p-3">
          <Button variant="primary" className="w-full" onClick={() => setSettingsOpen(false)}>
            Done
          </Button>
        </div>
      </Sheet>

      <section className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-5">
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-sky-400 text-white shadow-sm">
              <ImagePlus className="size-4" />
            </span>
            <h1 className="text-[15px] font-semibold tracking-tight">Image Studio</h1>
          </div>
          <Segmented<StudioTab>
            size="sm"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setViewer(null);
            }}
            options={[
              { value: "history", label: "History", count: summary?.stats.generations },
              { value: "gallery", label: "Gallery", count: summary?.stats.images },
              { value: "favorites", label: "Favorites", count: summary?.stats.favorites },
            ]}
          />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden xl:inline-flex">
              <Link href="/docs#images">
                <BookOpen /> Use via API
              </Link>
            </Button>
            <button
              type="button"
              onClick={() => start({ purpose: "image_wallet" })}
              title="Image credits — separate from your plan balance. Click to add more."
              className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card pl-3 pr-1 text-[12.5px] shadow-xs transition-colors hover:border-accent"
            >
              <Wallet className="size-3.5 text-accent" />
              <span className="hidden text-muted-foreground sm:inline">Credits</span>
              <span className="font-semibold tabular">{balance === undefined ? "—" : formatUsd(balance)}</span>
              <span className="flex size-6 items-center justify-center rounded-full bg-accent text-white">
                <Plus className="size-3.5" />
              </span>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-7">
            {summaryQ.isError && !summary && (
              <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-sm text-danger">
                  <AlertTriangle className="size-4" /> {errorMessage(summaryQ.error)}
                </p>
                <Button variant="outline" size="sm" onClick={() => summaryQ.refetch()}>
                  Try again
                </Button>
              </Card>
            )}

            <PromptBox
              summary={summary}
              draft={draft}
              setDraft={setDraft}
              refImage={refImage}
              setRefImage={setRefImage}
              onGenerate={onGenerate}
              generating={generate.isPending}
              promptRef={promptRef}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            <PromptHint length={draft.prompt.length} />

            <div className="mt-8 space-y-4">
              {!isEmpty && !list.isLoading && (
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Info className="size-3.5 shrink-0" />
                  Images are deleted after {IMAGE_RETENTION_HOURS} hours. Download anything you want to keep.
                </p>
              )}

              {showPending && <PendingCard draft={pending.draft} startedAt={pending.startedAt} names={names} />}

              {list.isLoading ? (
                tab === "history" ? (
                  <>
                    <Skeleton className="h-72 w-full rounded-2xl" />
                    <Skeleton className="h-72 w-full rounded-2xl" />
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className="aspect-square w-full rounded-xl" />
                    ))}
                  </div>
                )
              ) : list.isError ? (
                <Card className="flex flex-col items-center gap-3 p-8 text-center">
                  <p className="text-sm text-danger">{errorMessage(list.error)}</p>
                  <Button variant="outline" size="sm" onClick={() => list.refetch()}>
                    Try again
                  </Button>
                </Card>
              ) : isEmpty ? (
                tab === "history" ? (
                  <IdeaGrid
                    styleLabel={names.style}
                    onPick={(idea) => {
                      setDraft({ prompt: idea.prompt, style: idea.style, aspect: idea.aspect });
                      toTop();
                      focusPrompt();
                    }}
                  />
                ) : (
                  <Card className="border-dashed">
                    <EmptyState icon={EMPTY[tab].icon} title={EMPTY[tab].title} description={EMPTY[tab].description} />
                  </Card>
                )
              ) : tab === "history" ? (
                gens.map((g) => (
                  <GenerationCard
                    key={g.id}
                    g={g}
                    names={names}
                    onOpen={(i) => openImage(g, i)}
                    onFavorite={() => favorite.mutate(g)}
                    onRemix={() => remix(g)}
                    onDelete={() => setToDelete(g)}
                  />
                ))
              ) : (
                <GalleryGrid items={items} onOpen={setViewer} onFavorite={(g) => favorite.mutate(g)} />
              )}

              {list.hasNextPage && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                    {list.isFetchingNextPage && <Spinner className="text-current" />} Load more
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Lightbox items={items} at={viewer} onAt={setViewer} onClose={() => setViewer(null)} names={names} onFavorite={(g) => favorite.mutate(g)} onRemix={remix} />

      <Dialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        size="sm"
        title="Delete this generation?"
        description="Its images are removed from storage right away. This can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete)}>
              {remove.isPending && <Spinner className="text-current" />} Delete
            </Button>
          </>
        }
      >
        {toDelete && <p className="line-clamp-3 text-[13px] text-muted-foreground">“{toDelete.prompt}”</p>}
      </Dialog>
    </div>
  );
}
