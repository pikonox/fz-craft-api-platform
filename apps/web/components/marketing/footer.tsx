import Link from "next/link";
import { Logo } from "@/components/brand";
import { BRAND } from "@/lib/utils";
import { FooterContact, FooterStatus } from "./footer-client";
import { Container } from "./ui";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/models", label: "Models" },
      { href: "/pricing", label: "Pricing" },
      { href: "/pricing#passes", label: "24h passes" },
      { href: "/pricing#images", label: "Image pricing" },
      { href: "/#features", label: "Features" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs#authentication", label: "Quickstart" },
      { href: "/docs#chat-completions", label: "API reference" },
      { href: "/docs#rate-limits", label: "Rate limits" },
      { href: "/docs#errors", label: "Error codes" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/#routing", label: "Coding tools" },
      { href: "/models#estimator", label: "Cost estimator" },
      { href: "/#faq", label: "FAQ" },
      { href: "/register", label: "Create account" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/refunds", label: "Refund Policy" },
      { href: "/legal/acceptable-use", label: "Acceptable Use" },
      { href: "/legal/cookies", label: "Cookie Policy" },
      { href: "/legal/disclaimer", label: "Disclaimer" },
    ],
  },
];

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-border bg-sidebar/60">
      <Container className="grid gap-12 pb-12 pt-16 lg:grid-cols-[1.3fr_repeat(4,1fr)] lg:gap-8">
        <div className="max-w-xs">
          <Logo full logoClassName="h-[84px]" />
          <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
            One OpenAI-compatible endpoint for a whole catalog of AI models. Start free, pay in USDT or PKR, and scale as you grow.
          </p>
          <div className="mt-6">
            <FooterContact />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:col-span-4 lg:gap-8">
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="text-[13.5px] font-semibold text-foreground">{c.title}</p>
              <ul className="mt-4 space-y-3">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[13.5px] text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </Container>

      <Container>
        <div className="flex flex-col gap-3 border-t border-border py-6 text-[12.5px] text-subtle-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {BRAND}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <FooterStatus />
            <span>Model names and logos belong to their owners.</span>
          </div>
        </div>
      </Container>

      {/* Oversized wordmark that fades into the page */}
      <div aria-hidden className="pointer-events-none select-none overflow-hidden">
        <p className="-mb-[0.2em] whitespace-nowrap bg-gradient-to-b from-foreground/[0.09] via-foreground/[0.04] to-transparent bg-clip-text text-center text-[min(21vw,17rem)] font-bold leading-[0.95] tracking-[-0.06em] text-transparent">
          {BRAND}
        </p>
      </div>
    </footer>
  );
}
