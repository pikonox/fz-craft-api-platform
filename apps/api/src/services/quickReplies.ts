import { randomBytes } from "node:crypto";
import { env } from "../config/env";
import type { ModelLean } from "../db/models";
import type { Candidate, DispatchResult } from "../gateway/router";
import { countTextTokens } from "../gateway/usage";
import { QUICK_REPLY_DEFAULTS, getSetting, type QuickIntent, type QuickReplySettings } from "./settings";

/**
 * Quick replies: when a chat message is ONLY a greeting, "which model are you?", "how are you?" or
 * "thanks", answer instantly from the admin-editable templates instead of calling the provider.
 *
 * Deliberately strict, so real questions always reach the model:
 *  - every word must belong to the intent's small vocabulary ("hi, which model is best for code?" → model)
 *  - skipped when the request has a system/developer prompt (apps and coding tools set their own
 *    persona), tools, JSON mode, several choices, or images/files in the last message.
 */

// ── Matching ────────────────────────────────────────────

/** Words that can sit around any quick message without changing its meaning. */
const FILLERS = new Set([
  "there", "bro", "brother", "buddy", "dear", "sir", "maam", "madam", "mate", "friend", "friends", "guys", "all", "everyone", "team",
  "bot", "assistant", "chatbot", "ji", "jee", "yaar", "please", "plz", "pls", "again", "ok", "okay", "oh", "so", "and", "dude", "man", "boss",
]);

const GREETING = /^(?:h+i+|h+y+|h+e+l+o+w?|h+l+o+|hlw|h+e+y+|hai|heya|hiya|yo+|howdy|greetings|hola|bonjour|namaste|sup|wassup|whatsup)$/;
const SALAM = /^(?:a?s+a?la+m+(?:u|o)?(?:a?la+[iy]?ku+m)?|salaam|aoa)$/;
const SALAM_TAIL = /^(?:o|u|wa|w|a?la+[iy]?ku+m|alaykum|alaikom|elaikum|alikum|alykum)$/;

const IDENTITY_WORDS = new Set([
  "which", "what", "wich", "wat", "who", "whos", "whats", "model", "models", "llm", "ai", "version", "engine", "are", "r", "is", "am", "i",
  "you", "u", "ya", "yourself", "this", "it", "that", "using", "use", "running", "run", "based", "on", "talking", "chatting", "speaking",
  "to", "with", "your", "ur", "name", "made", "make", "created", "create", "built", "build", "developed", "develop", "trained", "train",
  "owns", "own", "company", "by", "behind", "creator", "developer", "owner", "maker", "founder", "exactly", "actually", "really", "a", "an",
  "the", "human", "real", "person", "introduce", "tell", "me", "about", "current", "here", "now", "of", "from", "btw",
  "chatgpt", "gpt", "openai", "claude", "anthropic", "gemini", "google", "deepseek", "glm", "zhipu", "llama", "meta", "grok", "qwen", "mistral",
]);
const BRAND_WORDS = ["chatgpt", "gpt", "openai", "claude", "anthropic", "gemini", "google", "deepseek", "glm", "llama", "grok", "qwen", "mistral"];

const HOW_WORDS = new Set([
  "how", "hows", "are", "r", "you", "u", "ya", "doing", "today", "is", "it", "going", "do", "things", "everything", "life", "well",
  "kya", "haal", "hal", "hai", "kaise", "kese", "kesy", "ho", "aap", "ap", "tum", "sab", "theek", "thik",
]);

const THANKS_ANCHORS = ["thanks", "thank", "thanku", "thankyou", "thnx", "thx", "thnks", "ty", "tysm", "tyvm", "shukriya", "shukria", "jazakallah", "jazak", "appreciate", "appreciated"];
const THANKS_WORDS = new Set([
  ...THANKS_ANCHORS, "you", "u", "so", "much", "very", "a", "lot", "many", "allah", "khair", "it", "cool", "nice", "great", "awesome", "perfect", "got",
]);

const has = (set: Set<string>, ...words: string[]) => words.some((w) => set.has(w));

function identityAnchor(t: Set<string>) {
  const you = has(t, "you", "u", "yourself");
  return (
    has(t, "model", "models", "llm", "engine", "version") ||
    (has(t, "who", "whos") && you) ||
    (has(t, "what", "whats") && has(t, "are", "r") && you) ||
    (has(t, "your", "ur") && has(t, "name", "creator", "developer", "owner", "maker", "founder")) ||
    (has(t, "made", "created", "built", "developed", "trained", "make", "create", "build", "develop", "train", "owns", "behind") && (you || t.has("this"))) ||
    (has(t, "are", "r") && you && has(t, ...BRAND_WORDS, "ai", "human", "real", "person")) ||
    (t.has("is") && has(t, "this", "it") && has(t, ...BRAND_WORDS)) ||
    (has(t, "introduce", "about") && t.has("yourself"))
  );
}

const howAnchor = (t: Set<string>) =>
  (has(t, "how", "hows") && has(t, "you", "u", "ya", "going", "things", "everything", "life", "doing")) || has(t, "haal", "hal") || (has(t, "kaise", "kese", "kesy") && t.has("ho"));

