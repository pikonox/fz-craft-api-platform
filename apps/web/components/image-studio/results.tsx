"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Clock, Download, Heart, Maximize2, RefreshCw, Trash2 } from "lucide-react";
import { formatUsd } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { cn, relativeTime } from "@/lib/utils";
import { IDEAS, STYLE_LOOK, downloadImage, expiryLabel, fileNameFor, ratio, type Draft, type GenImage, type Generation, type ViewerItem } from "./lib";

type Names = { model: (id: string) => string; style: (id: string) => string };

function IconAction({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={cn("inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4", className)}
    >
      {children}
    </button>
  );
}

/** Columns for a generation's images: portrait sets stay in one row so cards don't get very tall. */
function columnsFor(count: number, aspect: string) {
  const { w, h } = ratio(aspect);
  if (count <= 1) return 1;
  if (count === 2 || count === 3) return count;
  return h > w ? 4 : 2;
}

const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" };

/** Width cap for a lone image so portraits don't fill the whole screen. */
function singleWidth(aspect: string) {
  const { w, h } = ratio(aspect);
  return h > w ? "max-w-sm" : w === h ? "max-w-md" : "max-w-2xl";
}

function ImageTile({ img, alt, onOpen, onDownload }: { img: GenImage; alt: string; onOpen: () => void; onDownload: () => void }) {
  return (
    <div className="group relative overflow-hidden rounded-xl bg-muted" style={{ aspectRatio: `${img.width || 1} / ${img.height || 1}` }}>
      <button type="button" onClick={onOpen} className="block size-full cursor-zoom-in" aria-label="Open image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt={alt} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/55 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" onClick={onOpen} className="pointer-events-auto rounded-md bg-black/40 p-1.5 text-white backdrop-blur hover:bg-black/60" aria-label="View full size">
          <Maximize2 className="size-3.5" />
        </button>
        <button type="button" onClick={onDownload} className="pointer-events-auto rounded-md bg-black/40 p-1.5 text-white backdrop-blur hover:bg-black/60" aria-label="Download">
          <Download className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function Meta({ parts }: { parts: React.ReactNode[] }) {
  const shown = parts.filter(Boolean);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted-foreground">
      {shown.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-subtle-foreground">·</span>}
          {p}
        </React.Fragment>
      ))}
    </div>
  );
}

