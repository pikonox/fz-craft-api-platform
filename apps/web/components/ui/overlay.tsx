"use client";

import * as React from "react";
import { Dialog as D, DropdownMenu as DM, Popover as P, Tooltip as T } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Dialog ──────────────────────────────────────────────
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[min(88vh,820px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl shadow-black/30 data-[state=open]:animate-slide-up",
            w,
            className,
          )}
          aria-describedby={description ? undefined : undefined}
        >
          {(title || description) && (
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                {title && <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>}
                {description ? <D.Description className="mt-1 text-[13px] text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">Dialog</D.Description>}
              </div>
              <D.Close className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                <X className="size-4" />
              </D.Close>
            </div>
          )}
          {!title && <D.Title className="sr-only">Dialog</D.Title>}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3.5">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ── Sheet (side panel) ──────────────────────────────────
export function Sheet({ open, onOpenChange, side = "left", children, className, title = "Panel" }: { open: boolean; onOpenChange: (o: boolean) => void; side?: "left" | "right"; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in" />
        <D.Content className={cn("fixed inset-y-0 z-50 flex w-[300px] max-w-[88vw] flex-col bg-sidebar shadow-2xl data-[state=open]:animate-fade-in", side === "left" ? "left-0 border-r" : "right-0 border-l", "border-border", className)}>
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ── Dropdown menu ───────────────────────────────────────
export const DropdownMenu = DM.Root;
export const DropdownTrigger = DM.Trigger;

export function DropdownContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 min-w-48 overflow-hidden rounded-xl border border-border bg-elevated p-1 shadow-xl shadow-black/20 data-[state=open]:animate-fade-in", className)}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownItem({ className, danger, ...props }: React.ComponentProps<typeof DM.Item> & { danger?: boolean }) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-muted data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground",
        danger && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground", className)} {...props} />;
}

export function DropdownSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />;
}

// ── Popover ─────────────────────────────────────────────
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ className, align = "end", sideOffset = 8, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 rounded-xl border border-border bg-elevated shadow-xl shadow-black/20 outline-none data-[state=open]:animate-fade-in", className)}
        {...props}
      />
    </P.Portal>
  );
}

// ── Tooltip ─────────────────────────────────────────────
export const TooltipProvider = T.Provider;

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return <>{children}</>;
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[60] max-w-xs rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md data-[state=delayed-open]:animate-fade-in">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
