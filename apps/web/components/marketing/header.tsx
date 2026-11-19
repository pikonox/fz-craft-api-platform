"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowRight, LayoutDashboard, Menu, Moon, Sun, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useSession } from "./session";

const LINKS: { href: string; label: string; mobileLabel?: string; badge?: string }[] = [
  { href: "/models", label: "Models" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/#vscode", label: "VS Code", mobileLabel: "VS Code extension", badge: "New" },
];

function NewBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent">{children}</span>;
}

function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon-sm" className={className} onClick={() => setTheme(dark ? "light" : "dark")} aria-label="Toggle theme">
      {!mounted ? <Sun className="opacity-0" /> : dark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function MarketingHeader() {
  const pathname = usePathname();
  const { signedIn } = useSession();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => (href.startsWith("/#") ? false : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200",
        scrolled || open ? "border-border bg-background/75 shadow-[0_1px_0_0_rgb(0_0_0/0.02)] backdrop-blur-xl backdrop-saturate-150" : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition-colors hover:bg-muted hover:text-foreground",
                isActive(l.href) ? "text-foreground" : "text-muted-foreground",
              )}
              aria-current={isActive(l.href) ? "page" : undefined}
            >
              {l.label}
              {l.badge && <NewBadge>{l.badge}</NewBadge>}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {signedIn ? (
            <Button variant="primary" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/dashboard">
                <LayoutDashboard /> Dashboard
              </Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button variant="primary" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/register">
                  Get API key <ArrowRight />
                </Link>
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-nav">
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="animate-slide-up border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
          <nav aria-label="Mobile" className="mx-auto flex max-w-[1200px] flex-col gap-1 px-4 py-3 sm:px-6">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground hover:bg-muted">
                {l.mobileLabel ?? l.label}
                {l.badge && <NewBadge>{l.badge}</NewBadge>}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
              {signedIn ? (
                <Button variant="primary" asChild className="col-span-2">
                  <Link href="/dashboard">
                    <LayoutDashboard /> Dashboard
                  </Link>
                </Button>
              ) : (
                <>
                  <Button variant="outline" asChild>
                    <Link href="/login">Sign in</Link>
                  </Button>
                  <Button variant="primary" asChild>
                    <Link href="/register">Get API key</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
