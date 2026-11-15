/**
 * Anthropic Messages API ⇄ OpenAI Chat Completions translation.
 *
 * Lets Anthropic clients (Claude Code, the Anthropic SDKs) call any model in the catalog: requests
 * to POST /v1/messages are converted to an OpenAI chat request for the upstream, and the answer is
 * converted back — including streaming events, tool use and extended thinking.
 */
import { randomBase62 } from "../lib/crypto";
import type { Usage } from "./stream";

type Json = Record<string, any>;

export type Converted = {
  /** OpenAI chat completions body (model is replaced later with the upstream id). */
  body: Json;
  /** Whether the client asked for extended thinking — only then are thinking blocks returned. */
  thinking: boolean;
  hasImages: boolean;
};

// ── Errors ──────────────────────────────────────────────

/** Anthropic error `type` for an HTTP status. */
export function anthropicErrorType(status: number): string {
  if (status === 400 || status === 422) return "invalid_request_error";
  if (status === 401) return "authentication_error";
  if (status === 402 || status === 403) return "permission_error";
  if (status === 404) return "not_found_error";
  if (status === 413) return "request_too_large";
  if (status === 429) return "rate_limit_error";
  if (status === 503 || status === 529) return "overloaded_error";
  return "api_error";
}

export function anthropicError(status: number, message: string) {
  return { type: "error", error: { type: anthropicErrorType(status), message } };
}

// ── Request: Anthropic → OpenAI ─────────────────────────

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b: Json) => (b?.type === "text" ? String(b.text ?? "") : b?.type === "image" ? "[image]" : b?.type === "document" ? "[document]" : ""))
    .filter(Boolean)
    .join("\n");
};

function imagePart(block: Json): Json | null {
  const s = block?.source ?? {};
  if (s.type === "base64" && s.data) return { type: "image_url", image_url: { url: `data:${s.media_type || "image/png"};base64,${s.data}` } };
  if (s.type === "url" && s.url) return { type: "image_url", image_url: { url: s.url } };
  return null;
}

function documentText(block: Json): string {
  const s = block?.source ?? {};
  const title = block?.title ? `${block.title}\n` : "";
  if (s.type === "text" && s.data) return `${title}${s.data}`;
  if (s.type === "content" && Array.isArray(s.content)) return `${title}${textOf(s.content)}`;
  return `${title}[A ${s.media_type || "binary"} document was attached but can't be read by this model.]`;
}

/** Maps a thinking budget to an OpenAI-style reasoning effort. */
export function effortForBudget(budget: unknown): "low" | "medium" | "high" {
  const n = typeof budget === "number" ? budget : 8000;
  return n < 4000 ? "low" : n < 16000 ? "medium" : "high";
}

