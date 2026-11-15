import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";
import { CodeWindow } from "../code-window";
import { CtaButtons } from "../session";
import { FeaturesGrid } from "./features";
import { HowItWorksDemo } from "./how-it-works";
import { Backdrop, Container, GradientText, SectionHeading } from "../ui";

/**
 * Image Studio showcase tiles: apps/web/public/showcase/1.jpg … 4.jpg (square, ~800 px).
 * Current images are public-domain NASA photos (images.nasa.gov): Crab Nebula (PIA03606),
 * aurora from the ISS (iss066e146457), Jupiter's clouds (PIA21984) and a barred spiral galaxy
 * (Hubble). Replace them with your own Image Studio results any time; a missing file shows its gradient.
 */
/** True when a file exists in /public — so missing showcase photos don't cause 404 requests. */
function hasPublicFile(src: string) {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", src));
  } catch {
    return false;
  }
}

const SHOWCASE = [
  { src: "/showcase/1.jpg", fallback: "radial-gradient(circle at 30% 30%,#fcd34d,#f97316 45%,#7c3aed)" },
  { src: "/showcase/2.jpg", fallback: "linear-gradient(160deg,#0ea5e9,#312e81 70%)" },
  { src: "/showcase/3.jpg", fallback: "radial-gradient(circle at 70% 60%,#f0abfc,#a855f7 40%,#1e1b4b)" },
  { src: "/showcase/4.jpg", fallback: "linear-gradient(200deg,#34d399,#065f46 60%,#0f172a)" },
];

// ── Hero ───────────────────────────────────────────────

export function Hero() {
  return (
    <section className="relative -mt-16 overflow-hidden pt-16">
      <Backdrop />
      <Container className="relative grid items-center gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pb-24 lg:pt-20">
        <div className="flex min-w-0 animate-slide-up flex-col items-start">
          <Link
            href="/docs"
            className="group inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card/70 py-1 pl-1 pr-3 text-[12.5px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">New</span>
            <span className="truncate">Reasoning, vision &amp; image models on one key</span>
            <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <h1 className="mt-6 text-balance text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[54px] lg:text-[44px] xl:text-[54px]">
            One API key.
            <br />
            <GradientText>Every model you need.</GradientText>
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
            Chat, reasoning, vision, embeddings and image generation behind a single OpenAI-compatible endpoint. Start free, scale on simple token plans, and watch every request
            in real time.
          </p>
          <CtaButtons className="mt-8 w-full sm:w-auto" />
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            {["Free tier, no card", "Works with OpenAI SDKs", "Pay in USDT or PKR"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-success" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 animate-fade-in">
          <CodeWindow />
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[12.5px] text-muted-foreground lg:justify-start">
            <Sparkles className="size-3.5 text-accent" />
            <span>
              <span className="font-medium text-foreground">OpenAI SDK compatible</span> — change <code className="rounded bg-muted px-1 py-px font-mono text-[11.5px]">base_url</code> and
              your key. Nothing else.
            </span>
          </p>
        </div>
      </Container>
    </section>
  );
}

// ── Feature bento ──────────────────────────────────────

/** Feature grid; the animated demos live in ./features (client). Photos are checked here, on the server. */
export function Features() {
  return <FeaturesGrid images={SHOWCASE.map((s) => ({ src: hasPublicFile(s.src) ? s.src : null, fallback: s.fallback }))} />;
}

// ── How it works ───────────────────────────────────────

export function HowItWorks() {
  return <HowItWorksDemo />;
}

// ── Closing call to action ─────────────────────────────

export function FinalCta() {
  return (
    <div className="hero-surface relative overflow-hidden rounded-3xl border border-border px-6 py-14 text-center sm:px-12 sm:py-20">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(60%_70%_at_50%_50%,black,transparent)]" aria-hidden />
      <div className="relative mx-auto flex max-w-2xl flex-col items-center">
        <SectionHeading title={<>Your first request is a minute away</>} description="Create a free account, copy your key, and send a chat completion with the SDK you already use." />
        <CtaButtons className="mt-8 justify-center" secondaryHref="/pricing" secondaryLabel="Compare plans" />
      </div>
    </div>
  );
}
