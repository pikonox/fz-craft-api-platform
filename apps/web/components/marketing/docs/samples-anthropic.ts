/**
 * Samples for the Anthropic Messages API and coding tools. Placeholders are filled by useFillOrigin():
 * {{BASE_URL}} = https://…/v1, {{ORIGIN}} = https://… (Anthropic SDKs add /v1 themselves), {{KEY_PREFIX}}.
 */
import type { SampleTab } from "../code-block";

export const MESSAGES: SampleTab[] = [
  {
    id: "curl",
    label: "curl",
    lang: "bash",
    code: `curl {{BASE_URL}}/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "claude-sonnet-5-5",
    "max_tokens": 1024,
    "system": "You are a concise assistant.",
    "messages": [
      {"role": "user", "content": "Explain server-sent events in one sentence."}
    ]
  }'`,
  },
  {
    id: "python",
    label: "Python",
    lang: "python",
    code: `import os
from anthropic import Anthropic

client = Anthropic(
    base_url="{{ORIGIN}}",  # the SDK adds /v1/messages
    api_key=os.environ["API_KEY"],
)

message = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Explain server-sent events in one sentence."}],
)
print(message.content[0].text)`,
  },
  {
    id: "node",
    label: "Node.js",
    lang: "js",
    code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "{{ORIGIN}}", // the SDK adds /v1/messages
  apiKey: process.env.API_KEY,
});

const message = await client.messages.create({
  model: "claude-sonnet-5-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Explain server-sent events in one sentence." }],
});
console.log(message.content[0].text);`,
  },
];

export const MESSAGES_RESPONSE = `{
  "id": "msg_9xK2bQ7mW4tR1yZ8cV3nL6pD",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-5-5",
  "content": [
    { "type": "text", "text": "Server-sent events keep one HTTP response open so the server can push updates the moment they're ready." }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": { "input_tokens": 24, "output_tokens": 23, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0 }
}`;

export const MESSAGES_STREAM = `event: message_start
data: {"type":"message_start","message":{"id":"msg_…","role":"assistant","model":"claude-sonnet-5-5","content":[],"usage":{"input_tokens":24,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Server-sent events"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":23}}

event: message_stop
data: {"type":"message_stop"}`;

export const CLAUDE_CODE: SampleTab[] = [
  {
    id: "unix",
    label: "macOS / Linux",
    lang: "bash",
    title: "~/.zshrc or ~/.bashrc",
    code: `export ANTHROPIC_BASE_URL="{{ORIGIN}}"
export ANTHROPIC_AUTH_TOKEN="{{KEY_PREFIX}}..."

# Which models Claude Code should use (any chat model id from the catalog works)
export ANTHROPIC_MODEL="claude-sonnet-5-5"
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-opus-5-5"
export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-5-5"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek-v4.1-flash"   # quick background tasks

claude`,
  },
  {
    id: "windows",
    label: "Windows (PowerShell)",
    lang: "bash",
    code: `$env:ANTHROPIC_BASE_URL = "{{ORIGIN}}"
$env:ANTHROPIC_AUTH_TOKEN = "{{KEY_PREFIX}}..."
$env:ANTHROPIC_MODEL = "claude-sonnet-5-5"
$env:ANTHROPIC_DEFAULT_OPUS_MODEL = "claude-opus-5-5"
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = "claude-sonnet-5-5"
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = "deepseek-v4.1-flash"

claude`,
  },
  {
    id: "settings",
    label: "settings.json",
    lang: "json",
    title: "~/.claude/settings.json",
    code: `{
  "env": {
    "ANTHROPIC_BASE_URL": "{{ORIGIN}}",
    "ANTHROPIC_AUTH_TOKEN": "{{KEY_PREFIX}}...",
    "ANTHROPIC_MODEL": "claude-sonnet-5-5",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-5-5",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-5-5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4.1-flash"
  }
}`,
  },
];
