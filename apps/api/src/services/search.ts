import { env, isDev } from "../config/env";
import { logger } from "../lib/logger";

export type SearchResult = { title: string; url: string; snippet: string };

/** Web search is available with a Tavily key, or always in dev (with canned results for the mock provider). */
export const searchEnabled = () => Boolean(env.SEARCH_API_KEY) || (isDev && env.ENABLE_MOCK_PROVIDER);

export async function webSearch(query: string, max = 5): Promise<SearchResult[]> {
  if (!env.SEARCH_API_KEY) {
    return [
      { title: `Example result for “${query.slice(0, 50)}”`, url: "https://example.com/article", snippet: "Configure SEARCH_API_KEY (Tavily) to get real web results. This is a placeholder result used in development." },
      { title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(query), snippet: "Free encyclopedia search results for your query." },
    ];
  }
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SEARCH_API_KEY}` },
      body: JSON.stringify({ query, max_results: max, search_depth: "basic", include_answer: false }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`search ${r.status}`);
    const json: any = await r.json();
    return (json.results ?? []).slice(0, max).map((x: any) => ({ title: String(x.title ?? x.url), url: String(x.url), snippet: String(x.content ?? "").slice(0, 500) }));
  } catch (err) {
    logger.warn({ err }, "web search failed");
    return [];
  }
}
