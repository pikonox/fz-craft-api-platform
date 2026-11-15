import { describe, expect, it } from "vitest";
import { composeQuickReply, detectQuickIntent, quickReplyCandidate, quickReplyResponse } from "../src/services/quickReplies";
import { QUICK_REPLY_DEFAULTS } from "../src/services/settings";
import { readChatStream } from "../src/gateway/stream";

const intent = (s: string) => detectQuickIntent(s)?.intent ?? null;

describe("quick replies: matching", () => {
  it("recognises greetings, including common spellings", () => {
    for (const s of ["hi", "Hii!!", "hello", "Helo", "hlo", "hey bro", "Hey there 👋", "good morning", "yo", "whats up"]) expect(intent(s), s).toBe("greeting");
  });

  it("recognises salam", () => {
    for (const s of ["salam", "Assalam o alaikum", "assalamualaikum", "AOA", "as salamu alaikum"]) expect(intent(s), s).toBe("salam");
  });

  it("recognises identity questions, alone or after a greeting", () => {
    for (const s of ["Hlo Which model is u ?", "which model are you", "what model is this?", "who are you", "who r u", "what's your name", "who made you", "who created you?", "are you chatgpt", "is this gpt", "which ai are you", "introduce yourself", "what are you"]) {
      expect(intent(s), s).toBe("identity");
    }
    expect(detectQuickIntent("Hlo Which model is u ?")?.greeted).toBe("greeting");
  });

  it("recognises how-are-you and thanks", () => {
    for (const s of ["how are you", "hi, how r u doing?", "kaise ho", "kya haal hai"]) expect(intent(s), s).toBe("howAreYou");
    for (const s of ["thanks", "Thank you so much!", "ok thanks bro", "thx", "jazakallah"]) expect(intent(s), s).toBe("thanks");
  });

  it("lets real questions through to the model", () => {
    for (const s of [
      "hi, can you write a python script?",
      "which model is best for coding",
      "what is ai",
      "what can you do",
      "how does this work",
      "thanks, now translate this to Urdu",
      "hello world in rust",
      "who made the first computer",
      "what is the name of the capital of France",
      "hi ".repeat(60),
      "",
    ]) {
      expect(intent(s), s).toBeNull();
    }
  });
});

describe("quick replies: when they apply", () => {
  const msg = (content: unknown, role = "user") => ({ role, content });
  it("answers plain chat turns, including later turns", () => {
    expect(quickReplyCandidate({ messages: [msg("hi")] })).toBe("hi");
    expect(quickReplyCandidate({ messages: [msg("q"), msg("a", "assistant"), msg("thanks")] })).toBe("thanks");
  });
  it("never answers when the request sets a persona, tools, JSON mode or sends images", () => {
    expect(quickReplyCandidate({ messages: [msg("You are Acme's bot", "system"), msg("hi")] })).toBeNull();
    expect(quickReplyCandidate({ messages: [msg("hi")], tools: [{ type: "function" }] })).toBeNull();
    expect(quickReplyCandidate({ messages: [msg("hi")], response_format: { type: "json_object" } })).toBeNull();
    expect(quickReplyCandidate({ messages: [msg("hi")], n: 2 })).toBeNull();
    expect(quickReplyCandidate({ messages: [msg([{ type: "text", text: "hi" }, { type: "image_url", image_url: { url: "x" } }])] })).toBeNull();
    expect(quickReplyCandidate({ messages: [msg("hi"), msg("hello", "assistant")] })).toBeNull();
  });
});

describe("quick replies: answers", () => {
  const model = { name: "DeepSeek V4.1 Flash", vendor: "DeepSeek", publicId: "deepseek-v4.1-flash" };
  it("fills the model name and greets back first", () => {
    const text = composeQuickReply(detectQuickIntent("hlo which model is u")!, QUICK_REPLY_DEFAULTS, model)!;
    expect(text.startsWith("Hello! 👋 I'm DeepSeek V4.1 Flash")).toBe(true);
    expect(text).toContain("Mr Fahad");
  });
  it("an empty answer list turns that intent off", () => {
    expect(composeQuickReply({ intent: "thanks", greeted: null }, { ...QUICK_REPLY_DEFAULTS, thanks: [] }, model)).toBeNull();
  });
  it("builds a normal JSON completion with small real token counts", async () => {
    const d = quickReplyResponse(model, { stream: false }, "Hello there!", "hi");
    const json: any = await d.res.json();
    expect(json.choices[0].message.content).toBe("Hello there!");
    expect(json.model).toBe("deepseek-v4.1-flash");
    expect(json.usage.prompt_tokens).toBeGreaterThan(0);
    expect(json.usage.completion_tokens).toBeGreaterThan(0);
    expect(d.candidate.provider.name).toBe("Quick reply");
  });
  it("builds an SSE stream the gateway can read", async () => {
    const text = "I'm DeepSeek V4.1 Flash, running on FZ-craft. How can I help you today?";
    const d = quickReplyResponse(model, { stream: true }, text, "which model are you");
    const result = await readChatStream(d.res.body!, { startedAt: Date.now(), onChunk: () => {} });
    expect(result.content).toBe(text);
    expect(result.usage?.output).toBeGreaterThan(0);
  });
});
