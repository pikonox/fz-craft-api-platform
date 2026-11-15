"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronsUpDown, House, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, Shield, Sun, Wallet } from "lucide-react";
import { formatTokens, formatUsd } from "@nova/shared";
import { BrandLogo, LogoMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Kbd, Progress, Skeleton, StatusDot } from "@/components/ui/primitives";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger, Sheet, Tooltip } from "@/components/ui/overlay";
import { CommandPalette } from "./command-palette";
import { NotificationsBell } from "./notifications-bell";
import { CheckoutDialog } from "@/components/billing/checkout-dialog";
import { NAV, titleFor } from "./nav";
import { api } from "@/lib/api";
import { useMe, useStatus } from "@/lib/queries";
import { restoreSidebar, useCheckout, useUi } from "@/lib/stores";
import { useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Pages that manage their own full-height layout (no padded container). */
const FULL_BLEED = ["/dashboard/playground", "/dashboard/image-studio"];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mobileNav, setMobileNav, setCommandOpen, sidebarCollapsed } = useUi();
  const fullBleed = FULL_BLEED.some((p) => pathname.startsWith(p));

  useEffect(() => restoreSidebar(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      // ⌘B / Ctrl+B: collapse or expand the sidebar
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const ui = useUi.getState();
        ui.setSidebarCollapsed(!ui.sidebarCollapsed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  useEffect(() => setMobileNav(false), [pathname, setMobileNav]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-r border-border bg-sidebar transition-[width] duration-200 ease-out lg:flex lg:flex-col",
          sidebarCollapsed ? "w-[68px]" : "w-[264px]",
        )}
      >
        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav} title="Navigation">
        <SidebarContent />
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className={cn("min-h-0 flex-1", fullBleed ? "overflow-hidden" : "scrollbar-thin overflow-y-auto")}>
          {fullBleed ? children : <div className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">{children}</div>}
        </main>
      </div>
      <CommandPalette />
      <CheckoutDialog />
    </div>
  );
}

/** Wraps a sidebar item in a tooltip only when the sidebar is collapsed to icons. */
function RailTip({ collapsed, label, children }: { collapsed: boolean; label: React.ReactNode; children: React.ReactElement }) {
  return collapsed ? (
    <Tooltip content={label} side="right">
      {children}
    </Tooltip>
  ) : (
    children
  );
}

