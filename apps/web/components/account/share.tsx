"use client";

import { Mail, MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Share a link through WhatsApp, Telegram, X and email using their public intent URLs. */
export function ShareButtons({ url, text, subject, className }: { url: string; text: string; subject: string; className?: string }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  const targets = [
    { name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, icon: <MessageCircle className="size-4" /> },
    { name: "Telegram", href: `https://t.me/share/url?url=${u}&text=${t}`, icon: <Send className="size-4" /> },
    { name: "X", href: `https://x.com/intent/post?text=${t}&url=${u}`, icon: <XLogo className="size-3.5" /> },
    { name: "Email", href: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`, icon: <Mail className="size-4" /> },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
      {targets.map((s) => (
        <a
          key={s.name}
          href={s.href}
          target={s.name === "Email" ? undefined : "_blank"}
          rel="noreferrer"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card/70 text-[13px] font-medium text-foreground backdrop-blur transition-colors hover:border-border-strong hover:bg-muted"
        >
          <span className="text-muted-foreground">{s.icon}</span>
          {s.name}
        </a>
      ))}
    </div>
  );
}
