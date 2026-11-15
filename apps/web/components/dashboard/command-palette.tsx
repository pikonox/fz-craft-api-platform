"use client";

import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { useTheme } from "next-themes";
import { BookOpen, KeyRound, MessageSquare, Moon, Plus, Search, Wallet } from "lucide-react";
import { NAV } from "./nav";
import { useCheckout, useUi } from "@/lib/stores";

export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useUi();
  const router = useRouter();
  const startCheckout = useCheckout((s) => s.start);
  const { resolvedTheme, setTheme } = useTheme();

  const run = (fn: () => void) => {
    setCommandOpen(false);
    setTimeout(fn, 0);
  };

  const itemCls =
    "flex h-10 cursor-pointer select-none items-center gap-3 rounded-lg px-3 text-[13.5px] text-muted-foreground data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:size-4";

  return (
    <D.Root open={commandOpen} onOpenChange={setCommandOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <D.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl data-[state=open]:animate-slide-up">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Jump to a page or run an action</D.Description>
          <Command loop>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input autoFocus placeholder="Search pages and actions…" className="h-13 flex-1 bg-transparent py-4 text-sm outline-none placeholder:text-subtle-foreground" />
            </div>
            <Command.List className="scrollbar-thin max-h-[52vh] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-muted-foreground">No results.</Command.Empty>
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle-foreground">
                <Command.Item className={itemCls} onSelect={() => run(() => router.push("/dashboard/playground"))} keywords={["chat"]}>
                  <MessageSquare /> New chat
                </Command.Item>
                <Command.Item className={itemCls} onSelect={() => run(() => router.push("/dashboard/api-keys?create=1"))} keywords={["key", "token"]}>
                  <KeyRound /> Create API key
                </Command.Item>
                <Command.Item className={itemCls} onSelect={() => run(() => startCheckout({ purpose: "balance" }))} keywords={["pay", "deposit", "add balance"]}>
                  <Wallet /> Top up balance
                </Command.Item>
                <Command.Item className={itemCls} onSelect={() => run(() => startCheckout({ purpose: "image_wallet" }))} keywords={["images"]}>
                  <Plus /> Add image credits
                </Command.Item>
                <Command.Item className={itemCls} onSelect={() => run(() => router.push("/docs"))} keywords={["documentation", "quickstart"]}>
                  <BookOpen /> Quickstart guide
                </Command.Item>
                <Command.Item className={itemCls} onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))} keywords={["dark", "light", "theme"]}>
                  <Moon /> Toggle theme
                </Command.Item>
              </Command.Group>
              {NAV.map((s) => (
                <Command.Group
                  key={s.section}
                  heading={s.section}
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle-foreground"
                >
                  {s.items.map((i) => (
                    <Command.Item key={i.href} className={itemCls} keywords={i.keywords?.split(" ")} onSelect={() => run(() => router.push(i.href))}>
                      <i.icon /> {i.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
