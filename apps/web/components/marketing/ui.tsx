import * as React from "react";
import { cn } from "@/lib/utils";

export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-accent", className)}>
      <span className="h-px w-5 bg-gradient-to-r from-accent to-sky-400" aria-hidden />
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
  as: As = "h2",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <div className={cn("flex flex-col gap-3", align === "center" ? "mx-auto max-w-2xl items-center text-center" : "max-w-2xl", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <As className={cn("text-balance font-semibold tracking-tight", As === "h1" ? "text-[34px] leading-[1.1] sm:text-5xl" : "text-[28px] leading-[1.15] sm:text-[36px]")}>{title}</As>
      {description && <p className="text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">{description}</p>}
    </div>
  );
}

export function GradientText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("bg-gradient-to-r from-accent via-violet-400 to-sky-400 bg-clip-text text-transparent", className)}>{children}</span>;
}

/** Soft glow + grid backdrop used behind hero areas. */
export function Backdrop({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div className="bg-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(60%_55%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-48 left-1/2 size-[640px] -translate-x-[70%] rounded-full bg-accent/20 blur-[140px] dark:bg-accent/25" />
      <div className="absolute -top-24 left-1/2 size-[460px] translate-x-[10%] rounded-full bg-sky-400/15 blur-[130px]" />
    </div>
  );
}
