import type { ModelAccess, ModelCapability, ModelStatus } from "@nova/shared";
import { usdToMicros } from "@nova/shared";

/**
 * The chat model catalog loaded by `pnpm seed`.
 * Prices are what customers see as "model price" (USD per 1M tokens).
 * Edit here, then run `SYNC_MODELS=1 pnpm seed` to push changes to an existing database.
 */

type Caps = string; // letters: R reasoning · V vision · T tools · J json
type Row = [id: string, name: string, vendor: string, inUsd: number, outUsd: number, context: number, caps: Caps, description: string];

const K = 1_000;
const M = 1_000_000;

const ACTIVE: Row[] = [
  // Free models (see FREE_MODELS below)
  ["deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "DeepSeek", 0.056, 0.112, M, "RVTJ", "DeepSeek's fastest reasoning model with a 1M-token window at the lowest price in the catalog. A great default for chat, code and agents."],
  ["glm-5.3", "GLM-5.3", "Zhipu", 1.36, 1.36, M, "RTJ", "Zhipu's latest full model with strong reasoning, coding and agent skills, and a 1M-token window."],
  // Paid models (need a plan or day pass)
  ["deepseek-v4-flash-0731", "DeepSeek V4 Flash 0731", "DeepSeek", 0.115, 0.115, M, "RTJ", "Earlier DeepSeek Flash snapshot. Very affordable, with dependable reasoning and tool use."],
  ["glm-5.3-flash", "GLM-5.3 Flash", "Zhipu", 0.08, 0.16, M, "RTJ", "Zhipu's quick bilingual (English and Chinese) model with 1M context and fast tool calls."],
  ["qwen3.8-27b", "Qwen3.8 27B", "Alibaba", 0.575, 0.575, 256 * K, "RTJ", "Compact open-weights Qwen. Efficient for everyday reasoning and coding."],
  ["seed-2.1-turbo", "Seed 2.1 Turbo", "ByteDance", 0.92, 0.92, 256 * K, "RVTJ", "ByteDance Seed tuned for speed. Handles images, tools and code at a low price."],
  ["gemini-3.7-flash", "Gemini 3.7 Flash", "Google", 1.24, 1.24, M, "RVTJ", "Google's newest Flash model. Very fast output with strong reasoning and vision."],
  ["qwen3.7-max", "Qwen3.7 Max", "Alibaba", 1.76, 1.76, M, "RVTJ", "Alibaba's top Qwen tier for demanding reasoning and coding, with vision and 1M context."],
  ["matilda-cerulean-i", "Matilda Cerulean I", "Other", 1.0, 3.0, 250 * K, "RTJ", "Low-latency engine specialised in systems and infrastructure coding."],
  ["deepseek-v4-pro-max", "DeepSeek V4 Pro Max", "DeepSeek", 2.05, 2.05, M, "RTJ", "DeepSeek's most capable open model for hard reasoning and large codebases."],
  ["gemini-3.6-flash", "Gemini 3.6 Flash", "Google", 2.5, 2.5, M, "RVTJ", "Previous-generation Gemini Flash. Quick responses with good reasoning and vision."],
  ["grok-4.6", "Grok 4.6", "xAI", 2.81, 2.81, 488 * K, "RVTJ", "xAI's latest Grok, with better reasoning and coding than 4.5."],
  ["gpt-5.6-terra", "GPT-5.6 Terra", "OpenAI", 3.58, 3.58, M, "RVTJ", "OpenAI's high-end model at a mid-range price. Strong reasoning, coding and vision."],
  ["gemini-3.1-pro", "Gemini 3.1 Pro", "Google", 4.47, 4.47, M, "RVTJ", "Google's Pro model for complex reasoning and coding over long documents."],
  ["claude-sonnet-5-5", "Claude Sonnet 5.5", "Anthropic", 3.0, 6.0, 488 * K, "RVTJ", "Anthropic's balanced hybrid-reasoning model. Fast enough for agents, smart enough for real refactors."],
  ["kimi-k3", "Kimi K3", "Moonshot", 4.98, 4.98, M, "RVTJ", "Moonshot's open flagship. Strong long-context reasoning and coding."],
  ["codex-auto-review", "Codex Auto Review", "Other", 2.0, 8.0, 250 * K, "RTJ", "Tuned for automated code review and quality checks across a repository."],
  ["claude-opus-4.6", "Claude Opus 4.6", "Anthropic", 8.3, 8.3, M, "RVTJ", "Opus-class Claude for reliable reasoning and agentic work."],
  ["claude-opus-4.7", "Claude Opus 4.7", "Anthropic", 8.3, 8.3, M, "RVTJ", "Opus-class Claude with strong coding and reasoning."],
  ["claude-opus-4.8", "Claude Opus 4.8", "Anthropic", 8.3, 8.3, M, "RVTJ", "Opus-class Claude with dependable reasoning and coding."],
  ["claude-opus-5", "Claude Opus 5", "Anthropic", 8.3, 8.3, M, "RVTJ", "Opus 5 for long, careful reasoning and agentic tasks."],
  ["gpt-5.5", "GPT-5.5", "OpenAI", 8.95, 8.95, M, "RVTJ", "OpenAI's capable all-rounder for reasoning, coding and vision."],
  ["gpt-5.5-pro", "GPT-5.5 Pro", "OpenAI", 8.95, 8.95, M, "RVTJ", "Pro tier of GPT-5.5 with deeper reasoning on hard problems."],
  ["gpt-5.6-sol", "GPT-5.6 Sol", "OpenAI", 8.95, 8.95, M, "RVTJ", "OpenAI flagship for top-tier reasoning, coding and agent workflows."],
  ["claude-opus-4-5", "Claude Opus 4.5", "Anthropic", 8.0, 16.0, 488 * K, "RVTJ", "Opus 4.5 for in-depth technical analysis and research."],
  ["claude-opus-5-5", "Claude Opus 5.5", "Anthropic", 8.3, 16.61, M, "RVTJ", "Anthropic's frontier model for coding and reasoning, with adaptive thinking."],
  ["gpt-6-astra", "GPT-6 Astra", "OpenAI", 8.95, 17.89, M, "RVTJ", "OpenAI frontier model for complex, multi-step agent work with strong vision."],
  ["gpt-6.1-sol", "GPT-6.1 Sol", "OpenAI", 8.95, 17.89, 488 * K, "RVTJ", "High-throughput GPT-6.1 for autonomous systems and multimodal logic."],
  ["claude-fable-5", "Claude Fable 5", "Anthropic", 16.61, 16.61, M, "RVTJ", "Anthropic's premium model. Outstanding coding and reasoning."],
  ["claude-fable-5-1", "Claude Fable 5.1", "Anthropic", 15.0, 30.0, M, "RVTJ", "Long-horizon Claude for autonomous agents and deep research."],
];

const MAINTENANCE: Row[] = [
  ["mimo-v2.6-flash", "MiMo V2.6 Flash", "Xiaomi", 0.04, 0.08, M, "RVTJ", "Xiaomi's fast multimodal reasoning model with a 1M window."],
  ["mimo-v2.6-pro", "MiMo V2.6 Pro", "Xiaomi", 0.09, 0.18, M, "RVTJ", "Xiaomi's high-capacity vision and reasoning model."],
  ["gpt-6-luna", "GPT-6 Luna", "OpenAI", 0.1, 0.2, M, "RVTJ", "Fast GPT-6 tier for conversational and reasoning workloads."],
  ["gemma-2-2b", "Gemma 2 2B", "Google", 0.115, 0.23, 8 * K, "J", "Google's lightweight open model for simple, high-volume tasks."],
  ["gpt-5.6-luna", "GPT-5.6 Luna", "OpenAI", 0.356, 0.356, M, "RVTJ", "Efficient GPT-5.6 with strong reasoning at a low price."],
  ["deepseek-v4-pro-0813", "DeepSeek V4 Pro 0813", "DeepSeek", 0.552, 0.552, M, "RTJ", "DeepSeek Pro snapshot with excellent reasoning and coding."],
  ["claude-haiku-5.5", "Claude Haiku 5.5", "Anthropic", 0.8, 0.8, M, "RVTJ", "Anthropic's fastest Claude. Instant responses and efficient coding."],
  ["matilda-flashflight-i", "Matilda Flashflight I", "Other", 0.5, 1.5, 125 * K, "RTJ", "High-throughput engine for lightweight agent steps."],
  ["seed-2.1-pro", "Seed 2.1 Pro", "ByteDance", 1.15, 1.15, 256 * K, "RVTJ", "ByteDance Seed Pro for stronger reasoning and coding."],
  ["kimi-k2.6", "Kimi K2.6", "Moonshot", 1.22, 1.22, M, "RVTJ", "Moonshot open model with strong reasoning and coding."],
  ["glm-5.2", "GLM-5.2", "Zhipu", 1.36, 1.36, M, "RVTJ", "Zhipu open model with good reasoning and coding."],
  ["qwen3.8-max", "Qwen3.8 Max", "Alibaba", 1.76, 1.76, M, "RVTJ", "Alibaba's flagship open Qwen with strong all-round ability."],
  ["muse-spark-1.1", "Muse Spark 1.1", "Muse", 1.82, 1.82, M, "RVTJ", "Meta's Muse Spark series. Fast and capable with strong reasoning."],
  ["grok-4.5", "Grok 4.5", "xAI", 2.81, 2.81, 488 * K, "RVTJ", "Previous Grok with strong reasoning and agent skills."],
  ["claude-sonnet-5", "Claude Sonnet 5", "Anthropic", 3.32, 3.32, M, "RVTJ", "Balanced Claude for coding and reasoning at a lower cost."],
  ["claude-mythos-preview", "Claude Mythos Preview", "Anthropic", 8.3, 8.3, M, "RVTJ", "Preview of Anthropic's next-generation model with cutting-edge reasoning."],
];

/** Shown with a "Featured" badge. */
const FEATURED = new Set(["deepseek-v4.1-flash", "claude-sonnet-5-5", "gpt-5.5", "gemini-3.1-pro", "kimi-k3"]);

/**
 * The only models a Free account can use (its 1M free tokens work here). Everything else needs a
 * paid plan or day pass. Each one is served by the free-tier provider (FREE_UPSTREAM_* in .env)
 * under the model id on the right.
 */
export const FREE_MODELS: Record<string, string> = {
  "deepseek-v4.1-flash": "deepseek-v4.1-flash",
  "glm-5.3": "glm-5.3",
};

const CAP: Record<string, ModelCapability> = { R: "reasoning", V: "vision", T: "tools", J: "json" };

export type CatalogModel = {
  publicId: string;
  name: string;
  vendor: string;
  type: "chat";
  description: string;
  capabilities: ModelCapability[];
  contextLength: number;
  maxOutput: number;
  access: ModelAccess;
  status: ModelStatus;
  featured: boolean;
  sort: number;
  pricing: { inputPer1M: number; outputPer1M: number };
};

function toModel([publicId, name, vendor, inUsd, outUsd, context, caps, description]: Row, status: ModelStatus, sort: number): CatalogModel {
  return {
    publicId,
    name,
    vendor,
    type: "chat",
    description,
    capabilities: [...[...caps].map((c) => CAP[c]), "streaming"],
    contextLength: context,
    maxOutput: context >= M ? 65_536 : context >= 200 * K ? 32_768 : context >= 100 * K ? 16_384 : 4_096,
    access: publicId in FREE_MODELS ? "free" : "paid",
    status,
    featured: FEATURED.has(publicId),
    sort,
    pricing: { inputPer1M: usdToMicros(inUsd), outputPer1M: usdToMicros(outUsd) },
  };
}

/** Active models first (free ones, then cheapest first), then the ones under maintenance. */
export const CHAT_CATALOG: CatalogModel[] = [
  ...ACTIVE.map((r, i) => toModel(r, "active", i + 1)),
  ...MAINTENANCE.map((r, i) => toModel(r, "maintenance", 100 + i)),
];

/** Removed models: deleted from the database by `SYNC_MODELS=1 pnpm seed`. */
// sunburst-lite: not offered by FreeModel (it only has sunburst-2.5)
export const RETIRED_MODEL_IDS = ["qwen3-coder-plus", "llama-4-maverick", "fz-r1", "minimax-m2.7", "sunburst-lite"];
