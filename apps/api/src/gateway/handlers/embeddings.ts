import type { Request, Response } from "express";
import { GatewayError } from "../errors";
import { preflight } from "../context";
import { dispatch } from "../router";
import { normalizeUsage } from "../stream";
import { countTextTokens, recordRequest } from "../usage";
import { scrubUpstreamError } from "./chat";

export async function embeddings(req: Request, res: Response) {
  const ctx = req.gw!;
  const body = req.body ?? {};
  if (body.input === undefined || body.input === null || body.input === "") {
    throw new GatewayError(400, "'input' is required.", "invalid_request_error", "invalid_value", "input");
  }
  const model = await preflight(ctx, body.model, "embedding");
  const startedAt = Date.now();
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) ac.abort();
  });

  let d;
  try {
    d = await dispatch({ model, path: "/embeddings", body: (up) => JSON.stringify({ ...body, model: up }), signal: ac.signal });
  } catch (err) {
    if (err instanceof GatewayError && err.status !== 499) {
      await recordRequest(ctx, { model, endpoint: "embeddings", status: "error", httpStatus: err.status, errorCode: err.code ?? "", errorMessage: err.message, latencyMs: Date.now() - startedAt });
    }
    throw err;
  }

  if (d.clientError) {
    const err = scrubUpstreamError(await d.res.text(), d.candidate.upstreamModel, model.publicId);
    await recordRequest(ctx, { model, endpoint: "embeddings", candidate: d.candidate, status: "error", httpStatus: d.res.status, errorMessage: err?.error?.message, latencyMs: Date.now() - startedAt });
    res.status(d.res.status).json(err);
    return;
  }

  const json: any = await d.res.json();
  json.model = model.publicId;
  let usage = normalizeUsage(json.usage);
  let estimated = false;
  if (!usage) {
    const inputs: string[] = Array.isArray(body.input) ? body.input.filter((x: unknown) => typeof x === "string") : [String(body.input)];
    const input = inputs.reduce((n, s) => n + countTextTokens(s), 0);
    usage = { input, output: 0, cached: 0, reasoning: 0 };
    estimated = true;
    json.usage = { prompt_tokens: input, total_tokens: input };
  }
  res.json(json);
  await recordRequest(ctx, { model, endpoint: "embeddings", candidate: d.candidate, attempts: d.attempts, status: "success", httpStatus: 200, usage, estimated, latencyMs: Date.now() - startedAt });
}
