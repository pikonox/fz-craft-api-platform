import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { logger } from "./logger";

/** Error with an HTTP status that is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "bad_request", details);
export const unauthorized = (msg = "Not signed in") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "Not allowed") => new HttpError(403, msg, "forbidden");
export const notFound = (msg = "Not found") => new HttpError(404, msg, "not_found");
export const conflict = (msg: string) => new HttpError(409, msg, "conflict");

export const notFoundHandler: RequestHandler = (req, _res, next) => next(notFound(`No route for ${req.method} ${req.path}`));

/** Dashboard API errors: { error: { message, code, details } } */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      error: {
        message: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input",
        code: "validation_error",
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
    return;
  }
  // Gateway errors raised from shared code paths (e.g. the playground) use the same shape here
  if (err?.name === "GatewayError" && typeof err.status === "number") {
    for (const [k, v] of Object.entries((err.headers ?? {}) as Record<string, string>)) res.setHeader(k, v);
    res.status(err.status === 499 ? 400 : err.status).json({ error: { message: err.message, code: err.code ?? err.type } });
    return;
  }
  if (err?.name === "MulterError") {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "That file is too large" : "Upload failed";
    res.status(400).json({ error: { message: msg, code: "upload_error" } });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: { message: "Invalid id", code: "bad_request" } });
    return;
  }
  if ((err as { code?: number })?.code === 11000) {
    res.status(409).json({ error: { message: "Already exists", code: "conflict" } });
    return;
  }
  if ((err as { type?: string })?.type === "entity.too.large") {
    res.status(413).json({ error: { message: "Request body too large", code: "too_large" } });
    return;
  }
  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ error: { message: "Something went wrong", code: "internal_error" } });
};
