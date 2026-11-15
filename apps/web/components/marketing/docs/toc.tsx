"use client";

import * as React from "react";
import { ChevronDown, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOC_ITEMS, DOC_NAV } from "./nav";

/** Offset (px) below the sticky header at which a heading counts as "current". */
const ACTIVE_OFFSET = 140;

function useActiveSection() {
  const [active, setActive] = React.useState(DOC_ITEMS[0]?.id ?? "");
  React.useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setActive(DOC_ITEMS[DOC_ITEMS.length - 1].id);
        return;
      }
      let current = DOC_ITEMS[0].id;
      for (const it of DOC_ITEMS) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top - ACTIVE_OFFSET <= 0) current = it.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return active;
}

function TocLinks({ active, onNavigate }: { active: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      {DOC_NAV.map((g) => (
        <div key={g.group}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle-foreground">{g.group}</p>
          <ul className="flex flex-col gap-px">
            {g.items.map((it) => {
              const on = it.id === active;
              return (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    onClick={onNavigate}
                    aria-current={on ? "location" : undefined}
                    className={cn(
                      "relative flex items-center rounded-md py-1.5 pr-2 text-[13.5px] transition-colors",
                      it.sub ? "pl-6 text-[13px]" : "pl-3",
                      on ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {on && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden />}
                    {it.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Sticky left sidebar (lg+). */
export function DocsToc() {
  const active = useActiveSection();
  return (
    <nav aria-label="On this page" className="scrollbar-thin sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-10 pr-2">
      <TocLinks active={active} />
    </nav>
  );
}

/** Sticky "On this page" bar with a dropdown (below lg). */
export function DocsTocMobile() {
  const active = useActiveSection();
  const [open, setOpen] = React.useState(false);
  const label = DOC_ITEMS.find((i) => i.id === active)?.label ?? "Contents";
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="docs-toc-mobile"
        className="flex h-11 w-full items-center gap-2 text-left text-[13.5px]"
      >
        <List className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">On this page:</span>
        <span className="min-w-0 truncate font-medium">{label}</span>
        <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id="docs-toc-mobile" className="scrollbar-thin max-h-[60dvh] animate-fade-in overflow-y-auto border-t border-border py-4">
          <TocLinks active={active} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
