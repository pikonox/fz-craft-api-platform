import express, { Router } from "express";
import cors from "cors";
import { ACCESS_RANK, type ModelAccess } from "@nova/shared";
import { env } from "../config/env";
import { imageUpload } from "../middleware/upload";
import { apiKeyAuth, requireScope } from "./context";
import { GatewayError, gatewayErrorHandler } from "./errors";
import { chatCompletions } from "./handlers/chat";
import { countTokens, messages } from "./handlers/messages";
import { embeddings } from "./handlers/embeddings";
import { imageEdits, imageGenerations } from "./handlers/images";
import { getModel, listModels } from "./registry";
import type { ModelLean } from "../db/models";

/** OpenAI-compatible public API mounted at /v1 */
export const v1Router = Router();

v1Router.use(cors({ origin: true, exposedHeaders: ["x-ratelimit-limit-requests", "x-ratelimit-remaining-requests", "x-ratelimit-reset-requests", "retry-after"] }));
v1Router.use(express.json({ limit: "25mb" }));
v1Router.use(apiKeyAuth);

function modelObject(m: ModelLean, access: ModelAccess) {
  return {
    id: m.publicId,
    object: "model",
    created: Math.floor(new Date((m as { createdAt?: Date }).createdAt ?? Date.now()).getTime() / 1000),
    owned_by: m.vendor || env.BRAND_NAME,
    name: m.name,
    type: m.type,
    capabilities: m.capabilities,
    context_length: m.contextLength,
    max_output_tokens: m.maxOutput,
    available_on_your_plan: ACCESS_RANK[m.access as ModelAccess] <= ACCESS_RANK[access],
  };
}

v1Router.get("/models", requireScope("models:read"), async (req, res) => {
  const models = (await listModels()).filter((m) => m.enabled && m.status !== "maintenance").sort((a, b) => a.sort - b.sort);
  // Anthropic SDK clients send anthropic-version and expect Anthropic's list shape
  if (req.headers["anthropic-version"]) {
    const data = models
      .filter((m) => m.type === "chat")
      .map((m) => ({ type: "model", id: m.publicId, display_name: m.name, created_at: new Date((m as { createdAt?: Date }).createdAt ?? Date.now()).toISOString() }));
    res.json({ data, has_more: false, first_id: data[0]?.id ?? null, last_id: data[data.length - 1]?.id ?? null });
    return;
  }
  res.json({ object: "list", data: models.map((m) => modelObject(m, req.gw!.ent.access)) });
});

v1Router.get("/models/:id", requireScope("models:read"), async (req, res) => {
  const m = await getModel(String(req.params.id));
  if (!m || !m.enabled) throw new GatewayError(404, `The model '${req.params.id}' does not exist.`, "invalid_request_error", "model_not_found");
  res.json(modelObject(m, req.gw!.ent.access));
});

v1Router.post("/chat/completions", requireScope("inference"), chatCompletions);
// Anthropic Messages API (Claude Code, Anthropic SDKs) — same key, same models
v1Router.post("/messages", requireScope("inference"), messages);
v1Router.post("/messages/count_tokens", requireScope("inference"), countTokens);
v1Router.post("/embeddings", requireScope("embeddings"), embeddings);
v1Router.post("/images/generations", requireScope("images"), imageGenerations);
v1Router.post("/images/edits", requireScope("images"), imageUpload.single("image"), imageEdits);

v1Router.use((req) => {
  throw new GatewayError(404, `Unknown endpoint: ${req.method} /v1${req.path}`, "invalid_request_error", "unknown_url");
});
v1Router.use(gatewayErrorHandler);
