import {
  Bell,
  ChartLine,
  CodeXml,
  Cpu,
  Gift,
  ImagePlus,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareText,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: "NEW" | "LIVE"; keywords?: string };

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Build",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, keywords: "home dashboard" },
      { href: "/dashboard/playground", label: "Playground", icon: CodeXml, keywords: "chat test prompt" },
      { href: "/dashboard/image-studio", label: "Image Studio", icon: ImagePlus, badge: "NEW", keywords: "images generate picture" },
      { href: "/dashboard/api-keys", label: "API keys", icon: KeyRound, keywords: "token secret" },
      { href: "/dashboard/usage", label: "Usage & logs", icon: ChartLine, badge: "LIVE", keywords: "analytics requests logs" },
      { href: "/dashboard/models", label: "Models", icon: Cpu, keywords: "catalog pricing" },
    ],
  },
  {
    section: "Billing",
    items: [
      { href: "/dashboard/billing/plan", label: "Plans", icon: Layers, keywords: "upgrade pricing subscription pass" },
      { href: "/dashboard/billing/balance", label: "Balance & top-up", icon: Wallet, keywords: "payment deposit binance usdt jazzcash easypaisa" },
      { href: "/dashboard/rewards", label: "Rewards", icon: Gift, keywords: "referral invite" },
    ],
  },
  {
    section: "Account",
    items: [
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { href: "/dashboard/settings", label: "Settings", icon: Settings, keywords: "profile security password 2fa telegram" },
      { href: "/dashboard/support", label: "Support", icon: LifeBuoy, keywords: "help ticket" },
      { href: "/dashboard/feedback", label: "Feedback", icon: MessageSquareText },
    ],
  },
];

export const ALL_NAV = NAV.flatMap((s) => s.items);

export function titleFor(pathname: string): string {
  const exact = ALL_NAV.find((i) => i.href === pathname);
  if (exact) return exact.label;
  const prefix = [...ALL_NAV].sort((a, b) => b.href.length - a.href.length).find((i) => i.href !== "/dashboard" && pathname.startsWith(i.href));
  if (pathname.startsWith("/dashboard/billing/payments")) return "Payment";
  return prefix?.label ?? "Overview";
}
