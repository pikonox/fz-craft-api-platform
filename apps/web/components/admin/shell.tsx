"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, ChevronsUpDown, LayoutDashboard, LogOut, Menu, Monitor, Moon, ShieldAlert, Sun } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, Spinner } from "@/components/ui/primitives";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger, Sheet } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, adminTitleFor, isActive } from "./nav";
import { useAdminStats } from "./queries";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useMe();
  const pathname = usePathname();
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => setMobileNav(false), [pathname]);

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <BrandLogo className="h-10" />
          <Spinner />
        </div>
      </div>
    );
  }

  if (isError || !data || data.user.role !== "admin") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <EmptyState
            icon={<ShieldAlert />}
            title="403 · Admins only"
            description="Your account doesn't have access to the admin panel. If you think this is a mistake, ask an existing admin to grant you access."
            action={
              <Button variant="primary" asChild>
                <Link href="/dashboard">
                  <ArrowLeft /> Back to dashboard
                </Link>
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-[256px] shrink-0 border-r border-border bg-sidebar lg:flex lg:flex-col">
        <SidebarContent />
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav} title="Admin navigation">
        <SidebarContent />
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileNav(true)} />
        <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent() {
  const pathname = usePathname();
  const { data: stats } = useAdminStats();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border px-5">
        <Link href="/admin" className="flex items-center gap-2.5">
          <BrandLogo className="h-9" />
        </Link>
        <Badge tone="accent">Admin</Badge>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
        {ADMIN_NAV.map((section) => (
          <div key={section.section} className="mb-5">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">{section.section}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href, pathname);
                const count = item.count && stats ? stats[item.count] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors",
                        active ? "bg-card text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                      )}
                    >
                      {active && <span className="absolute -left-3 top-2 h-5 w-[3px] rounded-r-full bg-accent" />}
                      <item.icon className={cn("size-[17px]", active ? "text-accent" : "text-subtle-foreground group-hover:text-muted-foreground")} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            "min-w-5 rounded-md px-1.5 py-px text-center text-[11px] font-semibold tabular",
                            item.count === "pendingPayments" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent",
                          )}
                          aria-label={`${count} pending`}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-3">
        <Link
          href="/dashboard"
          className="flex h-9 items-center gap-3 rounded-lg border border-border bg-card px-3 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-[17px] text-subtle-foreground" />
          Back to dashboard
        </Link>
      </div>
      <UserMenu />
    </div>
  );
}

function UserMenu() {
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
        <button className="flex h-[68px] w-full shrink-0 items-center gap-3 border-t border-border px-4 text-left transition-colors hover:bg-card/60">
          <Avatar name={u.name} email={u.email} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">{u.name || "Admin"}</p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
          <ChevronsUpDown className="size-4 text-subtle-foreground" />
        </button>
      </DropdownTrigger>
      <DropdownContent side="top" align="start" className="w-[232px]">
        <DropdownLabel>Signed in as {u.email}</DropdownLabel>
        <DropdownItem onSelect={() => router.push("/dashboard")}>
          <LayoutDashboard /> User dashboard
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

function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const { data: stats } = useAdminStats();
  const pending = stats?.pendingPayments ?? 0;

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu />
      </Button>
      <nav className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
        <Link href="/admin" className="hidden text-muted-foreground hover:text-foreground sm:inline">
          Admin
        </Link>
        <ChevronRight className="hidden size-3.5 text-subtle-foreground sm:inline" />
        <span className="truncate font-medium">{adminTitleFor(pathname)}</span>
      </nav>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {pending > 0 && !pathname.startsWith("/admin/payments") && (
          <Link
            href="/admin/payments"
            className="hidden items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
          >
            <span className="size-1.5 rounded-full bg-warning" />
            {pending} payment{pending === 1 ? "" : "s"} to review
          </Link>
        )}
        <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
          <Link href="/dashboard">
            <ArrowLeft /> Dashboard
          </Link>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {!mounted ? <Sun className="opacity-0" /> : resolvedTheme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
}