export function anthropicToOpenAI(req: Json, opts: { reasoning: boolean }): Converted {
  const messages: Json[] = [];
  let hasImages = false;

  const system = typeof req.system === "string" ? req.system : textOf(req.system);
  if (system.trim()) messages.push({ role: "system", content: system });

  for (const m of Array.isArray(req.messages) ? req.messages : []) {
    const role = m?.role === "assistant" ? "assistant" : "user";
    if (typeof m?.content === "string") {
      messages.push({ role, content: m.content });
      continue;
    }
    const blocks: Json[] = Array.isArray(m?.content) ? m.content : [];

    if (role === "assistant") {
      const text = blocks
        .filter((b) => b?.type === "text")
        .map((b) => String(b.text ?? ""))
        .join("");
      const toolCalls = blocks
        .filter((b) => b?.type === "tool_use" || b?.type === "server_tool_use")
        .map((b) => ({ id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      const msg: Json = { role: "assistant", content: text || (toolCalls.length ? null : "") };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      messages.push(msg);
      continue;
    }

    // User turn: tool results become `tool` messages (they must directly follow the assistant's tool calls)
    const parts: Json[] = [];
    for (const b of blocks) {
      if (b?.type === "tool_result") {
        const content = textOf(b.content) || (typeof b.content === "string" ? b.content : "");
        messages.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: b.is_error ? `Error: ${content}` : content || "(no output)" });
      } else if (b?.type === "text") {
        parts.push({ type: "text", text: String(b.text ?? "") });
      } else if (b?.type === "image") {
        const p = imagePart(b);
        if (p) {
          parts.push(p);
          hasImages = true;
        }
      } else if (b?.type === "document") {
        parts.push({ type: "text", text: documentText(b) });
      }
    }
    if (parts.length) {
      const onlyText = parts.every((p) => p.type === "text");
      messages.push({ role: "user", content: onlyText ? parts.map((p) => p.text).join("\n") : parts });
    }
  }

  const body: Json = { model: req.model, messages, stream: req.stream === true };
  if (typeof req.max_tokens === "number") body.max_tokens = req.max_tokens;
  if (typeof req.temperature === "number") body.temperature = req.temperature;
  if (typeof req.top_p === "number") body.top_p = req.top_p;
  if (Array.isArray(req.stop_sequences) && req.stop_sequences.length) body.stop = req.stop_sequences.slice(0, 4);

  // Custom tools only — Anthropic server tools (web search, bash, editor…) have no OpenAI equivalent
  const tools = (Array.isArray(req.tools) ? req.tools : []).filter((t: Json) => t?.name && t?.input_schema);
  if (tools.length) {
    body.tools = tools.map((t: Json) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema } }));
    const tc = req.tool_choice;
    if (tc?.type === "any") body.tool_choice = "required";
    else if (tc?.type === "tool" && tc.name) body.tool_choice = { type: "function", function: { name: tc.name } };
    else if (tc?.type === "none") body.tool_choice = "none";
    else body.tool_choice = "auto";
    if (tc?.disable_parallel_tool_use) body.parallel_tool_calls = false;
  }

  const thinking = req.thinking?.type === "enabled" || req.thinking?.type === "adaptive";
  if (thinking && opts.reasoning) body.reasoning_effort = effortForBudget(req.thinking?.budget_tokens);

  return { body, thinking, hasImages };
}

// ── Response: OpenAI → Anthropic ────────────────────────

export function stopReason(finish: string | null | undefined, hadTools: boolean): string {
  if (hadTools || finish === "tool_calls" || finish === "function_call") return "tool_use";
  if (finish === "length") return "max_tokens";
  if (finish === "content_filter") return "refusal";
  return "end_turn";
}

const parseArgs = (s: string): Json => {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : { value: v };
  } catch {
    return { _raw: s };
  }
};

export const newMessageId = () => `msg_${randomBase62(24)}`;

export function usageBlock(u: Usage) {
  return { input_tokens: Math.max(0, u.input - u.cached), output_tokens: u.output, cache_read_input_tokens: u.cached, cache_creation_input_tokens: 0 };
}

