/** Helpers for reading OpenAI-style SSE chat streams from an upstream. */

export type RawUsage = Record<string, unknown> | null | undefined;

export type Usage = { input: number; output: number; cached: number; reasoning: number };

export type ToolCallAcc = { id: string; type: string; name: string; arguments: string };

export type StreamResult = {
  content: string;
  reasoning: string;
  toolCalls: ToolCallAcc[];
  finishReason: string | null;
  usage: Usage | null;
  ttftMs: number | null;
  reasoningMs: number;
  error: string | null;
  aborted: boolean;
};

export function normalizeUsage(u: RawUsage): Usage | null {
  if (!u || typeof u !== "object") return null;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  const any = u as Record<string, any>;
  const input = n(any.prompt_tokens ?? any.input_tokens);
  const output = n(any.completion_tokens ?? any.output_tokens);
  const cached = n(any.prompt_tokens_details?.cached_tokens ?? any.prompt_cache_hit_tokens ?? any.input_tokens_details?.cached_tokens);
  const reasoning = n(any.completion_tokens_details?.reasoning_tokens ?? any.output_tokens_details?.reasoning_tokens);
  if (!input && !output) return null;
  return { input, output, cached: Math.min(cached, input), reasoning };
}

/** Yields complete lines from a byte stream, handling chunk boundaries. */
export async function* readLines(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const cancel = () => reader.cancel().catch(() => {});
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        yield line;
      }
    }
    buf += decoder.decode();
    if (buf) yield buf;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock?.();
  }
}

/**
 * Reads an upstream chat stream, aggregates content/reasoning/tool calls/usage,
 * and calls `onChunk` for every parsed JSON chunk (in order).
 */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  opts: { startedAt: number; signal?: AbortSignal; onChunk?: (chunk: any) => void | Promise<void>; onComment?: (line: string) => void },
): Promise<StreamResult> {
  const out: StreamResult = { content: "", reasoning: "", toolCalls: [], finishReason: null, usage: null, ttftMs: null, reasoningMs: 0, error: null, aborted: false };
  const tools = new Map<number, ToolCallAcc>();
  let reasoningStart = 0;
  let reasoningEnd = 0;

  try {
    for await (const line of readLines(body, opts.signal)) {
      if (!line) continue;
      if (line.startsWith(":")) {
        opts.onComment?.(line);
        continue;
      }
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") break;
      let chunk: any;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk?.error) {
        out.error = typeof chunk.error === "string" ? chunk.error : chunk.error.message ?? "Upstream stream error";
        await opts.onChunk?.(chunk);
        break;
      }
      const u = normalizeUsage(chunk?.usage);
      if (u) out.usage = u;
      for (const choice of chunk?.choices ?? []) {
        const d = choice.delta ?? choice.message ?? {};
        const r = d.reasoning_content ?? d.reasoning ?? "";
        if (typeof r === "string" && r) {
          if (!reasoningStart) reasoningStart = Date.now();
          reasoningEnd = Date.now();
          out.reasoning += r;
        }
        if (typeof d.content === "string" && d.content) out.content += d.content;
        for (const tc of d.tool_calls ?? []) {
          const i = tc.index ?? 0;
          const acc = tools.get(i) ?? { id: "", type: "function", name: "", arguments: "" };
          if (tc.id) acc.id = tc.id;
          if (tc.type) acc.type = tc.type;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          tools.set(i, acc);
        }
        if ((r || d.content || d.tool_calls?.length) && out.ttftMs === null) out.ttftMs = Date.now() - opts.startedAt;
        if (choice.finish_reason) out.finishReason = choice.finish_reason;
      }
      await opts.onChunk?.(chunk);
    }
  } catch (err) {
    if (opts.signal?.aborted) out.aborted = true;
    else out.error = (err as Error)?.message ?? "stream interrupted";
  }
  if (opts.signal?.aborted) out.aborted = true;
  out.toolCalls = [...tools.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  out.reasoningMs = reasoningStart ? reasoningEnd - reasoningStart : 0;
  return out;
}

export function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
