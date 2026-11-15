import { Router, type Request, type Response } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { Conversation, Message, type MessageLean, type ModelLean } from "../db/models";
import { badRequest, notFound } from "../lib/errors";
import { me, requireAuth } from "../middleware/auth";
import { attachmentUpload, IMAGE_MIME } from "../middleware/upload";
import { getEntitlement } from "../services/billing";
import { fileUrl, getFile, newKey, putFile } from "../services/storage";
import { searchEnabled, webSearch } from "../services/search";
import { getSetting } from "../services/settings";
import { GatewayError } from "../gateway/errors";
import { preflight, type CallerContext } from "../gateway/context";
import { rateLimiter } from "../gateway/ratelimit";
import { dispatch } from "../gateway/router";
import { listModels } from "../gateway/registry";
import { readChatStream, sseHeaders, type Usage } from "../gateway/stream";
import { recordRequest } from "../gateway/usage";
import { dispatchChat, estimateUsage, scrubUpstreamError } from "../gateway/handlers/chat";
import { detectQuickIntent } from "../services/quickReplies";
import { logger } from "../lib/logger";

export const playgroundRouter = Router();
playgroundRouter.use(requireAuth);

// ── Conversations ───────────────────────────────────────

const serializeConv = (c: any) => ({
  id: String(c._id),
  title: c.title,
  model: c.model,
  pinned: c.pinned,
  params: c.params,
  currentLeafId: c.currentLeafId ? String(c.currentLeafId) : null,
  lastMessageAt: c.lastMessageAt,
  createdAt: c.createdAt,
});

const serializeMsg = (m: any) => ({
  id: String(m._id),
  parentId: m.parentId ? String(m.parentId) : null,
  role: m.role,
  content: m.content,
  attachments: (m.attachments ?? []).map((a: any) => ({ kind: a.kind, name: a.name, mime: a.mime, size: a.size, url: a.url, key: a.key })),
  reasoning: m.reasoning,
  reasoningMs: m.reasoningMs,
  toolCalls: m.toolCalls ?? [],
  model: m.model,
  usage: m.usage,
  latencyMs: m.latencyMs,
  ttftMs: m.ttftMs,
  status: m.status,
  error: m.error,
  feedback: m.feedback,
  createdAt: m.createdAt,
});

playgroundRouter.get("/config", async (_req, res) => {
  res.json({ webSearch: searchEnabled() });
});

playgroundRouter.get("/conversations", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const filter: Record<string, unknown> = { userId: me(req)._id };
  if (q) filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const list = await Conversation.find(filter).sort({ pinned: -1, lastMessageAt: -1 }).limit(300).lean();
  res.json({ conversations: list.map(serializeConv) });
});

playgroundRouter.get("/conversations/:id", async (req, res) => {
  const conv = await Conversation.findOne({ _id: req.params.id, userId: me(req)._id }).lean();
  if (!conv) throw notFound("Conversation not found");
  const messages = await Message.find({ conversationId: conv._id }).sort({ createdAt: 1 }).lean();
  res.json({ conversation: serializeConv(conv), messages: messages.map(serializeMsg) });
});

const paramsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(16).max(200_000).optional(),
  topP: z.number().min(0).max(1).optional(),
  system: z.string().max(20_000).optional(),
  reasoningEffort: z.enum(["", "low", "medium", "high"]).optional(),
  jsonMode: z.boolean().optional(),
  webSearch: z.boolean().optional(),
});

playgroundRouter.patch("/conversations/:id", async (req, res) => {
  const body = z
    .object({ title: z.string().trim().min(1).max(120).optional(), pinned: z.boolean().optional(), model: z.string().max(100).optional(), params: paramsSchema.optional(), currentLeafId: z.string().optional() })
    .parse(req.body);
  const conv = await Conversation.findOne({ _id: req.params.id, userId: me(req)._id });
  if (!conv) throw notFound("Conversation not found");
  if (body.title !== undefined) conv.title = body.title;
  if (body.pinned !== undefined) conv.pinned = body.pinned;
  if (body.model !== undefined) conv.set("model", body.model);
  if (body.params) for (const [k, v] of Object.entries(body.params)) conv.set(`params.${k}`, v);
  if (body.currentLeafId) {
    if (!(await Message.exists({ _id: body.currentLeafId, conversationId: conv._id }))) throw badRequest("Unknown message");
    conv.currentLeafId = new Types.ObjectId(body.currentLeafId);
  }
  await conv.save();
  res.json({ conversation: serializeConv(conv.toObject()) });
});

