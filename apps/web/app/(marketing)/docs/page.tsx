import type { Metadata } from "next";
import { LangPrefProvider } from "@/components/marketing/code-block";
import { DocsContent } from "@/components/marketing/docs/content";
import { DocsToc, DocsTocMobile } from "@/components/marketing/docs/toc";
import { Container, Eyebrow } from "@/components/marketing/ui";
import { API_BASE_URL, BRAND } from "@/lib/utils";

const description = `${BRAND} API quickstart: authentication, the base URL (${API_BASE_URL}), chat completions with streaming and reasoning, vision, tool calling, embeddings, image generation, rate limits, errors and billing.`;

export const metadata: Metadata = {
  title: "API documentation",
  description,
  openGraph: { title: `API documentation · ${BRAND}`, description, url: "/docs", type: "article" },
  twitter: { title: `API documentation · ${BRAND}`, description },
};

export default function DocsPage() {
  return (
    <LangPrefProvider>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 -top-16 h-[420px] overflow-hidden" aria-hidden>
          <div className="bg-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(70%_80%_at_30%_0%,black,transparent)]" />
          <div className="absolute -top-40 left-1/4 size-[520px] rounded-full bg-accent/15 blur-[130px]" />
        </div>
        <Container className="relative lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[240px_minmax(0,1fr)] xl:gap-16">
          <aside className="hidden pt-12 lg:block">
            <DocsToc />
          </aside>
          <div className="min-w-0 pb-24">
            <DocsTocMobile />
            <article className="max-w-[820px]">
              <header className="pb-12 pt-10 lg:pt-12">
                <Eyebrow>Documentation</Eyebrow>
                <h1 className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[42px]">API quickstart</h1>
                <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
                  Everything you need to call {BRAND} from your code: authentication, endpoints, streaming, reasoning, images, limits, errors and billing — with copy-paste examples
                  in curl, Python and Node.js.
                </p>
              </header>
              <DocsContent />
            </article>
          </div>
        </Container>
      </div>
    </LangPrefProvider>
  );
}