export function normalizeMessage(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type QuickMatch = { intent: QuickIntent; greeted: "greeting" | "salam" | null };

/** Recognises messages that are only a greeting / identity question / "how are you" / thanks. */
export function detectQuickIntent(raw: string): QuickMatch | null {
  if (!raw || raw.length > 120) return null;
  const tokens = normalizeMessage(raw).split(" ").filter(Boolean);
  if (!tokens.length || tokens.length > 14) return null;

  // Leading greetings and fillers: "hi", "hlo bro", "good morning", "assalam o alaikum"
  let greeted: QuickMatch["greeted"] = null;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const next = tokens[i + 1] ?? "";
    if (FILLERS.has(t)) i++;
    else if (GREETING.test(t)) (greeted ??= "greeting"), i++;
    else if (t === "good" && ["morning", "afternoon", "evening", "day"].includes(next)) (greeted ??= "greeting"), (i += 2);
    else if (t === "whats" && next === "up") (greeted ??= "greeting"), (i += 2);
    else if (t === "as" && SALAM.test(next)) i++;
    else if (SALAM.test(t)) {
      greeted = "salam";
      i++;
      while (i < tokens.length && SALAM_TAIL.test(tokens[i])) i++;
    } else break;
  }

  const rest = tokens.slice(i);
  if (!rest.length) return greeted ? { intent: greeted, greeted } : null;
  const set = new Set(rest);
  const only = (vocab: Set<string>) => rest.every((w) => vocab.has(w) || FILLERS.has(w));
  if (only(IDENTITY_WORDS) && identityAnchor(set)) return { intent: "identity", greeted };
  if (only(HOW_WORDS) && howAnchor(set)) return { intent: "howAreYou", greeted };
  if (only(THANKS_WORDS) && has(set, ...THANKS_ANCHORS)) return { intent: "thanks", greeted };
  return null;
}

// ── When it's safe to answer ────────────────────────────

/** Plain text of a message, or null when it carries images, files or anything that isn't text. */
function textOf(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  if (content.some((p) => p?.type !== "text")) return null;
  return content.map((p) => String(p.text ?? "")).join(" ");
}

/** The user's last message when the request is a plain chat turn we may answer ourselves. */
export function quickReplyCandidate(body: any): string | null {
  const messages: any[] = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return null;
  if (body.tools?.length || body.functions?.length) return null;
  if (body.response_format && body.response_format.type !== "text") return null;
  if (typeof body.n === "number" && body.n > 1) return null;
  if (messages.some((m) => m?.role === "system" || m?.role === "developer")) return null;
  const last = messages[messages.length - 1];
  if (last?.role !== "user") return null;
  return textOf(last.content);
}

// ── Answer ──────────────────────────────────────────────

const GREETING_PREFIX = { greeting: "Hello! 👋 ", salam: "Wa Alaikum Assalam! 👋 " } as const;

export function composeQuickReply(match: QuickMatch, settings: QuickReplySettings, model: Pick<ModelLean, "name" | "vendor">): string | null {
  const options = (settings[match.intent] ?? []).map((s) => s.trim()).filter(Boolean);
  if (!options.length) return null;
  let text = options[Math.floor(Math.random() * options.length)]
    .replaceAll("{model}", model.name)
    .replaceAll("{vendor}", model.vendor || model.name)
    .replaceAll("{brand}", env.BRAND_NAME);
  // "hi, which model are you?" → greet back before answering (unless the answer already greets)
  if (match.greeted && match.intent !== match.greeted && !/^(hi|hello|hey|wa alaikum|salam)/i.test(text)) text = GREETING_PREFIX[match.greeted] + text;
  return text;
}

/** Stand-in for a provider in logs and usage: shows as provider "Quick reply". */
const QUICK_CANDIDATE = {
  provider: { _id: null, name: "Quick reply" },
  key: { id: null },
  upstreamModel: "quick-reply",
  priority: 0,
  weight: 0,
} as unknown as Candidate;

/** An OpenAI-shaped response (JSON or SSE stream) carrying `text`, so every handler treats it like a provider reply. */
export function quickReplyResponse(model: Pick<ModelLean, "publicId">, body: any, text: string, userText: string): DispatchResult {
  const id = `chatcmpl-qr${randomBytes(9).toString("hex")}`;
  const created = Math.floor(Date.now() / 1000);
  // Real (tiny) counts: the user's message and the reply — never the whole conversation
  const usage = { prompt_tokens: countTextTokens(userText) + 4, completion_tokens: countTextTokens(text) };
  const usageBlock = { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens };
  const base = { id, created, model: model.publicId };

  if (!body?.stream) {
    const json = {
      ...base,
      object: "chat.completion",
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
      usage: usageBlock,
    };
    return { res: new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } }), candidate: QUICK_CANDIDATE, attempts: 0, clientError: false };
  }

  const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
    `data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  // A few words per chunk with a short pause, so it streams like a normal reply
  const words = text.match(/\S+\s*/g) ?? [text];
  const pieces: string[] = [];
  for (let w = 0; w < words.length; w += 3) pieces.push(words.slice(w, w + 3).join(""));
  const events = [
    chunk({ role: "assistant", content: "" }),
    ...pieces.map((p) => chunk({ content: p })),
    chunk({}, "stop"),
    `data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [], usage: usageBlock })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const encoder = new TextEncoder();
  let n = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled) return;
      if (n >= events.length) return controller.close();
      if (n > 0 && n < events.length - 2) await new Promise((r) => setTimeout(r, 18));
      controller.enqueue(encoder.encode(events[n++]));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { res: new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }), candidate: QUICK_CANDIDATE, attempts: 0, clientError: false };
}

/** A ready answer for this request, or null to send it to the provider. */
export async function quickReplyFor(model: ModelLean, body: any): Promise<DispatchResult | null> {
  const userText = quickReplyCandidate(body);
  if (userText === null) return null;
  const match = detectQuickIntent(userText);
  if (!match) return null;
  const stored = await getSetting("quickReplies");
  const settings: QuickReplySettings = { ...QUICK_REPLY_DEFAULTS, ...(stored ?? {}) };
  if (!settings.enabled) return null;
  const text = composeQuickReply(match, settings, model);
  return text ? quickReplyResponse(model, body, text, userText) : null;
}
