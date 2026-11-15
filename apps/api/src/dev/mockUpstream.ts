import express, { Router, type Request, type Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { env } from "../config/env";

/**
 * A fake OpenAI-compatible provider for local development.
 * Mounted at /mock/v1 when ENABLE_MOCK_PROVIDER=true. Keys starting with "mock-fail" always 500
 * (handy for testing failover); any other "mock-" key works.
 */
export const mockUpstream = Router();
mockUpstream.use(express.json({ limit: "25mb" }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function auth(req: Request, res: Response): boolean {
  const key = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!key.startsWith("mock-")) {
    res.status(401).json({ error: { message: "Invalid mock key", type: "invalid_request_error" } });
    return false;
  }
  if (key.startsWith("mock-fail")) {
    res.status(500).json({ error: { message: "Simulated upstream failure", type: "server_error" } });
    return false;
  }
  return true;
}

function lastUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ");
  }
  return "";
}

function hasImage(messages: any[]) {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p: any) => p.type === "image_url"));
}

function buildReply(messages: any[], model: string): string {
  const q = lastUserText(messages).trim();
  const lower = q.toLowerCase();
  if (messages[0]?.role === "system" && String(messages[0].content).includes("titles for chat conversations")) {
    const words = q.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 5);
    return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || "New chat";
  }
  const toolMsg = [...messages].reverse().find((m) => m.role === "tool");
  if (toolMsg) {
    let results: any[] = [];
    try {
      results = JSON.parse(toolMsg.content)?.results ?? [];
    } catch {
      /* ignore */
    }
    const lines = results.slice(0, 3).map((r: any, i: number) => `${i + 1}. **${r.title}** — ${r.snippet ?? ""} [source](${r.url})`);
    return `Here's what I found on the web:\n\n${lines.join("\n") || "_No results._"}\n\nLet me know if you want me to dig deeper into any of these.`;
  }
  if (hasImage(messages)) return "I can see the image you shared. It shows a colourful composition — *(this is the mock provider, so I can't really see it)*. Ask me anything about it!";
  if (/^(hi|hlo|hello|hey|yo)\b/.test(lower)) return "Hey! 👋 What can I help you with today?";
  if (/(html|landing page|website|web page|artifact)/.test(lower)) {
    return [
      "Here's a small self-contained page you can preview in the artifact panel:",
      "",
      "```html",
      "<!doctype html>",
      "<html><head><style>",
      "  body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#1e1b4b,#0f172a);font-family:system-ui;color:#fff}",
      "  .card{padding:40px 48px;border-radius:24px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);text-align:center}",
      "  button{margin-top:16px;padding:10px 18px;border-radius:12px;border:0;background:#8b5cf6;color:#fff;font-weight:600;cursor:pointer}",
      "</style></head><body>",
      '  <div class="card"><h1>Hello from the mock model ✨</h1><p>Edit me and hit preview.</p><button onclick="this.textContent=\'Clicked!\'">Click me</button></div>',
      "</body></html>",
      "```",
      "",
      "Open it with **Preview** to see it rendered.",
    ].join("\n");
  }
  if (/(table|compare)/.test(lower)) {
    return "Here's a quick comparison:\n\n| Plan | Tokens / month | Requests / min |\n|---|---:|---:|\n| Free | 1M | 60 |\n| Starter | 30M | 120 |\n| Pro | 200M | 600 |\n\nPick the one that matches your traffic.";
  }
  if (/(math|equation|formula)/.test(lower)) {
    return "The quadratic formula solves $ax^2 + bx + c = 0$:\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\nThe discriminant $b^2 - 4ac$ tells you how many real roots there are.";
  }
  if (/(code|function|python|javascript|typescript|script)/.test(lower)) {
    return [
      `Sure — here's an example in Python that calls this API:`,
      "",
      "```python",
      "from openai import OpenAI",
      "",
      `client = OpenAI(base_url="${env.PUBLIC_API_BASE_URL}", api_key="YOUR_KEY")`,
      "",
      "resp = client.chat.completions.create(",
      `    model="${model}",`,
      '    messages=[{"role": "user", "content": "Hello!"}],',
      ")",
      "print(resp.choices[0].message.content)",
      "```",
      "",
      "- Swap `api_key` for a key from **API keys**.",
      "- Set `stream=True` to receive tokens as they are generated.",
    ].join("\n");
  }
  return [
    `You asked: **“${q.slice(0, 160) || "(empty message)"}”**`,
    "",
    "This reply comes from the built-in **mock provider**, so it isn't a real model — but it streams exactly like one. A few things you can try:",
    "",
    "1. Ask for *code* to see syntax highlighting.",
    "2. Ask for an *HTML page* to open it as an artifact.",
    "3. Ask for a *table* or some *math*.",
    "4. Turn on **Search** and ask about the *latest news* to see a tool call.",
    "",
    "Add a real upstream in **Admin → Providers** to talk to actual models.",
  ].join("\n");
}

function chunkText(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

const approxTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));

