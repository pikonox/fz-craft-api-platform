import type { Request, Response } from "express";
import { AnthropicStream, anthropicError, anthropicToOpenAI, openAIToAnthropic } from "../anthropic";
import { preflight } from "../context";
import { GatewayError } from "../errors";
import { getModel, listModels } from "../registry";
import { normalizeUsage, readChatStream, sseHeaders } from "../stream";
import { countTextTokens, estimatePromptTokens, recordRequest } from "../usage";
import { dispatchChat, estimateUsage, scrubUpstreamError } from "./chat";

const norm = (id: string) => id.toLowerCase().replace(/\./g, "-");

/**
 * Anthropic clients send ids like "claude-sonnet-5-5-20261101" or "claude-haiku-5-5[1m]".
 * Resolve them to a catalog id: exact match, then without a date / context suffix, then
 * ignoring "." vs "-" differences.
 */
export async function resolveModelId(raw: unknown): Promise<unknown> {
  if (typeof raw !== "string" || !raw) return raw;
  if (await getModel(raw)) return raw;
  const stripped = raw.replace(/\[[^\]]*\]$/, "").replace(/-(\d{8}|latest)$/, "");
  if (stripped !== raw && (await getModel(stripped))) return stripped;
  const wanted = norm(stripped);
  const hit = (await listModels()).find((m) => m.enabled && norm(m.publicId) === wanted);
  return hit?.publicId ?? raw;
}

function validate(body: any) {
  if (!body || typeof body !== "object") throw new GatewayError(400, "Request body must be a JSON object.");
  if (typeof body.model !== "string" || !body.model) throw new GatewayError(400, "model: Field required", "invalid_request_error", "missing_model", "model");
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new GatewayError(400, "messages: Field required", "invalid_request_error", "invalid_value", "messages");
}

/** POST /v1/messages — the Anthropic Messages API, served by any chat model in the catalog. */
export async function messages(req: Request, res: Response) {
  const ctx = req.gw!;
  const body = req.body;
  validate(body);
  const model = await preflight(ctx, await resolveModelId(body.model), "chat");
  const conv = anthropicToOpenAI(body, { reasoning: model.capabilities.includes("reasoning") });
  if (conv.hasImages && !model.capabilities.includes("vision")) {
    throw new GatewayError(400, `'${model.publicId}' does not support image inputs.`, "invalid_request_error", "vision_not_supported", "messages");
  }

  const stream = body.stream === true;
  const startedAt = Date.now();
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) ac.abort();
  });

  const d = await dispatchChat(ctx, model, conv.body, ac.signal, startedAt, "messages");
  const base = { model, endpoint: "messages" as const, candidate: d.candidate, attempts: d.attempts, stream };

  if (d.clientError) {
    const err = scrubUpstreamError(await d.res.text(), d.candidate.upstreamModel, model.publicId);
    const message = String(err?.error?.message ?? "The upstream rejected the request");
    await recordRequest(ctx, { ...base, status: "error", httpStatus: d.res.status, errorCode: String(err?.error?.code ?? "upstream_rejected"), errorMessage: message, latencyMs: Date.now() - startedAt });
    res.status(d.res.status).json(anthropicError(d.res.status, message));
    return;
  }

  if (!stream) {
    const json: any = await d.res.json().catch(() => null);
    if (!json) throw new GatewayError(502, "The upstream returned an invalid response.", "server_error", "bad_upstream_response");
    let usage = normalizeUsage(json.usage);
    const estimated = !usage;
    if (!usage) {
      const msg = json.choices?.[0]?.message ?? {};
      usage = estimateUsage(conv.body.messages, { content: msg.content ?? "", reasoning: msg.reasoning_content ?? "", toolCalls: [] });
    }
    res.json(openAIToAnthropic(json, { model: model.publicId, thinking: conv.thinking, usage }));
    await recordRequest(ctx, { ...base, status: "success", httpStatus: 200, usage, estimated, latencyMs: Date.now() - startedAt, ttftMs: Date.now() - startedAt });
    return;
  }

  const out = new AnthropicStream({ model: model.publicId, thinking: conv.thinking });
  res.writeHead(200, sseHeaders());
  res.flushHeaders?.();
  res.write(out.start(estimatePromptTokens(conv.body.messages)));
  const result = await readChatStream(d.res.body!, {
    startedAt,
    signal: ac.signal,
    onComment: () => res.write(out.ping()),
    onChunk: (chunk) => {
      if (chunk?.error) return;
      const text = out.onChunk(chunk);
      if (text) res.write(text);
    },
  });

  const estimated = !result.usage;
  const usage = result.usage ?? estimateUsage(conv.body.messages, result);
  if (!result.aborted) {
    res.write(result.error ? out.error(result.error, 502) : out.finish({ finishReason: result.finishReason, usage }));
    res.end();
  }
  await recordRequest(ctx, {
    ...base,
    status: result.error ? "error" : "success",
    httpStatus: result.error ? 502 : result.aborted ? 499 : 200,
    errorCode: result.error ? "stream_error" : result.aborted ? "client_closed" : "",
    errorMessage: result.error ?? "",
    usage,
    estimated,
    latencyMs: Date.now() - startedAt,
    ttftMs: result.ttftMs,
  });
}

/** POST /v1/messages/count_tokens — an estimate; nothing is sent upstream or billed. */
export async function countTokens(req: Request, res: Response) {
  const body = req.body;
  validate(body);
  const model = await getModel(String(await resolveModelId(body.model)));
  if (!model || !model.enabled || model.type !== "chat") {
    throw new GatewayError(404, `model: ${body.model}`, "invalid_request_error", "model_not_found", "model");
  }
  const conv = anthropicToOpenAI(body, { reasoning: false });
  const tools = (conv.body.tools ?? []).reduce((n: number, t: any) => n + countTextTokens(JSON.stringify(t.function)) + 8, 0);
  res.json({ input_tokens: estimatePromptTokens(conv.body.messages) + tools });
}
