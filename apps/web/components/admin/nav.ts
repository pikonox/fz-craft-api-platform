import {
  Banknote,
  Cpu,
  CreditCard,
  History,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareText,
  ScrollText,
  Server,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = { href: string; label: string; icon: LucideIcon; count?: "pendingPayments" | "openTickets" };

export const ADMIN_NAV: { section: string; items: AdminNavItem[] }[] = [
  {
    section: "Manage",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/payments", label: "Payments", icon: Banknote, count: "pendingPayments" },
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    section: "Catalog",
    items: [
      { href: "/admin/providers", label: "Providers", icon: Server },
      { href: "/admin/models", label: "Models", icon: Cpu },
      { href: "/admin/plans", label: "Plans", icon: Layers },
      { href: "/admin/payment-methods", label: "Payment methods", icon: CreditCard },
    ],
  },
  {
    section: "Support",
    items: [
      { href: "/admin/tickets", label: "Tickets", icon: LifeBuoy, count: "openTickets" },
      { href: "/admin/feedback", label: "Feedback", icon: MessageSquareText },
    ],
  },
  {
    section: "System",
    items: [
      { href: "/admin/logs", label: "Request logs", icon: ScrollText },
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/admin/audit", label: "Audit log", icon: History },
    ],
  },
];

const ALL = ADMIN_NAV.flatMap((s) => s.items);

export function isActive(href: string, pathname: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export function adminTitleFor(pathname: string): string {
  if (/^\/admin\/users\/[^/]+$/.test(pathname)) return "User";
  return ALL.find((i) => isActive(i.href, pathname))?.label ?? "Overview";
}
