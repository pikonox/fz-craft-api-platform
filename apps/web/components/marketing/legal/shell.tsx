import Link from "next/link";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "../ui";
import { LEGAL, LEGAL_PAGES, type LegalSlug } from "./config";

export type TocItem = { id: string; title: string };

/** Typography for long-form legal text. */
const prose = cn(
  "text-[15px] leading-7 text-muted-foreground",
  "[&_p]:mt-4 [&_p:first-child]:mt-0",
  "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:marker:text-subtle-foreground",
  "[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
  "[&_h3]:mt-8 [&_h3]:text-[15.5px] [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_a]:font-medium [&_a]:text-accent [&_a]:underline-offset-2 [&_a:hover]:underline",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground",
);

export function LegalPage({ slug, toc, intro, children }: { slug: LegalSlug; toc: TocItem[]; intro?: React.ReactNode; children: React.ReactNode }) {
  const page = LEGAL_PAGES.find((p) => p.slug === slug)!;
  return (
    <div className="py-14 sm:py-20">
      <Container className="grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_200px] xl:gap-14">
        {/* Policies */}
        <aside className="hidden lg:block">
          <nav aria-label="Legal" className="sticky top-24">
            <Link href="/legal" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-subtle-foreground hover:text-foreground">
              Legal
            </Link>
            <ul className="mt-3 space-y-0.5">
              {LEGAL_PAGES.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/legal/${p.slug}`}
                    aria-current={p.slug === slug ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                      p.slug === slug ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{page.title}</h1>
          <p className="mt-3 text-[13px] text-subtle-foreground">
            Effective {LEGAL.effective} · Last updated {LEGAL.updated}
          </p>
          {intro && <div className={cn(prose, "mt-6")}>{intro}</div>}

          {/* Mobile: policy switcher + contents */}
          <details className="mt-6 rounded-xl border border-border bg-card px-4 py-3 lg:hidden">
            <summary className="cursor-pointer text-[13.5px] font-medium">On this page</summary>
            <ul className="mt-2 space-y-1.5 text-[13.5px]">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-muted-foreground hover:text-foreground">
                    {t.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>

          <div className={cn(prose, "mt-4")}>{children}</div>

          <div className="mt-14 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-foreground">Questions about this policy?</p>
              <p className="mt-0.5 text-[13.5px] text-muted-foreground">We usually reply within two business days.</p>
            </div>
            <a href={`mailto:${LEGAL.email}`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-[13.5px] font-medium hover:bg-muted">
              <Mail className="size-4" /> {LEGAL.email}
            </a>
          </div>

          <nav aria-label="Other policies" className="mt-8 flex flex-wrap gap-2 lg:hidden">
            {LEGAL_PAGES.filter((p) => p.slug !== slug).map((p) => (
              <Link key={p.slug} href={`/legal/${p.slug}`} className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground">
                {p.title}
              </Link>
            ))}
          </nav>
        </article>

        {/* On this page */}
        <aside className="hidden xl:block">
          <nav aria-label="On this page" className="sticky top-24">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-subtle-foreground">On this page</p>
            <ul className="mt-3 space-y-2 border-l border-border">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="-ml-px block border-l border-transparent pl-3 text-[13px] leading-snug text-muted-foreground hover:border-foreground/40 hover:text-foreground">
                    {t.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </Container>
    </div>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 pt-10">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        <a href={`#${id}`} className="font-semibold! text-foreground! no-underline!">
          {title}
        </a>
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Plain-language summary box shown at the top of a policy. */
export function InShort({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-accent/25 bg-accent-soft/50 p-5 text-[14.5px] text-foreground/90">
      <p className="mt-0! text-[12px] font-semibold uppercase tracking-[0.12em] text-accent">In short</p>
      <div className="[&_ul]:mt-2">{children}</div>
    </div>
  );
}

export function LegalTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="scrollbar-thin mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-[13.5px]" style={{ minWidth: head.length > 2 ? head.length * 170 : undefined }}>
        <thead className="bg-muted/50 text-[12.5px] text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border align-top">
              {r.map((c, j) => (
                <td key={j} className={cn("px-4 py-3", j === 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const toc = (items: [string, string][]): TocItem[] => items.map(([id, title]) => ({ id, title }));
