import { describe, expect, it } from "vitest";
import { AnthropicStream, anthropicError, anthropicToOpenAI, effortForBudget, openAIToAnthropic, stopReason } from "../src/gateway/anthropic";

/** Parses an SSE string into [{ event, data }]. */
const events = (s: string) =>
  s
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const [ev, data] = block.split("\n");
      return { event: ev.replace("event: ", ""), data: JSON.parse(data.replace("data: ", "")) };
    });

const usage = { input: 120, output: 40, cached: 20, reasoning: 0 };

describe("anthropicToOpenAI", () => {
  it("converts system, text turns and sampling params", () => {
    const { body, thinking } = anthropicToOpenAI(
      {
        model: "claude-sonnet-5-5",
        max_tokens: 1024,
        temperature: 0.2,
        stop_sequences: ["END"],
        system: [{ type: "text", text: "Be brief.", cache_control: { type: "ephemeral" } }],
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
          { role: "user", content: [{ type: "text", text: "Again" }] },
        ],
      },
      { reasoning: true },
    );
    expect(thinking).toBe(false);
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 1024, temperature: 0.2, stop: ["END"], stream: false });
    expect(body.messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "Again" },
    ]);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("converts tools, tool_use and tool_result in the order OpenAI requires", () => {
    const { body } = anthropicToOpenAI(
      {
        model: "m",
        tools: [
          { name: "read_file", description: "Read a file", input_schema: { type: "object", properties: { path: { type: "string" } } } },
          { type: "web_search_20250305", name: "web_search" }, // server tool: dropped
        ],
        tool_choice: { type: "any", disable_parallel_tool_use: true },
        messages: [
          { role: "user", content: "Open a.txt" },
          { role: "assistant", content: [{ type: "thinking", thinking: "hmm", signature: "x" }, { type: "text", text: "Reading." }, { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.txt" } }] },
          {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "hello" }] },
              { type: "text", text: "Summarise it" },
            ],
          },
          { role: "assistant", content: [{ type: "tool_use", id: "toolu_2", name: "read_file", input: { path: "b.txt" } }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_2", is_error: true, content: "not found" }] },
        ],
      },
      { reasoning: false },
    );
    expect(body.tools).toEqual([{ type: "function", function: { name: "read_file", description: "Read a file", parameters: { type: "object", properties: { path: { type: "string" } } } } }]);
    expect(body.tool_choice).toBe("required");
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.messages).toEqual([
      { role: "user", content: "Open a.txt" },
      { role: "assistant", content: "Reading.", tool_calls: [{ id: "toolu_1", type: "function", function: { name: "read_file", arguments: '{"path":"a.txt"}' } }] },
      { role: "tool", tool_call_id: "toolu_1", content: "hello" },
      { role: "user", content: "Summarise it" },
      { role: "assistant", content: null, tool_calls: [{ id: "toolu_2", type: "function", function: { name: "read_file", arguments: '{"path":"b.txt"}' } }] },
      { role: "tool", tool_call_id: "toolu_2", content: "Error: not found" },
    ]);
  });

  it("converts images and flags them", () => {
    const { body, hasImages } = anthropicToOpenAI(
      { model: "m", messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }, { type: "text", text: "What is this?" }] }] },
      { reasoning: false },
    );
    expect(hasImages).toBe(true);
    expect(body.messages[0].content).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
      { type: "text", text: "What is this?" },
    ]);
  });

  it("maps extended thinking to reasoning effort only for reasoning models", () => {
    const req = { model: "m", messages: [{ role: "user", content: "x" }], thinking: { type: "enabled", budget_tokens: 20000 } };
    expect(anthropicToOpenAI(req, { reasoning: true }).body.reasoning_effort).toBe("high");
    expect(anthropicToOpenAI(req, { reasoning: false }).body.reasoning_effort).toBeUndefined();
    expect(anthropicToOpenAI(req, { reasoning: false }).thinking).toBe(true);
    expect([effortForBudget(1024), effortForBudget(8000), effortForBudget(32000)]).toEqual(["low", "medium", "high"]);
  });
});

