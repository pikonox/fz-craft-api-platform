import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Faq, FaqJsonLd, type FaqItem } from "@/components/marketing/faq";
import { ModelStrip } from "@/components/marketing/landing/models";
import { ModelShowcase } from "@/components/marketing/landing/model-showcase";
import { Features, FinalCta, Hero, HowItWorks } from "@/components/marketing/landing/sections";
import { RoutingDiagram } from "@/components/marketing/landing/routing";
import { PricingFacts, PricingPlans } from "@/components/marketing/pricing";
import { Container, SectionHeading } from "@/components/marketing/ui";
import { BRAND } from "@/lib/utils";

const title = `${BRAND} — one API key for every AI model`;
const description = `Chat, reasoning, vision, embeddings and image generation behind one OpenAI-compatible endpoint. Free tier, simple token plans, per-key limits and live usage analytics.`;

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  openGraph: { title, description, url: "/" },
  twitter: { title, description },
};

const FAQ: FaqItem[] = [
  {
    q: "Does it work with OpenAI and Anthropic SDKs?",
    a: (
      <>
        Yes, both. <code>/v1/chat/completions</code>, <code>/v1/embeddings</code>, <code>/v1/images/generations</code>, <code>/v1/images/edits</code> and <code>/v1/models</code> follow the
        OpenAI API, and <code>/v1/messages</code> follows Anthropic&apos;s Messages API — including streaming, tool use and thinking. Every chat model works through either one, so the
        OpenAI SDK, the Anthropic SDK and Claude Code all work with the same key.
      </>
    ),
    text: "Yes. The chat completions, embeddings, images and models endpoints follow the OpenAI API, and /v1/messages follows Anthropic's Messages API, including streaming, tool use and thinking. Every chat model works through either, so the OpenAI SDK, the Anthropic SDK and Claude Code all work with the same key.",
  },
  {
    q: "What does the free tier include?",
    a: "A token allowance that refreshes every 30 days, the free chat and embedding models, streaming, tools and vision. You don't need to add any payment details to start.",
  },
  {
    q: "What happens when I run out of tokens?",
    a: (
      <>
        Requests return <code>429</code> with the code <code>insufficient_quota</code> until your allowance refreshes. You can upgrade your plan at any time, or buy a 24h pass — its tokens are
        available immediately and are used before your plan&apos;s allowance.
      </>
    ),
    text: "Requests return 429 insufficient_quota until your allowance refreshes. Upgrade your plan or buy a 24h pass, whose tokens are available immediately and used first.",
  },
  {
    q: "How are images billed?",
    a: "Per image, from a separate image wallet, at a price set by the model and the quality tier (1K, 2K or 4K). The cost is held when you send the request and refunded for any image that doesn't come back, so failed images are never charged.",
  },
  {
    q: "Which payment methods can I use?",
    a: "Binance Pay and USDT on BNB Smart Chain (BEP-20) are verified automatically. JazzCash, Easypaisa and bank transfers are paid in PKR and reviewed manually before your balance is credited.",
  },
  {
    q: "Can I limit what a key can do?",
    a: "Yes. Every key can have its own scopes, requests-per-minute cap, token limit, spend cap, model allowlist, IP allowlist and expiry date. Keys can be paused or revoked instantly from the dashboard.",
  },
];

export default function LandingPage() {
  return (
    <>
      <Hero />

      <section aria-label="Models" className="border-y border-border bg-card/40 py-10">
        <ModelStrip />
      </section>

      <section id="routing" className="scroll-mt-20 overflow-hidden py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow="Works with your tools"
            title="Bring any tool. Reach every model."
            description="Point Claude Code, Cursor, Cline, Roo Code, Kilo Code, opencode or any OpenAI or Anthropic SDK at one base URL. Every request is routed to a healthy provider and billed to one key."
          />
          <div className="mt-14">
            <RoutingDiagram />
          </div>
        </Container>
      </section>

      <section id="features" className="scroll-mt-20 py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow="Platform"
            title="Everything between your code and the model"
            description="Routing, keys, limits, analytics and billing are handled for you — so shipping a new model is a one-line change, not a new integration."
          />
          <div className="mt-12">
            <Features />
          </div>
        </Container>
      </section>

      <section id="models" className="scroll-mt-20 border-t border-border bg-sidebar/40 py-20 sm:py-28">
        <Container>
          <SectionHeading eyebrow="Models" title="Pick a model. Keep your code." description="Every model speaks the same API — OpenAI or Anthropic format. Pick a provider, copy the model id, and you're done." />
          <div className="mt-10">
            <ModelShowcase />
          </div>
        </Container>
      </section>

      <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-28">
        <Container>
          <SectionHeading eyebrow="How it works" title="From sign-up to first token in three steps" />
          <div className="mt-12">
            <HowItWorks />
          </div>
        </Container>
      </section>

      <section id="pricing" className="scroll-mt-20 border-t border-border bg-sidebar/40 py-20 sm:py-28">
        <Container>
          <SectionHeading eyebrow="Pricing" title="Simple plans, generous tokens" description="Start free. Upgrade when you need more tokens, higher rate limits or paid models. Yearly billing saves more." />
          <div className="mt-10 space-y-6">
            <PricingPlans />
            <PricingFacts />
          </div>
          <div className="mt-8 flex justify-center">
            <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
              Full pricing, 24h passes &amp; image prices <ArrowRight className="size-4" />
            </Link>
          </div>
        </Container>
      </section>

      <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <SectionHeading
            align="left"
            eyebrow="FAQ"
            title="Questions, answered"
            description={
              <>
                Can&apos;t find what you need? The{" "}
                <Link href="/docs" className="text-accent hover:underline">
                  documentation
                </Link>{" "}
                covers every endpoint, limit and error code.
              </>
            }
          />
          <Faq items={FAQ} />
        </Container>
        <FaqJsonLd items={FAQ} />
      </section>

      <section className="pb-20 sm:pb-28">
        <Container>
          <FinalCta />
        </Container>
      </section>
    </>
  );
}
