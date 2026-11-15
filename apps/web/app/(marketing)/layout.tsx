import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingHeader } from "@/components/marketing/header";
import { BRAND } from "@/lib/utils";

export const metadata: Metadata = {
  description: `${BRAND} is an OpenAI-compatible API for chat, reasoning, vision, embeddings and image models — one key, a free tier, simple token plans and real-time usage analytics.`,
  openGraph: { siteName: BRAND, type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg">
        Skip to content
      </a>
      <MarketingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
