import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, Cookie, FileText, Receipt, ShieldCheck, TriangleAlert } from "lucide-react";
import { LEGAL, LEGAL_PAGES, type LegalSlug } from "@/components/marketing/legal/config";
import { Container, SectionHeading } from "@/components/marketing/ui";

export const metadata: Metadata = {
  title: "Legal",
  description: `Terms of Service, Privacy Policy, Refund Policy, Acceptable Use Policy, Cookie Policy and Disclaimer for ${LEGAL.brand}.`,
  alternates: { canonical: "/legal" },
};

const ICON: Record<LegalSlug, typeof FileText> = {
  terms: FileText,
  privacy: ShieldCheck,
  refunds: Receipt,
  "acceptable-use": Ban,
  cookies: Cookie,
  disclaimer: TriangleAlert,
};

export default function LegalIndexPage() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Legal"
          title="Policies, in plain language"
          description={`Everything that governs your use of ${LEGAL.brand}. Each policy starts with a short summary, and all of them were last updated on ${LEGAL.updated}.`}
        />
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEGAL_PAGES.map((p) => {
            const Icon = ICON[p.slug];
            return (
              <Link key={p.slug} href={`/legal/${p.slug}`} className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-border-strong">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="size-5" />
                </span>
                <p className="mt-4 font-semibold">{p.title}</p>
                <p className="mt-1 flex-1 text-[13.5px] leading-relaxed text-muted-foreground">{p.summary}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent">
                  Read <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
        <p className="mt-10 text-center text-[13.5px] text-muted-foreground">
          Questions? Email{" "}
          <a href={`mailto:${LEGAL.email}`} className="font-medium text-accent hover:underline">
            {LEGAL.email}
          </a>
        </p>
      </Container>
    </section>
  );
}
