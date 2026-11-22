import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Boxes, Tag } from "lucide-react";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingHeader } from "@/components/marketing/header";
import { Backdrop, Container, GradientText } from "@/components/marketing/ui";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

const PLACES = [
  { href: "/models", label: "Models", body: "Every model, its price and context size", icon: Boxes },
  { href: "/pricing", label: "Pricing", body: "Plans, 24h passes and image prices", icon: Tag },
  { href: "/docs", label: "Docs", body: "Quickstart, endpoints and coding tools", icon: BookOpen },
];

/** Shown for any URL that doesn't exist. Uses the site theme (Next's built-in 404 turns black in dark mode). */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader />
      <main id="main" className="relative flex-1 overflow-hidden">
        <Backdrop />
        <Container className="relative flex flex-col items-center py-20 text-center sm:py-28">
          <p className="font-mono text-[13px] font-medium tracking-[0.2em] text-accent">404</p>
          <h1 className="mt-3 text-balance text-[34px] font-semibold leading-tight tracking-tight sm:text-[44px]">
            <GradientText>This page doesn&apos;t exist</GradientText>
          </h1>
          <p className="mt-4 max-w-md text-pretty text-[15px] leading-relaxed text-muted-foreground">The link may be old or mistyped. Here are a few places to go instead.</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button variant="primary" size="lg" asChild>
              <Link href="/">
                Back to home <ArrowRight />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="bg-card/60 backdrop-blur">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </div>

          <ul className="mt-14 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
            {PLACES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="group flex h-full gap-3 rounded-2xl border border-border bg-card/80 p-4 backdrop-blur transition-colors hover:border-accent/40">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <p.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-[14px] font-semibold">
                      {p.label} <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">{p.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </main>
      <MarketingFooter />
    </div>
  );
}