export function openAIToAnthropic(json: Json, opts: { model: string; thinking: boolean; usage: Usage }) {
  const choice = json?.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  const content: Json[] = [];
  const reasoning = msg.reasoning_content ?? msg.reasoning ?? "";
  if (opts.thinking && typeof reasoning === "string" && reasoning) content.push({ type: "thinking", thinking: reasoning, signature: "" });
  if (typeof msg.content === "string" && msg.content) content.push({ type: "text", text: msg.content });
  const calls: Json[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  for (const c of calls) content.push({ type: "tool_use", id: c.id || `toolu_${randomBase62(20)}`, name: c.function?.name ?? "", input: parseArgs(c.function?.arguments ?? "") });
  if (!content.length) content.push({ type: "text", text: "" });
  return {
    id: newMessageId(),
    type: "message",
    role: "assistant",
    model: opts.model,
    content,
    stop_reason: stopReason(choice.finish_reason, calls.length > 0),
    stop_sequence: null,
    usage: usageBlock(opts.usage),
  };
}

// ── Streaming: OpenAI chunks → Anthropic events ─────────

const sse = (event: string, data: Json) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

type Block = { kind: "thinking" | "text" | "tool"; tool?: number };

/**
 * Turns OpenAI stream chunks into Anthropic SSE events. Pure: every method returns the text to
 * write, so it can be tested without a socket.
 */
export class AnthropicStream {
  private index = -1;
  private open: Block | null = null;
  private tools = new Map<number, { id: string; name: string; pending: string; started: boolean; done: boolean }>();
  private sawTools = false;
  readonly id = newMessageId();

  constructor(private opts: { model: string; thinking: boolean }) {}

  start(inputTokens: number): string {
    return (
      sse("message_start", {
        type: "message_start",
        message: {
          id: this.id,
          type: "message",
          role: "assistant",
          model: this.opts.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: inputTokens, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }) + sse("ping", { type: "ping" })
    );
  }

  ping(): string {
    return sse("ping", { type: "ping" });
  }

  private close(): string {
    if (!this.open) return "";
    const out = sse("content_block_stop", { type: "content_block_stop", index: this.index });
    if (this.open.kind === "tool" && this.open.tool !== undefined) {
      const t = this.tools.get(this.open.tool);
      if (t) t.done = true;
    }
    this.open = null;
    return out;
  }

  private openBlock(block: Block, contentBlock: Json): string {
    let out = this.close();
    this.index += 1;
    this.open = block;
    out += sse("content_block_start", { type: "content_block_start", index: this.index, content_block: contentBlock });
    return out;
  }

  onChunk(chunk: Json): string {
    let out = "";
    for (const choice of chunk?.choices ?? []) {
      const d = choice.delta ?? {};
      const reasoning = d.reasoning_content ?? d.reasoning;
      if (this.opts.thinking && typeof reasoning === "string" && reasoning) {
        if (this.open?.kind !== "thinking") out += this.openBlock({ kind: "thinking" }, { type: "thinking", thinking: "", signature: "" });
        out += sse("content_block_delta", { type: "content_block_delta", index: this.index, delta: { type: "thinking_delta", thinking: reasoning } });
      }
      if (typeof d.content === "string" && d.content) {
        if (this.open?.kind !== "text") out += this.openBlock({ kind: "text" }, { type: "text", text: "" });
        out += sse("content_block_delta", { type: "content_block_delta", index: this.index, delta: { type: "text_delta", text: d.content } });
      }
      for (const tc of d.tool_calls ?? []) {
        this.sawTools = true;
        const i = typeof tc.index === "number" ? tc.index : 0;
        const t = this.tools.get(i) ?? { id: "", name: "", pending: "", started: false, done: false };
        if (tc.id) t.id = tc.id;
        if (tc.function?.name) t.name += tc.function.name;
        if (tc.function?.arguments) t.pending += tc.function.arguments;
        this.tools.set(i, t);
        if (t.done) continue; // late fragments for an already-closed block are dropped
        if (!t.started && t.name) {
          t.started = true;
          out += this.openBlock({ kind: "tool", tool: i }, { type: "tool_use", id: t.id || `toolu_${randomBase62(20)}`, name: t.name, input: {} });
        }
        if (t.started && t.pending) {
          if (!(this.open?.kind === "tool" && this.open.tool === i)) continue; // interleaved: keep buffering
          out += sse("content_block_delta", { type: "content_block_delta", index: this.index, delta: { type: "input_json_delta", partial_json: t.pending } });
          t.pending = "";
        }
      }
    }
    return out;
  }

  /** Closes open blocks and ends the message. */
  finish(r: { finishReason: string | null; usage: Usage }): string {
    let out = "";
    // Flush tool calls whose name arrived late or that were buffered while another block was open
    for (const [i, t] of [...this.tools.entries()].sort((a, b) => a[0] - b[0])) {
      if (t.done) continue;
      if (!t.started) {
        t.started = true;
        out += this.openBlock({ kind: "tool", tool: i }, { type: "tool_use", id: t.id || `toolu_${randomBase62(20)}`, name: t.name || "tool", input: {} });
      } else if (!(this.open?.kind === "tool" && this.open.tool === i)) {
        continue;
      }
      if (t.pending) {
        out += sse("content_block_delta", { type: "content_block_delta", index: this.index, delta: { type: "input_json_delta", partial_json: t.pending } });
        t.pending = "";
      }
    }
    if (this.index < 0) out += this.openBlock({ kind: "text" }, { type: "text", text: "" });
    out += this.close();
    out += sse("message_delta", {
      type: "message_delta",
      delta: { stop_reason: stopReason(r.finishReason, this.sawTools), stop_sequence: null },
      usage: usageBlock(r.usage),
    });
    out += sse("message_stop", { type: "message_stop" });
    return out;
  }

  error(message: string, status = 500): string {
    return sse("error", anthropicError(status, message));
  }
}
