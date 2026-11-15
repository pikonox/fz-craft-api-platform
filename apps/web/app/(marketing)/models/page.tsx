import type { Metadata } from "next";
import { CatalogExplorer } from "@/components/marketing/catalog/explorer";
import { Container, SectionHeading } from "@/components/marketing/ui";
import { BRAND } from "@/lib/utils";

const title = `Model catalog — ${BRAND}`;
const description = `Browse every chat, image and embedding model on ${BRAND}: prices per 1M tokens, context windows and capabilities. Filter by provider, compare in a table and estimate your monthly usage.`;

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/models" },
  openGraph: { title, description, url: "/models" },
  twitter: { title, description },
};

export default function ModelsPage() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Model catalog"
          title="Every model. One endpoint."
          description="Every model works with the same key and the same OpenAI-compatible API. Filter by provider and capability, compare prices side by side and estimate your usage before you write a line of code."
        />
        <div className="mt-12">
          <CatalogExplorer />
        </div>
      </Container>
    </section>
  );
}