playgroundRouter.delete("/conversations/:id", async (req, res) => {
  const conv = await Conversation.findOneAndDelete({ _id: req.params.id, userId: me(req)._id });
  if (conv) await Message.deleteMany({ conversationId: conv._id });
  res.json({ ok: true });
});

playgroundRouter.delete("/conversations", async (req, res) => {
  const userId = me(req)._id;
  await Promise.all([Conversation.deleteMany({ userId }), Message.deleteMany({ userId })]);
  res.json({ ok: true });
});

playgroundRouter.delete("/messages/:id", async (req, res) => {
  const msg = await Message.findOne({ _id: req.params.id, userId: me(req)._id }).lean();
  if (!msg) throw notFound("Message not found");
  const all = await Message.find({ conversationId: msg.conversationId }).select("_id parentId").lean();
  const doomed = new Set([String(msg._id)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of all) if (m.parentId && doomed.has(String(m.parentId)) && !doomed.has(String(m._id))) {
      doomed.add(String(m._id));
      grew = true;
    }
  }
  await Message.deleteMany({ _id: { $in: [...doomed] } });
  const conv = await Conversation.findById(msg.conversationId);
  if (conv && conv.currentLeafId && doomed.has(String(conv.currentLeafId))) {
    conv.currentLeafId = msg.parentId ?? null;
    await conv.save();
  }
  res.json({ ok: true, deleted: [...doomed], currentLeafId: conv?.currentLeafId ? String(conv.currentLeafId) : null });
});

playgroundRouter.patch("/messages/:id", async (req, res) => {
  const { feedback } = z.object({ feedback: z.enum(["", "up", "down"]) }).parse(req.body);
  await Message.updateOne({ _id: req.params.id, userId: me(req)._id }, { $set: { feedback } });
  res.json({ ok: true });
});

// ── Attachments ─────────────────────────────────────────

playgroundRouter.post("/attachments", attachmentUpload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest("No file uploaded");
  const userId = String(me(req)._id);
  const isImage = IMAGE_MIME.includes(file.mimetype);
  if (isImage) {
    const key = newKey("private", "chat", file.mimetype, userId);
    await putFile(key, file.buffer, file.mimetype);
    res.json({ attachment: { kind: "image", name: file.originalname, mime: file.mimetype, size: file.size, key, url: fileUrl(key) } });
    return;
  }
  let text = "";
  if (file.mimetype === "application/pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } catch (err) {
      logger.warn({ err }, "pdf extract failed");
      throw badRequest("Couldn't read that PDF");
    }
  } else {
    text = file.buffer.toString("utf8");
  }
  text = text.replace(/\u0000/g, "").slice(0, 200_000);
  if (!text.trim()) throw badRequest("That file has no readable text");
  res.json({ attachment: { kind: "file", name: file.originalname, mime: file.mimetype, size: file.size, text } });
});

// ── Chat (SSE) ──────────────────────────────────────────

const attachmentSchema = z.object({
  kind: z.enum(["image", "file"]),
  name: z.string().max(300).default(""),
  mime: z.string().max(100).default(""),
  size: z.number().default(0),
  key: z.string().max(300).optional(),
  url: z.string().max(500).optional(),
  text: z.string().max(200_000).optional(),
});

const chatSchema = z.object({
  conversationId: z.string().nullable().optional(),
  mode: z.enum(["send", "edit", "regenerate"]).default("send"),
  /** send: the message the new user message replies to (current leaf); null for the first message */
  parentId: z.string().nullable().optional(),
  /** edit: the user message being replaced; regenerate: the assistant message being replaced */
  targetId: z.string().optional(),
  content: z.string().max(200_000).default(""),
  attachments: z.array(attachmentSchema).max(10).default([]),
  model: z.string().min(1),
  params: paramsSchema.default({}),
});

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for up-to-date information: news, prices, recent events, documentation, or facts you are unsure about.",
    parameters: { type: "object", properties: { query: { type: "string", description: "A focused search query" } }, required: ["query"] },
  },
};

