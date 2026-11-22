import { encode } from "gpt-tokenizer";
import { tokenCostMicros } from "@nova/shared";
import { ApiKey, RequestLog, UsageRollup, type ModelLean } from "../db/models";
import { consumeTokens } from "../services/billing";
import { logger } from "../lib/logger";
import { emitLocalLog } from "../services/analytics";
import type { CallerContext } from "./context";
import type { Candidate } from "./router";
import type { Usage } from "./stream";

/**
 * How much a cached input token counts against the plan, relative to a normal input token.
 * Our upstream (FreeModel.in) bills cached input in full (measured with `pnpm calibrate`,
 * 2026-11-22), so customers' plans count it in full too and drain at the same speed as ours.
 */
export const CACHED_TOKEN_WEIGHT = 1;

export function billedTokens(u: Usage): number {
  const uncached = Math.max(0, u.input - u.cached);
  return uncached + Math.ceil(u.cached * CACHED_TOKEN_WEIGHT) + u.output;
}

export function costAtModelPrice(model: Pick<ModelLean, "pricing">, u: Usage): number {
  const p = model.pricing ?? ({} as ModelLean["pricing"]);
  const uncached = Math.max(0, u.input - u.cached);
  const micros =
    tokenCostMicros(uncached, p?.inputPer1M ?? 0) +
    tokenCostMicros(u.cached, (p?.cachedInputPer1M || p?.inputPer1M) ?? 0) +
    tokenCostMicros(u.output, p?.outputPer1M ?? 0);
  return Math.round(micros * 100) / 100;
}

export function countTextTokens(text: string): number {
  if (!text) return 0;
  try {
    // Very large inputs: approximate instead of tokenising everything
    if (text.length > 400_000) return Math.ceil(text.length / 4);
    return encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

/** Rough prompt token count for OpenAI-style messages when the upstream reports no usage. */
export function estimatePromptTokens(messages: any[]): number {
  let total = 3;
  for (const m of messages ?? []) {
    total += 4;
    if (typeof m?.content === "string") total += countTextTokens(m.content);
    else if (Array.isArray(m?.content)) {
      for (const part of m.content) {
        if (part?.type === "text") total += countTextTokens(part.text ?? "");
        else if (part?.type === "image_url") total += 765;
      }
    }
    if (m?.tool_calls) total += countTextTokens(JSON.stringify(m.tool_calls));
  }
  return total;
}

const hourBucket = (d = new Date()) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);

export type RecordInput = {
  model: ModelLean | { publicId: string; pricing?: ModelLean["pricing"] };
  endpoint: "chat" | "messages" | "embeddings" | "images" | "image_edits";
  candidate?: Candidate | null;
  status: "success" | "error";
  httpStatus: number;
  errorCode?: string;
  errorMessage?: string;
  usage?: Usage | null;
  estimated?: boolean;
  images?: number;
  /** For images: amount actually charged. For tokens: computed at model price. */
  costMicros?: number;
  latencyMs: number;
  ttftMs?: number | null;
  stream?: boolean;
  attempts?: number;
};

/** Persist a request: log row, hourly rollup, key counters and token quota. Never throws. */
export async function recordRequest(ctx: CallerContext, r: RecordInput) {
  try {
    const usage = r.usage ?? { input: 0, output: 0, cached: 0, reasoning: 0 };
    const billed = r.endpoint === "images" || r.endpoint === "image_edits" ? 0 : billedTokens(usage);
    const cost = r.costMicros ?? ("pricing" in r.model && r.model.pricing ? costAtModelPrice(r.model as ModelLean, usage) : 0);
    const providerId = r.candidate ? r.candidate.provider._id : null;
    const isError = r.status === "error";

    const [logDoc] = await Promise.all([
      RequestLog.create({
        userId: ctx.user._id,
        apiKeyId: ctx.apiKey?._id ?? null,
        model: r.model.publicId,
        endpoint: r.endpoint,
        source: ctx.source,
        providerId,
        providerName: r.candidate?.provider.name ?? "",
        providerKeyId: r.candidate ? r.candidate.key.id : null,
        upstreamModel: r.candidate?.upstreamModel ?? "",
        status: r.status,
        httpStatus: r.httpStatus,
        errorCode: r.errorCode ?? "",
        errorMessage: (r.errorMessage ?? "").slice(0, 500),
        inputTokens: usage.input,
        outputTokens: usage.output,
        cachedTokens: usage.cached,
        reasoningTokens: usage.reasoning,
        billedTokens: billed,
        images: r.images ?? 0,
        costMicros: cost,
        latencyMs: Math.round(r.latencyMs),
        ttftMs: r.ttftMs ?? null,
        stream: Boolean(r.stream),
        attempts: r.attempts ?? 1,
        estimated: Boolean(r.estimated),
        ip: ctx.ip ?? "",
        userAgent: (ctx.userAgent ?? "").slice(0, 200),
      }),
      UsageRollup.updateOne(
        { userId: ctx.user._id, bucket: hourBucket(), apiKeyId: ctx.apiKey?._id ?? null, model: r.model.publicId, providerId, source: ctx.source },
        {
          $inc: {
            requests: 1,
            errorCount: isError ? 1 : 0,
            inputTokens: usage.input,
            outputTokens: usage.output,
            cachedTokens: usage.cached,
            reasoningTokens: usage.reasoning,
            billedTokens: billed,
            images: r.images ?? 0,
            costMicros: cost,
            latencyMsSum: Math.round(r.latencyMs),
          },
        },
        { upsert: true },
      ),
      ctx.apiKey
        ? ApiKey.updateOne({ _id: ctx.apiKey._id }, { $inc: { requests: 1, tokensUsed: billed, spendMicros: cost }, $set: { lastUsedAt: new Date() } })
        : Promise.resolve(),
      billed > 0 ? consumeTokens(ctx.user._id, billed) : Promise.resolve(),
    ]);

    emitLocalLog(logDoc.toObject());

    if (ctx.apiKey) {
      // keep the cached key's counters roughly current for cap checks
      ctx.apiKey.requests = (ctx.apiKey.requests ?? 0) + 1;
      ctx.apiKey.tokensUsed = (ctx.apiKey.tokensUsed ?? 0) + billed;
      ctx.apiKey.spendMicros = (ctx.apiKey.spendMicros ?? 0) + cost;
    }
  } catch (err) {
    logger.error({ err }, "failed to record request");
  }
}
