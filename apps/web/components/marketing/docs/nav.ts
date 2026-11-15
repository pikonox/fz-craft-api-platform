export type DocNavItem = { id: string; label: string; sub?: boolean };

/** Order matches the rendered sections; ids are the anchor targets (e.g. /docs#terms). */
export const DOC_NAV: { group: string; items: DocNavItem[] }[] = [
  {
    group: "Getting started",
    items: [
      { id: "introduction", label: "Introduction" },
      { id: "authentication", label: "Authentication" },
      { id: "base-url", label: "Base URL" },
    ],
  },
  {
    group: "Endpoints",
    items: [
      { id: "chat-completions", label: "Chat completions" },
      { id: "streaming", label: "Streaming", sub: true },
      { id: "reasoning", label: "Reasoning output" },
      { id: "vision", label: "Vision input" },
      { id: "tools", label: "Tool calling" },
      { id: "embeddings", label: "Embeddings" },
      { id: "images", label: "Images & edits" },
      { id: "models", label: "Models list" },
      { id: "anthropic", label: "Anthropic Messages" },
    ],
  },
  {
    group: "Coding tools",
    items: [{ id: "claude-code", label: "Claude Code & others" }],
  },
  {
    group: "Limits & errors",
    items: [
      { id: "rate-limits", label: "Rate limits & quotas" },
      { id: "errors", label: "Errors" },
    ],
  },
  {
    group: "Account",
    items: [
      { id: "billing", label: "Billing" },
      { id: "payments", label: "Payments" },
      { id: "terms", label: "Terms" },
    ],
  },
];

export const DOC_ITEMS = DOC_NAV.flatMap((g) => g.items);