function pathTo(leafId: string, byId: Map<string, MessageLean>): MessageLean[] {
  const out: MessageLean[] = [];
  let cur = byId.get(leafId);
  const seen = new Set<string>();
  while (cur && !seen.has(String(cur._id))) {
    seen.add(String(cur._id));
    out.unshift(cur);
    cur = cur.parentId ? byId.get(String(cur.parentId)) : undefined;
  }
  return out;
}

async function toUpstreamMessages(path: MessageLean[], system: string, vision: boolean) {
  const msgs: any[] = [];
  if (system.trim()) msgs.push({ role: "system", content: system });
  for (const m of path) {
    if (m.role === "assistant") {
      if (m.content) msgs.push({ role: "assistant", content: m.content });
      continue;
    }
    const files = (m.attachments ?? []).filter((a) => a.kind === "file" && a.text);
    const images = (m.attachments ?? []).filter((a) => a.kind === "image" && a.key);
    let text = m.content;
    if (files.length) {
      text = files.map((f) => `<document name="${f.name}">\n${f.text}\n</document>`).join("\n\n") + (text ? `\n\n${text}` : "");
    }
    if (!images.length || !vision) {
      msgs.push({ role: "user", content: text || "(empty)" });
      continue;
    }
    const parts: any[] = [];
    if (text) parts.push({ type: "text", text });
    for (const img of images) {
      const buf = await getFile(img.key!);
      if (buf) parts.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${buf.toString("base64")}` } });
    }
    msgs.push({ role: "user", content: parts.length ? parts : text || "(image)" });
  }
  return msgs;
}

async function utilityModel(): Promise<ModelLean | null> {
  const preferred = await getSetting("utilityModel");
  const models = (await listModels()).filter((m) => m.enabled && m.type === "chat").sort((a, b) => a.sort - b.sort);
  return models.find((m) => m.publicId === preferred) ?? models.find((m) => m.access === "free") ?? models[0] ?? null;
}

function fallbackTitle(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 47)}…` : t || "New chat";
}

/** Short AI title for a new conversation (not billed). Falls back to the first words of the message. */
async function makeTitle(text: string): Promise<string> {
  const fb = fallbackTitle(text);
  // "hi" / "which model are you?" get an instant quick reply — don't spend tokens titling them
  if (detectQuickIntent(text)) return fb;
  const model = await utilityModel();
  if (!model || !text.trim()) return fb;
  try {
    const d = await dispatch({
      model,
      path: "/chat/completions",
      signal: AbortSignal.timeout(12_000),
      body: (up) =>
        JSON.stringify({
          model: up,
          max_tokens: 24,
          temperature: 0.3,
          messages: [
            { role: "system", content: "You write titles for chat conversations. Reply with a concise title of at most 6 words. No quotes, no punctuation at the end." },
            { role: "user", content: text.slice(0, 1500) },
          ],
        }),
    });
    if (d.clientError) return fb;
    const json: any = await d.res.json();
    const raw = String(json?.choices?.[0]?.message?.content ?? "").split("\n")[0].replace(/[*#`"“”]/g, "").trim();
    if (!raw || raw.split(/\s+/).length > 8) return fb;
    return raw.slice(0, 80);
  } catch {
    return fb;
  }
}

playgroundRouter.post("/chat", async (req: Request, res: Response) => {
  const user = me(req);
  const body = chatSchema.parse(req.body);
  const ent = await getEntitlement(user._id);
  const rl = rateLimiter.hit([{ key: `u:${user._id}`, limit: ent.rpm }]);
  if (!rl.ok) throw new GatewayError(429, `Rate limit reached (${rl.limit}/min). Try again in a few seconds.`, "rate_limit_error", "rate_limit_exceeded");

  const ctx: CallerContext = { user, apiKey: null, ent, source: "playground", ip: req.ip, userAgent: String(req.headers["user-agent"] ?? "") };
  const model = await preflight(ctx, body.model, "chat");
  const vision = model.capabilities.includes("vision");
  if (body.attachments.some((a) => a.kind === "image") && !vision) throw badRequest(`${model.name} can't read images. Pick a model with Vision.`);

  // Conversation
  let conv = body.conversationId ? await Conversation.findOne({ _id: body.conversationId, userId: user._id }) : null;
  if (body.conversationId && !conv) throw notFound("Conversation not found");
  const isNew = !conv;
  if (!conv) conv = await Conversation.create({ userId: user._id, title: fallbackTitle(body.content), model: model.publicId });
  conv.set("model", model.publicId);
  for (const [k, v] of Object.entries(body.params)) conv.set(`params.${k}`, v);

  const existing = isNew ? [] : await Message.find({ conversationId: conv._id }).lean<MessageLean[]>();
  const byId = new Map(existing.map((m) => [String(m._id), m]));

  // Work out which user message the new assistant reply hangs off
  let userMsg: MessageLean | null = null;
  let createdUserMsg: any = null;
  if (body.mode === "regenerate") {
    const target = body.targetId ? byId.get(body.targetId) : undefined;
    if (!target || target.role !== "assistant" || !target.parentId) throw badRequest("Nothing to regenerate");
    userMsg = byId.get(String(target.parentId)) ?? null;
    if (!userMsg) throw badRequest("Nothing to regenerate");
  } else {
    if (!body.content.trim() && !body.attachments.length) throw badRequest("Message is empty");
    let parentId: string | null = null;
    if (body.mode === "edit") {
      const target = body.targetId ? byId.get(body.targetId) : undefined;
      if (!target || target.role !== "user") throw badRequest("Can't edit that message");
      parentId = target.parentId ? String(target.parentId) : null;
    } else {
      parentId = body.parentId ?? null;
      if (parentId && !byId.has(parentId)) throw badRequest("Unknown parent message");
    }
    createdUserMsg = await Message.create({
      conversationId: conv._id,
      userId: user._id,
      parentId,
      role: "user",
      content: body.content,
      attachments: body.attachments.map((a) => ({ ...a, text: a.kind === "file" ? (a.text ?? "") : "" })),
    });
    userMsg = createdUserMsg.toObject() as MessageLean;
    byId.set(String(userMsg._id), userMsg);
  }

  const assistant = await Message.create({ conversationId: conv._id, userId: user._id, parentId: userMsg!._id, role: "assistant", model: model.publicId, status: "streaming" });
  conv.currentLeafId = assistant._id;
  conv.lastMessageAt = new Date();
  await conv.save();

  // Stream
  res.writeHead(200, sseHeaders());
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) ac.abort();
  });

  send("meta", {
    conversation: serializeConv(conv.toObject()),
    userMessage: createdUserMsg ? serializeMsg(createdUserMsg.toObject()) : null,
    assistantMessage: serializeMsg(assistant.toObject()),
  });

  const titlePromise = isNew ? makeTitle(body.content) : null;

  const params = conv.params ?? ({} as any);
  const messages = await toUpstreamMessages(pathTo(String(userMsg!._id), byId), params.system ?? "", vision);
  const useSearch = Boolean(params.webSearch) && searchEnabled() && model.capabilities.includes("tools");
  const startedAt = Date.now();
  let content = "";
  let reasoning = "";
  let reasoningMs = 0;
  let ttftMs: number | null = null;
  const totalUsage: Usage = { input: 0, output: 0, cached: 0, reasoning: 0 };
  const toolCalls: any[] = [];
  let error = "";
  let aborted = false;

  try {
    for (let step = 0; step < 4; step++) {
      const reqBody: any = {
        model: model.publicId,
        messages,
        stream: true,
        temperature: params.temperature ?? 0.7,
        top_p: params.topP ?? 1,
        max_tokens: Math.min(params.maxTokens ?? 4096, model.maxOutput || 1_000_000),
      };
      if (params.reasoningEffort && model.capabilities.includes("reasoning")) reqBody.reasoning_effort = params.reasoningEffort;
      if (params.jsonMode && model.capabilities.includes("json")) reqBody.response_format = { type: "json_object" };
      if (useSearch && step < 3) reqBody.tools = [WEB_SEARCH_TOOL];

      const stepStart = Date.now();
      const d = await dispatchChat(ctx, model, reqBody, ac.signal, stepStart);
      if (d.clientError) {
        const err = scrubUpstreamError(await d.res.text(), d.candidate.upstreamModel, model.publicId);
        error = err?.error?.message ?? "The model rejected the request";
        await recordRequest(ctx, { model, endpoint: "chat", candidate: d.candidate, status: "error", httpStatus: d.res.status, errorMessage: error, latencyMs: Date.now() - stepStart, stream: true });
        break;
      }
      const result = await readChatStream(d.res.body!, {
        startedAt: stepStart,
        signal: ac.signal,
        onChunk: (chunk) => {
          for (const choice of chunk?.choices ?? []) {
            const delta = choice.delta ?? {};
            const r = delta.reasoning_content ?? delta.reasoning;
            if (typeof r === "string" && r) send("reasoning", { text: r });
            if (typeof delta.content === "string" && delta.content) send("delta", { text: delta.content });
          }
        },
      });
      if (ttftMs === null && result.ttftMs !== null) ttftMs = stepStart - startedAt + result.ttftMs;
      content += result.content;
      reasoning += result.reasoning;
      reasoningMs += result.reasoningMs;
      const usage = result.usage ?? estimateUsage(messages, result);
      totalUsage.input += usage.input;
      totalUsage.output += usage.output;
      totalUsage.cached += usage.cached;
      totalUsage.reasoning += usage.reasoning;
      await recordRequest(ctx, {
        model,
        endpoint: "chat",
        candidate: d.candidate,
        attempts: d.attempts,
        status: result.error ? "error" : "success",
        httpStatus: result.error ? 502 : result.aborted ? 499 : 200,
        errorMessage: result.error ?? "",
        usage,
        estimated: !result.usage,
        latencyMs: Date.now() - stepStart,
        ttftMs: result.ttftMs,
        stream: true,
      });
      if (result.aborted) {
        aborted = true;
        break;
      }
      if (result.error) {
        error = result.error;
        break;
      }
      if (useSearch && result.finishReason === "tool_calls" && result.toolCalls.length) {
        messages.push({
          role: "assistant",
          content: result.content || null,
          tool_calls: result.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: t.arguments } })),
        });
        for (const tc of result.toolCalls) {
          let args: any = {};
          try {
            args = JSON.parse(tc.arguments || "{}");
          } catch {
            /* ignore */
          }
          const call = { id: tc.id, name: tc.name, args, status: "running", summary: "", sources: [] as any[] };
          send("tool", call);
          if (tc.name !== "web_search") {
            call.status = "error";
            call.summary = "Unknown tool";
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: "unknown tool" }) });
          } else {
            const results = await webSearch(String(args.query ?? ""));
            call.status = "done";
            call.summary = `${results.length} result${results.length === 1 ? "" : "s"}`;
            call.sources = results;
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ results }) });
          }
          toolCalls.push(call);
          send("tool", call);
        }
        continue;
      }
      break;
    }
  } catch (err) {
    if (ac.signal.aborted) aborted = true;
    else error = err instanceof GatewayError ? err.message : "Something went wrong while generating a reply.";
    if (!(err instanceof GatewayError)) logger.error({ err }, "playground chat failed");
  }

  assistant.set({
    content,
    reasoning,
    reasoningMs,
    toolCalls,
    usage: totalUsage,
    latencyMs: Date.now() - startedAt,
    ttftMs: ttftMs ?? 0,
    status: error ? "error" : aborted ? "stopped" : "complete",
    error,
  });
  await assistant.save();

  if (titlePromise) {
    const title = await titlePromise;
    await Conversation.updateOne({ _id: conv._id }, { $set: { title } });
    send("title", { conversationId: String(conv._id), title });
  }

  if (error) send("error", { message: error });
  send("done", { message: serializeMsg(assistant.toObject()) });
  if (!res.writableEnded) res.end();
});
