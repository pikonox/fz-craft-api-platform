import type { Request, Response } from "express";
import type { ModelLean } from "../../db/models";
import { GatewayError } from "../errors";
import { preflight, type CallerContext } from "../context";
import { dispatch, type DispatchResult } from "../router";
import { normalizeUsage, readChatStream, sseHeaders, type StreamResult, type Usage } from "../stream";
import { countTextTokens, estimatePromptTokens, recordRequest } from "../usage";
import { quickReplyFor } from "../../services/quickReplies";

export function hasImageParts(messages: any[]): boolean {
  return (messages ?? []).some((m) => Array.isArray(m?.content) && m.content.some((p: any) => p?.type === "image_url"));
}

export function validateChatBody(body: any) {
  if (!body || typeof body !== "object") throw new GatewayError(400, "Request body must be a JSON object.");
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new GatewayError(400, "'messages' must be a non-empty array.", "invalid_request_error", "invalid_value", "messages");
  }
}

/** Upstream body: swap in the upstream model id, force usage reporting on streams, clamp max tokens. */
export function upstreamChatBody(body: any, model: ModelLean, upstreamModel: string): string {
  const b: any = { ...body, model: upstreamModel };
  if (b.stream) b.stream_options = { ...(body.stream_options ?? {}), include_usage: true };
  for (const k of ["max_tokens", "max_completion_tokens"]) {
    if (typeof b[k] === "number" && model.maxOutput) b[k] = Math.min(b[k], model.maxOutput);
  }
  return JSON.stringify(b);
}

export function estimateUsage(messages: any[], r: Pick<StreamResult, "content" | "reasoning" | "toolCalls">): Usage {
  const output = countTextTokens(r.content) + countTextTokens(r.reasoning) + r.toolCalls.reduce((n, t) => n + countTextTokens(t.arguments) + 4, 0);
  return { input: estimatePromptTokens(messages), output, cached: 0, reasoning: countTextTokens(r.reasoning) };
}

/** Replace upstream model names in an error payload so internals don't leak. */
export function scrubUpstreamError(text: string, upstreamModel: string, publicId: string) {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: { message: text.slice(0, 500) || "Upstream rejected the request", type: "invalid_request_error", code: null, param: null } };
  }
  if (typeof json?.error === "string") json = { error: { message: json.error, type: "invalid_request_error", code: null, param: null } };
  if (json?.error?.message && upstreamModel) json.error.message = String(json.error.message).split(upstreamModel).join(publicId);
  return json;
}

/** Dispatch with error logging; returns null after replying when the upstream rejects the request. */
export async function dispatchChat(ctx: CallerContext, model: ModelLean, body: any, signal: AbortSignal, startedAt: number, endpoint: "chat" | "messages" = "chat") {
  // "hi" / "which model are you?" / "thanks": answered from our own templates, no provider call
  const quick = await quickReplyFor(model, body).catch(() => null);
  if (quick) return quick;
  let d: DispatchResult;
  try {
    d = await dispatch({ model, path: "/chat/completions", body: (up) => upstreamChatBody(body, model, up), signal });
  } catch (err) {
    if (err instanceof GatewayError && err.status !== 499) {
      await recordRequest(ctx, { model, endpoint, status: "error", httpStatus: err.status, errorCode: err.code ?? "", errorMessage: err.message, latencyMs: Date.now() - startedAt, stream: Boolean(body.stream) });
    }
    throw err;
  }
  return d;
}

export async function chatCompletions(req: Request, res: Response) {
  const ctx = req.gw!;
  const body = req.body;
  validateChatBody(body);
  const model = await preflight(ctx, body.model, "chat");
  if (hasImageParts(body.messages) && !model.capabilities.includes("vision")) {
    throw new GatewayError(400, `'${model.publicId}' does not support image inputs.`, "invalid_request_error", "vision_not_supported", "messages");
  }

  const stream = body.stream === true;
  const wantUsage = Boolean(body.stream_options?.include_usage);
  const startedAt = Date.now();
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) ac.abort();
  });

  const d = await dispatchChat(ctx, model, body, ac.signal, startedAt);
  const base = { model, endpoint: "chat" as const, candidate: d.candidate, attempts: d.attempts, stream };

  if (d.clientError) {
    const err = scrubUpstreamError(await d.res.text(), d.candidate.upstreamModel, model.publicId);
    await recordRequest(ctx, { ...base, status: "error", httpStatus: d.res.status, errorCode: String(err?.error?.code ?? "upstream_rejected"), errorMessage: err?.error?.message, latencyMs: Date.now() - startedAt });
    res.status(d.res.status).json(err);
    return;
  }

  if (!stream) {
    const json: any = await d.res.json().catch(() => null);
    if (!json) throw new GatewayError(502, "The upstream returned an invalid response.", "server_error", "bad_upstream_response");
    json.model = model.publicId;
    let usage = normalizeUsage(json.usage);
    let estimated = false;
    if (!usage) {
      const msg = json.choices?.[0]?.message ?? {};
      usage = estimateUsage(body.messages, { content: msg.content ?? "", reasoning: msg.reasoning_content ?? "", toolCalls: [] });
      estimated = true;
      json.usage = { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output };
    }
    res.json(json);
    await recordRequest(ctx, { ...base, status: "success", httpStatus: 200, usage, estimated, latencyMs: Date.now() - startedAt, ttftMs: Date.now() - startedAt });
    return;
  }

  res.writeHead(200, sseHeaders());
  res.flushHeaders?.();
  const result = await readChatStream(d.res.body!, {
    startedAt,
    signal: ac.signal,
    onComment: (line) => res.write(`${line}\n\n`),
    onChunk: (chunk) => {
      if (chunk?.error) {
        const msg = typeof chunk.error === "string" ? chunk.error : chunk.error.message;
        res.write(`data: ${JSON.stringify({ error: { message: msg ?? "Upstream error", type: "server_error", code: "upstream_error" } })}\n\n`);
        return;
      }
      chunk.model = model.publicId;
      const usageOnly = (!chunk.choices || chunk.choices.length === 0) && chunk.usage;
      if (!wantUsage) {
        if (usageOnly) return;
        if ("usage" in chunk) delete chunk.usage;
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    },
  });
  if (!result.aborted) {
    res.write("data: [DONE]\n\n");
    res.end();
  }

  const estimated = !result.usage;
  const usage = result.usage ?? estimateUsage(body.messages, result);
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