function SidebarContent({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { data } = useMe();
  const isAdmin = data?.user.role === "admin";
  const planName = data?.entitlement.plan?.name ?? "Free";

  return (
    <div className="flex h-full flex-col">
      {collapsed ? (
        <div className="flex h-[60px] shrink-0 items-center justify-center border-b border-border">
          <Link href="/dashboard" aria-label="Dashboard">
            <LogoMark className="h-7" />
          </Link>
        </div>
      ) : (
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <BrandLogo className="h-9" />
          </Link>
          <Badge tone={data?.entitlement.isPaid ? "accent" : "neutral"}>{planName}</Badge>
        </div>
      )}

      <nav className={cn("scrollbar-thin flex-1 overflow-y-auto py-4", collapsed ? "px-2.5" : "px-3")}>
        {NAV.map((section, si) => (
          <div key={section.section} className={collapsed ? "mb-3" : "mb-5"}>
            {collapsed ? (
              si > 0 && <div className="mx-auto mb-3 h-px w-6 bg-border" />
            ) : (
              <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">{section.section}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <RailTip collapsed={collapsed} label={item.label}>
                      <Link
                        href={item.href}
                        aria-label={collapsed ? item.label : undefined}
                        className={cn(
                          "group relative flex h-9 items-center rounded-lg text-[13.5px] font-medium transition-colors",
                          collapsed ? "justify-center" : "gap-3 px-3",
                          active ? "bg-card text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                        )}
                      >
                        {active && <span className={cn("absolute top-2 h-5 w-[3px] rounded-r-full bg-accent", collapsed ? "-left-2.5" : "-left-3")} />}
                        <item.icon className={cn("size-[17px] shrink-0", active ? "text-accent" : "text-subtle-foreground group-hover:text-muted-foreground")} />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {item.badge &&
                          (collapsed ? (
                            <span className={cn("absolute right-1.5 top-1.5 size-1.5 rounded-full", item.badge === "LIVE" ? "bg-success" : "bg-accent")} />
                          ) : (
                            <span className={cn("rounded px-1.5 py-px text-[9.5px] font-semibold tracking-wide", item.badge === "LIVE" ? "bg-success-soft text-success" : "bg-accent-soft text-accent")}>{item.badge}</span>
                          ))}
                      </Link>
                    </RailTip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {isAdmin && (
          <RailTip collapsed={collapsed} label="Admin panel">
            <Link
              href="/admin"
              aria-label={collapsed ? "Admin panel" : undefined}
              className={cn("flex h-9 items-center rounded-lg text-[13.5px] font-medium text-muted-foreground hover:bg-card/60 hover:text-foreground", collapsed ? "justify-center" : "gap-3 px-3")}
            >
              <Shield className="size-[17px] shrink-0 text-subtle-foreground" />
              {!collapsed && "Admin panel"}
            </Link>
          </RailTip>
        )}
      </nav>

      {collapsed ? <CompactAllowance /> : <AllowanceWidget />}
      <UserMenu collapsed={collapsed} />
    </div>
  );
}

/** Icon-rail version of the allowance card: a top-up button with the numbers in its tooltip and a thin usage bar. */
function CompactAllowance() {
  const { data } = useMe();
  const start = useCheckout((s) => s.start);
  if (!data) return <div className="h-14" />;
  const e = data.entitlement;
  const pct = e.totalTokens ? (e.usedTokens / e.totalTokens) * 100 : 0;
  return (
    <div className="mb-3 flex flex-col items-center gap-2">
      <Tooltip
        side="right"
        content={`${e.plan?.isFree ? "Free allowance" : "Plan tokens"}: ${formatTokens(e.usedTokens)} used · ${formatTokens(e.remainingTokens)} left · Balance ${formatUsd(data.user.mainBalance)} — click to top up`}
      >
        <button
          type="button"
          onClick={() => start({ purpose: "balance" })}
          className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Top up balance"
        >
          <Wallet className="size-4" />
        </button>
      </Tooltip>
      <div className="h-1 w-8 overflow-hidden rounded-full bg-muted-2" aria-hidden>
        <div className={cn("h-full rounded-full", pct > 90 ? "bg-danger" : pct > 75 ? "bg-warning" : "bg-accent")} style={{ width: `${Math.max(pct, pct > 0 ? 8 : 0)}%` }} />
      </div>
    </div>
  );
}

function AllowanceWidget() {
  const { data, isLoading } = useMe();
  const start = useCheckout((s) => s.start);
  if (isLoading || !data) {
    return (
      <div className="mx-3 mb-3 space-y-3 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-6 w-20" />
      </div>
    );
  }
  const e = data.entitlement;
  const pct = e.totalTokens ? (e.usedTokens / e.totalTokens) * 100 : 0;
  return (
    <div className="mx-3 mb-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">
        <span>{e.plan?.isFree ? "Free allowance" : "Plan tokens"}</span>
        <span className="tabular text-foreground">{pct < 0.1 && pct > 0 ? "<0.1" : pct.toFixed(1)}%</span>
      </div>
      <Progress value={pct} className="mt-2.5" tone={pct > 90 ? "danger" : pct > 75 ? "warning" : "accent"} />
      <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular">
        <span>{formatTokens(e.usedTokens)} used</span>
        <span>{formatTokens(e.remainingTokens)} left</span>
      </div>
      <div className="mt-3.5 flex items-end justify-between border-t border-border pt-3.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">Balance</p>
          <p className="mt-0.5 text-lg font-semibold tabular">{formatUsd(data.user.mainBalance)}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => start({ purpose: "balance" })}>
          <Wallet /> Top up
        </Button>
      </div>
    </div>
  );
}

function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { data } = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  if (!data) return <div className="h-[68px] border-t border-border" />;
  const u = data.user;
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    qc.clear();
    router.replace("/login");
  };
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          aria-label={collapsed ? "Account menu" : undefined}
          className={cn("flex h-[68px] w-full shrink-0 items-center border-t border-border text-left transition-colors hover:bg-card/60", collapsed ? "justify-center" : "gap-3 px-4")}
        >
          <Avatar name={u.name} email={u.email} />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{u.name || "Your account"}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <ChevronsUpDown className="size-4 text-subtle-foreground" />
            </>
          )}
        </button>
      </DropdownTrigger>
      <DropdownContent side="top" align="start" className="w-[240px]">
        <DropdownLabel>Signed in as {u.email}</DropdownLabel>
        <DropdownItem onSelect={() => router.push("/dashboard/settings")}>
          <Settings /> Settings
        </DropdownItem>
        <DropdownItem onSelect={() => router.push("/")}>
          <House /> Website
        </DropdownItem>
        <DropdownSeparator />
        <DropdownLabel>Theme</DropdownLabel>
        <div className="grid grid-cols-3 gap-1 px-1 pb-1">
          {[
            { v: "light", icon: Sun },
            { v: "dark", icon: Moon },
            { v: "system", icon: Monitor },
          ].map(({ v, icon: Icon }) => (
            <button key={v} onClick={() => setTheme(v)} className={cn("flex h-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted", mounted && theme === v && "bg-muted text-foreground")} aria-label={v}>
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        <DropdownSeparator />
        <DropdownItem danger onSelect={logout}>
          <LogOut /> Sign out
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

function Topbar() {
  const pathname = usePathname();
  const { setMobileNav, setCommandOpen, sidebarCollapsed, setSidebarCollapsed } = useUi();
  const { data: status } = useStatus();
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const { data } = useMe();
  const tone = status?.level === "outage" ? "danger" : status?.level === "degraded" ? "warning" : "success";
  const showUpgrade = data && !data.entitlement.isPaid;

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu">
        <Menu />
      </Button>
      <Tooltip content={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar (⌘B)`} side="bottom">
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-2 hidden lg:inline-flex"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </Tooltip>
      <nav className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
        <Link href="/dashboard" className="hidden text-muted-foreground hover:text-foreground sm:inline">
          Dashboard
        </Link>
        <ChevronRight className="hidden size-3.5 text-subtle-foreground sm:inline" />
        <span className="truncate font-medium">{titleFor(pathname)}</span>
      </nav>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {status && (
          <Tooltip content={status.announcement || status.message}>
            <span className="hidden items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground md:inline-flex">
              <StatusDot tone={tone} pulse={tone !== "success"} />
              {status.message}
            </span>
          </Tooltip>
        )}
        <button
          onClick={() => setCommandOpen(true)}
          className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:w-48"
        >
          <Search className="size-4" />
          <span className="hidden flex-1 text-left sm:inline">Search…</span>
          <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
        </button>
        <NotificationsBell />
        <Button variant="ghost" size="icon-sm" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {!mounted ? <Sun className="opacity-0" /> : resolvedTheme === "dark" ? <Sun /> : <Moon />}
        </Button>
        {showUpgrade && (
          <Button variant="primary" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/dashboard/billing/plan">Upgrade</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
