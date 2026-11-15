"use client";

import Link from "next/link";
import { BookOpen, Mail, Send } from "lucide-react";
import { useStatus } from "@/lib/queries";
import { cn } from "@/lib/utils";

const DOT = { operational: "bg-success", degraded: "bg-warning", outage: "bg-danger" } as const;

/** Live service status from /api/status. */
export function FooterStatus({ className }: { className?: string }) {
  const { data } = useStatus();
  const level = data?.level ?? "operational";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("size-2 rounded-full", data ? DOT[level] : "bg-subtle-foreground/50")} aria-hidden />
      {data?.message ?? "Checking status…"}
    </span>
  );
}

const iconBtn =
  "flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground";

/** Contact shortcuts. Telegram and email only appear when they're configured in the admin. */
export function FooterContact() {
  const { data } = useStatus();
  const c = data?.contact;
  return (
    <div className="flex gap-2">
      {c?.telegram && (
        <a href={c.telegram} target="_blank" rel="noreferrer" className={iconBtn} aria-label="Telegram">
          <Send className="size-4" />
        </a>
      )}
      {c?.email && (
        <a href={`mailto:${c.email}`} className={iconBtn} aria-label="Email support">
          <Mail className="size-4" />
        </a>
      )}
      <Link href="/docs" className={iconBtn} aria-label="Documentation">
        <BookOpen className="size-4" />
      </Link>
    </div>
  );
}
