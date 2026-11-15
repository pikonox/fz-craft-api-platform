"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ellipsis, MessageSquare, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Dialog, DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import type { Conversation } from "./types";

function group(list: Conversation[]) {
  const day = 86_400_000;
  const startToday = new Date().setHours(0, 0, 0, 0);
  const out: { label: string; items: Conversation[] }[] = [
    { label: "Pinned", items: [] },
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Previous 30 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const c of list) {
    const t = new Date(c.lastMessageAt).getTime();
    if (c.pinned) out[0].items.push(c);
    else if (t >= startToday) out[1].items.push(c);
    else if (t >= startToday - day) out[2].items.push(c);
    else if (t >= startToday - 7 * day) out[3].items.push(c);
    else if (t >= startToday - 30 * day) out[4].items.push(c);
    else out[5].items.push(c);
  }
  return out.filter((g) => g.items.length);
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onRename,
  onPin,
  onDelete,
  onClearAll,
}: {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const groups = useMemo(() => group(conversations.filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()))), [conversations, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 p-3">
        <Button variant="primary" className="w-full" onClick={onNew}>
          <Plus /> New chat
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="h-9 bg-transparent pl-9" />
        </div>
      </div>
      <div className="flex items-center justify-between px-4 pb-1 text-xs text-muted-foreground">
        <span>
          {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
        </span>
        {conversations.length > 0 && (
          <button onClick={() => setConfirmClear(true)} className="text-danger/80 hover:text-danger">
            Clear all
          </button>
        )}
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3">
        {loading && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>}
        {!loading && !conversations.length && (
          <div className="px-4 py-10 text-center text-xs leading-relaxed text-muted-foreground">
            <MessageSquare className="mx-auto mb-2 size-5" />
            Chats are saved to your account and sync across devices.
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mt-3">
            <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">{g.label}</p>
            {g.items.map((c) =>
              renaming === c.id ? (
                <form
                  key={c.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft.trim()) onRename(c.id, draft.trim());
                    setRenaming(null);
                  }}
                >
                  <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => setRenaming(null)} className="h-9 text-[13px]" />
                </form>
              ) : (
                <div key={c.id} className={cn("group/conv relative flex items-center rounded-lg transition-colors", activeId === c.id ? "bg-card ring-1 ring-border" : "hover:bg-card/60")}>
                  <button onClick={() => onSelect(c.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                    <span className="flex items-center gap-1.5">
                      {c.pinned && <Pin className="size-3 shrink-0 text-accent" />}
                      <span className={cn("truncate text-[13px]", activeId === c.id ? "font-medium text-foreground" : "text-muted-foreground")}>{c.title}</span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownTrigger asChild>
                      <button
                        className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/conv:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                        aria-label="Chat options"
                      >
                        <Ellipsis className="size-4" />
                      </button>
                    </DropdownTrigger>
                    <DropdownContent align="start">
                      <DropdownItem onSelect={() => onPin(c.id, !c.pinned)}>
                        {c.pinned ? (
                          <>
                            <PinOff /> Unpin
                          </>
                        ) : (
                          <>
                            <Pin /> Pin
                          </>
                        )}
                      </DropdownItem>
                      <DropdownItem
                        onSelect={() => {
                          setDraft(c.title);
                          setRenaming(c.id);
                        }}
                      >
                        <Pencil /> Rename
                      </DropdownItem>
                      <DropdownSeparator />
                      <DropdownItem danger onSelect={() => onDelete(c.id)}>
                        <Trash2 /> Delete
                      </DropdownItem>
                    </DropdownContent>
                  </DropdownMenu>
                </div>
              ),
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
          <Link href="/dashboard">
            <ArrowLeft /> Dashboard
          </Link>
        </Button>
      </div>

      <Dialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Delete all chats?"
        description="This permanently deletes every Playground conversation."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmClear(false);
                onClearAll();
              }}
            >
              Delete all
            </Button>
          </>
        }
      />
    </div>
  );
}
