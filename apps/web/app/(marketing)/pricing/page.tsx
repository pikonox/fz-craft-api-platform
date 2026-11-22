import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { Faq, FaqJsonLd, type FaqItem } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/landing/sections";
import { ImagePricing, PassCards, PaymentMethodGrid, PlanCompare, PricingFacts, PricingPlans } from "@/components/marketing/pricing";
import { Backdrop, Container, SectionHeading } from "@/components/marketing/ui";
import { BRAND } from "@/lib/utils";

const description = `${BRAND} pricing: a free tier, monthly or yearly token plans, 24-hour passes for bursts, and per-image pricing for image generation. Pay with Binance Pay, USDT (BEP-20), JazzCash, Easypaisa or bank transfer.`;

export const metadata: Metadata = {
  title: "Pricing",
  description,
  openGraph: { title: `Pricing · ${BRAND}`, description, url: "/pricing" },
  twitter: { title: `Pricing · ${BRAND}`, description },
};

const FAQ: FaqItem[] = [
  {
    q: "What counts as a token?",
    a: "Input tokens plus output tokens, including any reasoning tokens a model produces. Cached input tokens count like any other input token. Coding tools resend the whole conversation on every step, so long sessions use tokens much faster than chat.",
  },
  {
    q: "When does my token allowance refresh?",
    a: "Every 30 days from the start of your plan. Yearly plans are billed once a year and refresh the token allowance every 30 days for the whole year.",
  },
  {
    q: "How do 24h passes work with my plan?",
    a: "Passes are for accounts on the Free plan — no subscription, nothing renews. A pass's tokens are used first, then your free allowance, then any bonus tokens from rewards, and while it's active you get its higher rate limit and access to all models. Already on a paid monthly plan? Upgrade to a bigger plan instead; the unused part of your current plan is credited.",
  },
  {
    q: "Can I change plans or get a refund?",
    a: "You can upgrade at any time; the unused part of your current paid plan is credited against the new one. Your first paid monthly plan can be refunded to your balance within 24 hours of purchase.",
  },
  {
    q: "Does my plan renew automatically?",
    a: "If auto-renew is on and your balance covers the price, the plan renews from your balance at the end of the term. Otherwise you move back to the free plan — nothing is charged without funds in your balance.",
  },
  {
    q: "Why is there a separate image wallet?",
    a: "Images are priced per image rather than per token, so they draw from their own wallet. That keeps your token allowance predictable, and lets you budget image spend separately. You top it up with the same payment methods.",
  },
  {
    q: "How long do payments take?",
    a: "Binance Pay and USDT (BEP-20) payments are verified automatically as soon as the transaction is confirmed — no waiting for a person. JazzCash, Easypaisa and bank transfers are checked by a person, and your balance is credited once approved.",
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="relative -mt-16 overflow-hidden pt-16">
        <Backdrop />
        <Container className="relative pb-16 pt-14 sm:pt-20">
          <SectionHeading
            as="h1"
            eyebrow="Pricing"
            title="Simple plans. Generous tokens."
            description="Start on the free tier, upgrade when you need more tokens, faster rate limits or paid models. Every plan uses the same API and the same keys."
          />
          <div className="mt-12">
            <PricingPlans />
          </div>
          <div className="mt-6">
            <PricingFacts />
          </div>
        </Container>
      </section>

      <section id="passes" className="scroll-mt-20 border-t border-border bg-sidebar/40 py-20">
        <Container>
          <SectionHeading
            eyebrow="24h passes"
            title="Need a burst? Grab a pass."
            description="Launch day, a batch job or a hackathon — on the Free plan, a pass adds a block of tokens and all models for 24 hours. No subscription, nothing renews."
          />
          <div className="mx-auto mt-10 max-w-5xl">
            <PassCards />
          </div>
        </Container>
      </section>

      <section id="compare" className="scroll-mt-20 py-20">
        <Container>
          <SectionHeading eyebrow="Compare" title="Plans side by side" />
          <div className="mt-10">
            <PlanCompare />
          </div>
        </Container>
      </section>

      <section id="images" className="scroll-mt-20 border-t border-border bg-sidebar/40 py-20">
        <Container className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Image generation"
              title="Pay per image, from a separate wallet"
              description="Image models are billed per image at the quality tier you choose — not from your token allowance."
            />
            <ul className="mt-6 space-y-3 text-[14px] text-muted-foreground">
              {[
                "Quality tiers: 1K, 2K and 4K (long side 1024, 2048 and 3840 px).",
                "The cost of n images is held when you send the request; images that don't come back are refunded.",
                "If the image wallet can't cover the request you get 402 insufficient_image_balance — nothing else is affected.",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <ImagePricing />
        </Container>
      </section>

      <section id="payments" className="scroll-mt-20 py-20">
        <Container>
          <SectionHeading
            eyebrow="Payments"
            title="Pay in USDT or PKR"
            description="Top up your balance or image wallet, or pay for a plan directly. Crypto payments are verified automatically; local PKR payments are reviewed by our team."
          />
          <PaymentMethodGrid className="mt-10" />
          <p className="mx-auto mt-6 flex max-w-2xl items-start justify-center gap-2 text-center text-[13px] text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              PKR amounts are converted from USD at the rate shown at checkout. For on-chain payments, send the exact amount shown — it identifies your order. Details in the{" "}
              <Link href="/docs#payments" className="text-accent hover:underline">
                payments guide
              </Link>
              .
            </span>
          </p>
        </Container>
      </section>

      <section id="faq" className="scroll-mt-20 border-t border-border bg-sidebar/40 py-20">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <SectionHeading align="left" eyebrow="FAQ" title="Billing questions" description="Everything about tokens, plans, passes and payments." />
          <Faq items={FAQ} />
        </Container>
        <FaqJsonLd items={FAQ} />
      </section>

      <section className="py-20">
        <Container>
          <FinalCta />
        </Container>
      </section>
    </>
  );
}