describe("openAIToAnthropic", () => {
  it("builds a message with thinking, text, tool_use and usage", () => {
    const msg = openAIToAnthropic(
      {
        choices: [
          {
            finish_reason: "tool_calls",
            message: { content: "Let me check.", reasoning_content: "plan", tool_calls: [{ id: "call_1", function: { name: "read_file", arguments: '{"path":"a"}' } }] },
          },
        ],
      },
      { model: "deepseek-v4.1-flash", thinking: true, usage },
    );
    expect(msg).toMatchObject({ type: "message", role: "assistant", model: "deepseek-v4.1-flash", stop_reason: "tool_use", stop_sequence: null });
    expect(msg.id).toMatch(/^msg_/);
    expect(msg.content).toEqual([
      { type: "thinking", thinking: "plan", signature: "" },
      { type: "text", text: "Let me check." },
      { type: "tool_use", id: "call_1", name: "read_file", input: { path: "a" } },
    ]);
    expect(msg.usage).toEqual({ input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 20, cache_creation_input_tokens: 0 });
  });

  it("hides reasoning unless thinking was requested and never returns empty content", () => {
    const msg = openAIToAnthropic({ choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "secret" } }] }, { model: "m", thinking: false, usage });
    expect(msg.content).toEqual([{ type: "text", text: "" }]);
    expect(msg.stop_reason).toBe("max_tokens");
  });

  it("maps finish reasons and error types", () => {
    expect([stopReason("stop", false), stopReason("length", false), stopReason("stop", true), stopReason("content_filter", false)]).toEqual(["end_turn", "max_tokens", "tool_use", "refusal"]);
    expect(anthropicError(429, "slow down")).toEqual({ type: "error", error: { type: "rate_limit_error", message: "slow down" } });
    expect(anthropicError(401, "x").error.type).toBe("authentication_error");
    expect(anthropicError(503, "x").error.type).toBe("overloaded_error");
  });
});

describe("AnthropicStream", () => {
  it("emits the full event sequence for thinking, text and a tool call", () => {
    const s = new AnthropicStream({ model: "claude-sonnet-5-5", thinking: true });
    let out = s.start(50);
    const chunk = (delta: object, finish: string | null = null) => ({ choices: [{ index: 0, delta, finish_reason: finish }] });
    out += s.onChunk(chunk({ reasoning_content: "Think" }));
    out += s.onChunk(chunk({ reasoning_content: "ing" }));
    out += s.onChunk(chunk({ content: "Hello" }));
    out += s.onChunk(chunk({ content: " world" }));
    out += s.onChunk(chunk({ tool_calls: [{ index: 0, id: "call_9", function: { name: "ls", arguments: "" } }] }));
    out += s.onChunk(chunk({ tool_calls: [{ index: 0, function: { arguments: '{"dir":' } }] }));
    out += s.onChunk(chunk({ tool_calls: [{ index: 0, function: { arguments: '"."}' } }] }, "tool_calls"));
    out += s.finish({ finishReason: "tool_calls", usage });

    const ev = events(out);
    expect(ev.map((e) => e.event)).toEqual([
      "message_start",
      "ping",
      "content_block_start",
      "content_block_delta",
      "content_block_delta",
      "content_block_stop",
      "content_block_start",
      "content_block_delta",
      "content_block_delta",
      "content_block_stop",
      "content_block_start",
      "content_block_delta",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
    expect(ev[0].data.message).toMatchObject({ model: "claude-sonnet-5-5", role: "assistant", content: [], usage: { input_tokens: 50 } });
    expect(ev[2].data).toEqual({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } });
    expect(ev[3].data.delta).toEqual({ type: "thinking_delta", thinking: "Think" });
    expect(ev[6].data.content_block).toEqual({ type: "text", text: "" });
    expect(ev[7].data).toMatchObject({ index: 1, delta: { type: "text_delta", text: "Hello" } });
    expect(ev[10].data).toMatchObject({ index: 2, content_block: { type: "tool_use", id: "call_9", name: "ls", input: {} } });
    const json = ev.filter((e) => e.data.delta?.type === "input_json_delta").map((e) => e.data.delta.partial_json).join("");
    expect(JSON.parse(json)).toEqual({ dir: "." });
    expect(ev[14].data).toEqual({ type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 20, cache_creation_input_tokens: 0 } });
  });

  it("drops reasoning when thinking wasn't requested and handles an empty reply", () => {
    const s = new AnthropicStream({ model: "m", thinking: false });
    let out = s.start(1) + s.onChunk({ choices: [{ delta: { reasoning_content: "hidden" } }] }) + s.finish({ finishReason: "stop", usage });
    const ev = events(out);
    expect(ev.some((e) => e.data.content_block?.type === "thinking")).toBe(false);
    expect(ev.find((e) => e.event === "content_block_start")?.data.content_block).toEqual({ type: "text", text: "" });
    expect(ev.at(-2)?.data.delta.stop_reason).toBe("end_turn");
  });

  it("buffers a tool call whose name arrives late and flushes it at the end", () => {
    const s = new AnthropicStream({ model: "m", thinking: false });
    let out = s.start(1);
    out += s.onChunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { arguments: '{"a":1}' } }] } }] });
    out += s.finish({ finishReason: "tool_calls", usage });
    const ev = events(out);
    expect(ev.find((e) => e.event === "content_block_start")?.data.content_block).toMatchObject({ type: "tool_use", id: "c1", name: "tool" });
    expect(ev.find((e) => e.data.delta?.type === "input_json_delta")?.data.delta.partial_json).toBe('{"a":1}');
  });
});
