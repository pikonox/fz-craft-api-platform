import type { ErrorRequestHandler, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors";
import { logger } from "../lib/logger";
import { anthropicError } from "./anthropic";

/** OpenAI-compatible error: { error: { message, type, param, code } } */
export class GatewayError extends Error {
  constructor(
    public status: number,
    message: string,
    public type: string = "invalid_request_error",
    public code: string | null = null,
    public param: string | null = null,
    public headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function sendGatewayError(res: Response, err: GatewayError, format: "openai" | "anthropic" = "openai") {
  for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
  if (format === "anthropic") {
    res.status(err.status).json(anthropicError(err.status, err.message));
    return;
  }
  res.status(err.status).json({ error: { message: err.message, type: err.type, param: err.param, code: err.code } });
}

/** Anthropic Messages routes (and Anthropic SDK clients) get Anthropic-shaped errors. */
const wantsAnthropic = (req: Request) => req.path.startsWith("/messages") || Boolean(req.headers["anthropic-version"]);

export const gatewayErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const fmt = wantsAnthropic(req) ? "anthropic" : "openai";
  if (res.headersSent) {
    try {
      res.end();
    } catch {
      /* noop */
    }
    return;
  }
  if (err instanceof GatewayError) return sendGatewayError(res, err, fmt);
  if (err instanceof HttpError) {
    const type = err.status === 402 || err.status === 429 ? "insufficient_quota" : "invalid_request_error";
    return sendGatewayError(res, new GatewayError(err.status, err.message, type, err.code), fmt);
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return sendGatewayError(res, new GatewayError(400, `${issue?.path.join(".") || "body"}: ${issue?.message}`, "invalid_request_error", "invalid_value", issue?.path.join(".") ?? null), fmt);
  }
  if ((err as { type?: string })?.type === "entity.parse.failed") {
    return sendGatewayError(res, new GatewayError(400, "We could not parse the JSON body of your request.", "invalid_request_error", "invalid_json"), fmt);
  }
  if ((err as { type?: string })?.type === "entity.too.large") {
    return sendGatewayError(res, new GatewayError(413, "Request body too large.", "invalid_request_error", "request_too_large"), fmt);
  }
  logger.error({ err }, "gateway error");
  sendGatewayError(res, new GatewayError(500, "The server had an error while processing your request.", "server_error", "internal_error"), fmt);
};
