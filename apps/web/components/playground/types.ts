export type Attachment = { kind: "image" | "file"; name: string; mime: string; size: number; key?: string; url?: string; text?: string };

export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  summary: string;
  sources: { title: string; url: string; snippet: string }[];
};

export type Msg = {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  reasoning: string;
  reasoningMs: number;
  toolCalls: ToolCall[];
  model: string;
  usage: { input: number; output: number; cached: number; reasoning: number };
  latencyMs: number;
  ttftMs: number;
  status: "complete" | "streaming" | "stopped" | "error";
  error: string;
  feedback: "" | "up" | "down";
  createdAt: string;
};

export type Params = {
  temperature: number;
  maxTokens: number;
  topP: number;
  system: string;
  reasoningEffort: "" | "low" | "medium" | "high";
  jsonMode: boolean;
  webSearch: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  model: string;
  pinned: boolean;
  params: Params;
  currentLeafId: string | null;
  lastMessageAt: string;
  createdAt: string;
};

export type Artifact = { id: string; title: string; lang: string; code: string };

export const DEFAULT_PARAMS: Params = { temperature: 0.7, maxTokens: 4096, topP: 1, system: "", reasoningEffort: "", jsonMode: false, webSearch: false };

/** Messages on the path from the root to `leafId`. */
export function pathTo(leafId: string | null, byId: Record<string, Msg>): Msg[] {
  const out: Msg[] = [];
  const seen = new Set<string>();
  let cur = leafId ? byId[leafId] : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? byId[cur.parentId] : undefined;
  }
  return out;
}

export function childrenOf(parentId: string | null, byId: Record<string, Msg>): Msg[] {
  return Object.values(byId)
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Follow the newest child down to a leaf. */
export function deepestLeaf(id: string, byId: Record<string, Msg>): string {
  let cur = id;
  for (let i = 0; i < 500; i++) {
    const kids = childrenOf(cur, byId);
    if (!kids.length) return cur;
    cur = kids[kids.length - 1].id;
  }
  return cur;
}