/** One run in the History feed: images first, then prompt, details and actions. */
export function GenerationCard({
  g,
  names,
  onOpen,
  onFavorite,
  onRemix,
  onDelete,
}: {
  g: Generation;
  names: Names;
  onOpen: (index: number) => void;
  onFavorite: () => void;
  onRemix: () => void;
  onDelete: () => void;
}) {
  const expiry = expiryLabel(g.expiresAt);
  const cols = columnsFor(g.images.length, g.aspect);

  return (
    <article className="rounded-2xl border border-border bg-card p-2.5 shadow-xs sm:p-3">
      {g.images.length > 0 ? (
        <div className={cn("grid gap-2", COLS[cols], g.images.length === 1 && singleWidth(g.aspect))}>
          {g.images.map((img, i) => (
            <ImageTile key={img.key || i} img={img} alt={g.prompt} onOpen={() => onOpen(i)} onDownload={() => downloadImage(img.url, fileNameFor(g, img, i))} />
          ))}
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{g.error || "This generation failed."} You were not charged.</span>
        </div>
      )}

      <div className="flex items-start gap-3 px-1 pt-3">
        {g.refImage?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={g.refImage.url} alt="Reference" title="Reference image" className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-border" />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13.5px] leading-relaxed">{g.prompt}</p>
          <Meta
            parts={[
              names.model(g.model),
              g.style && g.style !== "none" ? names.style(g.style) : null,
              `${g.aspect} · ${g.quality}`,
              g.status === "partial" ? (
                <span className="text-warning">
                  {g.images.length}/{g.n} images
                </span>
              ) : null,
              <span className="tabular">{formatUsd(g.costMicros)}</span>,
              relativeTime(g.createdAt),
              expiry && g.images.length > 0 ? (
                <span className={cn("inline-flex items-center gap-1", expiry.urgent && "text-warning")}>
                  <Clock className="size-3" /> {expiry.text}
                </span>
              ) : null,
            ]}
          />
        </div>
        <div className="-mr-1 flex shrink-0 items-center">
          <IconAction label={g.favorite ? "Remove from favorites" : "Add to favorites"} onClick={onFavorite} className={cn(g.favorite && "text-rose-500 hover:text-rose-500")}>
            <Heart className={cn(g.favorite && "fill-current")} />
          </IconAction>
          <CopyButton value={g.prompt} label="Prompt" />
          <IconAction label="Remix: load these settings" onClick={onRemix}>
            <RefreshCw />
          </IconAction>
          <IconAction label="Delete" onClick={onDelete} className="hover:text-danger">
            <Trash2 />
          </IconAction>
        </div>
      </div>
    </article>
  );
}

/** Placeholder shown while a generation is running. */
export function PendingCard({ draft, startedAt, names }: { draft: Draft; startedAt: number; names: Names }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const { w, h } = ratio(draft.aspect);
  const cols = columnsFor(draft.n, draft.aspect);
  return (
    <article className="rounded-2xl border border-accent/40 bg-card p-2.5 shadow-lg shadow-accent/5 sm:p-3">
      <div className={cn("grid gap-2", COLS[cols], draft.n === 1 && singleWidth(draft.aspect))}>
        {Array.from({ length: draft.n }, (_, i) => (
          <div key={i} className="skeleton relative overflow-hidden rounded-xl" style={{ aspectRatio: `${w} / ${h}` }}>
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-violet-500/20 via-transparent to-sky-400/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-background/70 px-2.5 py-1 text-[11.5px] font-medium tabular text-muted-foreground backdrop-blur">{((now - startedAt) / 1000).toFixed(1)}s</span>
            </div>
          </div>
        ))}
      </div>
      <div className="px-1 pt-3">
        <p className="line-clamp-2 text-[13.5px] leading-relaxed">{draft.prompt}</p>
        <Meta
          parts={[
            <span className="inline-flex items-center gap-1.5 font-medium text-accent">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Generating
            </span>,
            names.model(draft.model),
            `${draft.aspect} · ${draft.quality}`,
          ]}
        />
      </div>
    </article>
  );
}

/** Starter ideas for an empty studio. The cards are drawn with CSS — they are not example outputs. */
export function IdeaGrid({ styleLabel, onPick }: { styleLabel: (id: string) => string; onPick: (idea: (typeof IDEAS)[number]) => void }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-tight">Start with an idea</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Pick one to fill in the prompt, style and shape, then make it your own.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {IDEAS.map((idea) => {
          const look = STYLE_LOOK[idea.style] ?? STYLE_LOOK.none;
          const Icon = look.icon;
          return (
            <button
              key={idea.prompt}
              type="button"
              onClick={() => onPick(idea)}
              className="group relative flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-2xl p-4 text-left ring-1 ring-border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/10"
              style={{ background: look.bg || undefined }}
            >
              <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden />
              <Icon className="absolute right-4 top-4 size-5 text-white/85 drop-shadow transition-transform duration-300 group-hover:scale-110" aria-hidden />
              <span className="relative mb-2 inline-flex w-fit items-center rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                {styleLabel(idea.style)} · {idea.aspect}
              </span>
              <span className="relative line-clamp-2 text-[13.5px] font-medium leading-snug text-white">{idea.prompt}</span>
              <span className="relative mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-white/80 transition-colors group-hover:text-white">
                Use this idea <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Masonry wall of every image (Gallery and Favorites tabs). */
export function GalleryGrid({ items, onOpen, onFavorite }: { items: ViewerItem[]; onOpen: (at: number) => void; onFavorite: (g: Generation) => void }) {
  return (
    <div className="columns-2 gap-3 md:columns-3 2xl:columns-4 [&>*]:mb-3">
      {items.map((it, at) => (
        <div key={`${it.gen.id}-${it.index}`} className="group relative break-inside-avoid overflow-hidden rounded-xl bg-muted" style={{ aspectRatio: `${it.img.width || 1} / ${it.img.height || 1}` }}>
          <button type="button" onClick={() => onOpen(at)} className="block size-full cursor-zoom-in" aria-label="Open image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.img.url} alt={it.gen.prompt} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          </button>
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/60 via-transparent to-black/20 p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={() => onFavorite(it.gen)}
                className={cn("pointer-events-auto rounded-md bg-black/40 p-1.5 backdrop-blur hover:bg-black/60", it.gen.favorite ? "text-rose-400" : "text-white")}
                aria-label={it.gen.favorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart className={cn("size-3.5", it.gen.favorite && "fill-current")} />
              </button>
              <button
                type="button"
                onClick={() => downloadImage(it.img.url, fileNameFor(it.gen, it.img, it.index))}
                className="pointer-events-auto rounded-md bg-black/40 p-1.5 text-white backdrop-blur hover:bg-black/60"
                aria-label="Download"
              >
                <Download className="size-3.5" />
              </button>
            </div>
            <p className="line-clamp-2 text-[12px] leading-snug text-white">{it.gen.prompt}</p>
          </div>
          {it.gen.favorite && <Heart className="pointer-events-none absolute left-2 top-2 size-3.5 fill-rose-400 text-rose-400 drop-shadow group-hover:opacity-0" />}
        </div>
      ))}
    </div>
  );
}

/** Full-size viewer with previous/next (arrow keys work too). */
export function Lightbox({
  items,
  at,
  onAt,
  onClose,
  names,
  onFavorite,
  onRemix,
}: {
  items: ViewerItem[];
  at: number | null;
  onAt: (at: number) => void;
  onClose: () => void;
  names: Names;
  onFavorite: (g: Generation) => void;
  onRemix: (g: Generation) => void;
}) {
  const open = at !== null && Boolean(items[at]);
  const item = open ? items[at!] : null;
  const total = items.length;

  React.useEffect(() => {
    if (!open || total < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onAt(((at ?? 0) + 1) % total);
      if (e.key === "ArrowLeft") onAt(((at ?? 0) - 1 + total) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, at, total, onAt]);

  if (!item) return <Dialog open={false} onOpenChange={() => onClose()} />;
  const g = item.gen;
  const expiry = expiryLabel(g.expiresAt);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="xl"
      title={total > 1 ? `Image ${at! + 1} of ${total}` : "Image"}
      description={`${names.model(g.model)} · ${g.aspect} · ${g.quality}${g.style && g.style !== "none" ? ` · ${names.style(g.style)}` : ""} · ${item.img.width}×${item.img.height}`}
    >
      <div className="space-y-4">
        <div className="relative flex items-center justify-center rounded-xl bg-muted/60 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.img.url} alt={g.prompt} className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain" />
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => onAt((at! - 1 + total) % total)}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white backdrop-blur hover:bg-black/65"
                aria-label="Previous image"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => onAt((at! + 1) % total)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white backdrop-blur hover:bg-black/65"
                aria-label="Next image"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[14px] leading-relaxed">{g.prompt}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {relativeTime(g.createdAt)}
              {expiry ? ` · ${expiry.text.toLowerCase()} — download to keep it` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onFavorite(g)} aria-pressed={g.favorite}>
              <Heart className={cn(g.favorite && "fill-current text-rose-500")} /> {g.favorite ? "Favorited" : "Favorite"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onRemix(g);
                onClose();
              }}
            >
              <RefreshCw /> Remix
            </Button>
            <CopyButton value={g.prompt} label="Prompt" />
            <Button variant="accent" size="sm" onClick={() => downloadImage(item.img.url, fileNameFor(g, item.img, item.index))}>
              <Download /> Download
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