mockUpstream.post("/chat/completions", async (req, res) => {
  if (!auth(req, res)) return;
  const body = req.body ?? {};
  const messages: any[] = body.messages ?? [];
  const model = body.model ?? "mock";
  const id = `chatcmpl-${crypto.randomBytes(8).toString("hex")}`;
  const created = Math.floor(Date.now() / 1000);
  const reasoningOn = /reason|think|r1/i.test(model) || Boolean(body.reasoning_effort);
  const q = lastUserText(messages).toLowerCase();
  const wantsTool =
    Array.isArray(body.tools) &&
    body.tools.some((t: any) => t?.function?.name === "web_search") &&
    !messages.some((m) => m.role === "tool") &&
    /(search|latest|news|today|current|price)/.test(q);

  const reasoning = reasoningOn
    ? `The user wrote: "${q.slice(0, 80)}". Let me think about what they actually need, outline the key points, and keep the answer concise and well-formatted.`
    : "";
  const content = wantsTool ? "" : buildReply(messages, model);
  const toolCall = wantsTool
    ? { id: `call_${crypto.randomBytes(6).toString("hex")}`, type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: lastUserText(messages).slice(0, 120) }) } }
    : null;

  const promptTokens = approxTokens(JSON.stringify(messages));
  const completionTokens = approxTokens(content + reasoning + (toolCall?.function.arguments ?? ""));
  const usage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: approxTokens(reasoning) * (reasoning ? 1 : 0) },
  };

  if (!body.stream) {
    await sleep(300);
    res.json({
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: toolCall ? null : content, ...(reasoning ? { reasoning_content: reasoning } : {}), ...(toolCall ? { tool_calls: [toolCall] } : {}) },
          finish_reason: toolCall ? "tool_calls" : "stop",
        },
      ],
      usage,
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  let closed = false;
  res.on("close", () => {
    if (!res.writableFinished) closed = true;
  });
  const send = (delta: any, finish: string | null = null) =>
    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);

  await sleep(250);
  send({ role: "assistant", content: "" });
  for (const piece of chunkText(reasoning)) {
    if (closed) return;
    send({ reasoning_content: piece });
    await sleep(18);
  }
  if (toolCall) {
    send({ tool_calls: [{ index: 0, id: toolCall.id, type: "function", function: { name: "web_search", arguments: "" } }] });
    await sleep(40);
    send({ tool_calls: [{ index: 0, function: { arguments: toolCall.function.arguments } }] });
    send({}, "tool_calls");
  } else {
    for (const piece of chunkText(content)) {
      if (closed) return;
      send({ content: piece });
      await sleep(14);
    }
    send({}, "stop");
  }
  if (body.stream_options?.include_usage) {
    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [], usage })}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
});

mockUpstream.post("/embeddings", (req, res) => {
  if (!auth(req, res)) return;
  const inputs: string[] = Array.isArray(req.body?.input) ? req.body.input : [String(req.body?.input ?? "")];
  const data = inputs.map((text, index) => {
    const seed = crypto.createHash("sha256").update(text).digest();
    const embedding = Array.from({ length: 256 }, (_, i) => (seed[i % 32] / 255 - 0.5) * Math.cos(i));
    return { object: "embedding", index, embedding };
  });
  const tokens = inputs.reduce((n, s) => n + approxTokens(s), 0);
  res.json({ object: "list", data, model: req.body?.model, usage: { prompt_tokens: tokens, total_tokens: tokens } });
});

function svgImage(prompt: string, w: number, h: number, i: number): string {
  const hash = crypto.createHash("md5").update(prompt + i).digest();
  const hue1 = hash[0] % 360;
  const hue2 = (hue1 + 60 + (hash[1] % 120)) % 360;
  const circles = Array.from({ length: 6 }, (_, k) => {
    const cx = ((hash[2 + k] / 255) * w).toFixed(0);
    const cy = ((hash[8 + k] / 255) * h).toFixed(0);
    const r = ((0.08 + (hash[(3 + k) % 16] / 255) * 0.25) * Math.min(w, h)).toFixed(0);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsla(${(hue1 + k * 40) % 360},85%,65%,0.35)"/>`;
  }).join("");
  const label = prompt.replace(/[<>&"]/g, "").slice(0, 60);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue1},70%,22%)"/><stop offset="1" stop-color="hsl(${hue2},75%,45%)"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="${Math.round(Math.min(w, h) / 30)}"/></filter></defs>
<rect width="100%" height="100%" fill="url(#g)"/><g filter="url(#b)">${circles}</g>
<text x="50%" y="92%" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${Math.round(Math.min(w, h) / 32)}" fill="rgba(255,255,255,.75)">${label}</text>
</svg>`;
}

async function imageResponse(req: Request, res: Response) {
  if (!auth(req, res)) return;
  const b = req.body ?? {};
  const n = Math.min(4, Math.max(1, Number(b.n) || 1));
  const [w, h] = String(b.size ?? "1024x1024").split("x").map((x) => Math.min(4096, Number(x) || 1024));
  await sleep(900);
  res.json({
    created: Math.floor(Date.now() / 1000),
    data: Array.from({ length: n }, (_, i) => ({ b64_json: Buffer.from(svgImage(String(b.prompt ?? ""), w, h, i)).toString("base64"), revised_prompt: b.prompt })),
  });
}

mockUpstream.post("/images/generations", imageResponse);
mockUpstream.post("/images/edits", multer({ storage: multer.memoryStorage() }).single("image"), imageResponse);
mockUpstream.get("/models", (_req, res) => res.json({ object: "list", data: [{ id: "mock-chat", object: "model" }, { id: "mock-image", object: "model" }] }));
