/**
 * Code samples for the docs. `{{BASE_URL}}`, `{{ORIGIN}}` and `{{KEY_PREFIX}}` are filled in by
 * useFillOrigin() with the public API base URL, site origin and API key prefix.
 */
import type { SampleTab } from "../code-block";

const tabs = (curl: string, python: string, node: string): SampleTab[] => [
  { id: "curl", label: "curl", lang: "bash", code: curl },
  { id: "python", label: "Python", lang: "python", code: python },
  { id: "node", label: "Node.js", lang: "js", code: node },
];

export const ENV_SETUP = `export API_KEY="{{KEY_PREFIX}}..."

# Optional: the official OpenAI SDKs pick these up automatically
export OPENAI_BASE_URL="{{BASE_URL}}"
export OPENAI_API_KEY="$API_KEY"`;

export const AUTH_HEADERS = `curl {{BASE_URL}}/models \\
  -H "Authorization: Bearer $API_KEY"

# x-api-key works too
curl {{BASE_URL}}/models \\
  -H "x-api-key: $API_KEY"`;

export const CLIENT_SETUP = tabs(
  `curl {{BASE_URL}}/models \\
  -H "Authorization: Bearer $API_KEY"`,
  `# pip install openai
import os
from openai import OpenAI

client = OpenAI(
    base_url="{{BASE_URL}}",
    api_key=os.environ["API_KEY"],  # {{KEY_PREFIX}}...
)`,
  `// npm install openai
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "{{BASE_URL}}",
  apiKey: process.env.API_KEY, // {{KEY_PREFIX}}...
});`,
);

export const CHAT = tabs(
  `curl {{BASE_URL}}/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v4.1-flash",
    "messages": [
      {"role": "system", "content": "You are a concise assistant."},
      {"role": "user", "content": "Write a haiku about latency."}
    ],
    "temperature": 0.7,
    "max_tokens": 200
  }'`,
  `from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

resp = client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[
        {"role": "system", "content": "You are a concise assistant."},
        {"role": "user", "content": "Write a haiku about latency."},
    ],
    temperature=0.7,
    max_tokens=200,
)

print(resp.choices[0].message.content)
print(resp.usage.total_tokens, "tokens")`,
  `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

const resp = await client.chat.completions.create({
  model: "deepseek-v4.1-flash",
  messages: [
    { role: "system", content: "You are a concise assistant." },
    { role: "user", content: "Write a haiku about latency." },
  ],
  temperature: 0.7,
  max_tokens: 200,
});

console.log(resp.choices[0].message.content);
console.log(resp.usage.total_tokens, "tokens");`,
);

export const CHAT_RESPONSE = `{
  "id": "chatcmpl-8f2c…",
  "object": "chat.completion",
  "created": 1763116800,
  "model": "deepseek-v4.1-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Packets cross the sea…"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 27,
    "completion_tokens": 19,
    "total_tokens": 46
  }
}`;

export const STREAM = tabs(
  `curl -N {{BASE_URL}}/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v4.1-flash",
    "stream": true,
    "stream_options": {"include_usage": true},
    "messages": [{"role": "user", "content": "Count to five."}]
  }'`,
  `from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

stream = client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[{"role": "user", "content": "Count to five."}],
    stream=True,
    stream_options={"include_usage": True},
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
    if chunk.usage:  # final chunk, only with include_usage
        print("\\n", chunk.usage)`,
  `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

const stream = await client.chat.completions.create({
  model: "deepseek-v4.1-flash",
  messages: [{ role: "user", content: "Count to five." }],
  stream: true,
  stream_options: { include_usage: true },
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
  if (chunk.usage) console.log("\\n", chunk.usage); // final chunk
}`,
);

export const STREAM_WIRE = `data: {"id":"chatcmpl-…","object":"chat.completion.chunk","model":"deepseek-v4.1-flash","choices":[{"index":0,"delta":{"role":"assistant","content":"One"}}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","model":"deepseek-v4.1-flash","choices":[{"index":0,"delta":{"content":", two"}}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","model":"deepseek-v4.1-flash","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","model":"deepseek-v4.1-flash","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":9,"total_tokens":21}}

data: [DONE]`;

export const REASONING = tabs(
  `curl {{BASE_URL}}/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v4.1-flash",
    "messages": [{"role": "user", "content": "Is 1001 a prime number?"}]
  }'`,
  `from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

resp = client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[{"role": "user", "content": "Is 1001 a prime number?"}],
)
msg = resp.choices[0].message
print("thinking:", getattr(msg, "reasoning_content", None))
print("answer:", msg.content)

# Streaming: reasoning arrives in delta.reasoning_content before delta.content
stream = client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[{"role": "user", "content": "Is 1001 a prime number?"}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta if chunk.choices else None
    if delta is not None and getattr(delta, "reasoning_content", None):
        print(delta.reasoning_content, end="")`,
  `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

const stream = await client.chat.completions.create({
  model: "deepseek-v4.1-flash",
  messages: [{ role: "user", content: "Is 1001 a prime number?" }],
  stream: true,
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta ?? {};
  if (delta.reasoning_content) process.stderr.write(delta.reasoning_content); // thinking
  if (delta.content) process.stdout.write(delta.content); // answer
}`,
);

export const REASONING_RESPONSE = `{
  "model": "deepseek-v4.1-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "reasoning_content": "1001 = 7 × 11 × 13, so it has divisors other than 1 and itself…",
        "content": "No. 1001 = 7 × 11 × 13."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 14,
    "completion_tokens": 96,
    "total_tokens": 110,
    "completion_tokens_details": { "reasoning_tokens": 81 }
  }
}`;

export const VISION = tabs(
  `curl {{BASE_URL}}/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seed-2.1-turbo",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this picture?"},
        {"type": "image_url", "image_url": {"url": "https://example.com/photo.jpg"}}
      ]
    }]
  }'`,
  `import base64
from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

with open("receipt.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

resp = client.chat.completions.create(
    model="seed-2.1-turbo",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Extract the total from this receipt."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ],
    }],
)
print(resp.choices[0].message.content)`,
  `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

const resp = await client.chat.completions.create({
  model: "seed-2.1-turbo",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What is in this picture?" },
        { type: "image_url", image_url: { url: "https://example.com/photo.jpg" } },
      ],
    },
  ],
});
console.log(resp.choices[0].message.content);`,
);

export const TOOLS = tabs(
  `curl {{BASE_URL}}/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.8-27b",
    "messages": [{"role": "user", "content": "Do I need an umbrella in Lahore today?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Current weather for a city",
        "parameters": {
          "type": "object",
          "properties": {"city": {"type": "string"}},
          "required": ["city"]
        }
      }
    }]
  }'`,
  `import json
from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Current weather for a city",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    },
}]

messages = [{"role": "user", "content": "Do I need an umbrella in Lahore today?"}]
first = client.chat.completions.create(model="qwen3.8-27b", messages=messages, tools=tools)

call = first.choices[0].message.tool_calls[0]
args = json.loads(call.function.arguments)  # {"city": "Lahore"}

messages.append(first.choices[0].message)
messages.append({
    "role": "tool",
    "tool_call_id": call.id,
    "content": json.dumps({"city": args["city"], "rain_chance": 0.7}),
})

final = client.chat.completions.create(model="qwen3.8-27b", messages=messages, tools=tools)
print(final.choices[0].message.content)`,
  `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Current weather for a city",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  },
];

const messages = [{ role: "user", content: "Do I need an umbrella in Lahore today?" }];
const first = await client.chat.completions.create({ model: "qwen3.8-27b", messages, tools });

const call = first.choices[0].message.tool_calls[0];
const args = JSON.parse(call.function.arguments); // { city: "Lahore" }

messages.push(first.choices[0].message);
messages.push({
  role: "tool",
  tool_call_id: call.id,
  content: JSON.stringify({ city: args.city, rain_chance: 0.7 }),
});

const final = await client.chat.completions.create({ model: "qwen3.8-27b", messages, tools });
console.log(final.choices[0].message.content);`,
);

export const TOOL_CALL_RESPONSE = `{
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_7Yx…",
            "type": "function",
            "function": { "name": "get_weather", "arguments": "{\\"city\\":\\"Lahore\\"}" }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}`;

export const EMBEDDINGS = tabs(
  `curl {{BASE_URL}}/embeddings \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "fz-embed-v1",
    "input": ["The quick brown fox", "jumps over the lazy dog"]
  }'`,
  `from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

resp = client.embeddings.create(
    model="fz-embed-v1",
    input=["The quick brown fox", "jumps over the lazy dog"],
)
vectors = [d.embedding for d in resp.data]
print(len(vectors), "vectors of", len(vectors[0]), "dimensions")`,
  `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

const resp = await client.embeddings.create({
  model: "fz-embed-v1",
  input: ["The quick brown fox", "jumps over the lazy dog"],
});
const vectors = resp.data.map((d) => d.embedding);
console.log(vectors.length, "vectors of", vectors[0].length, "dimensions");`,
);

export const EMBEDDINGS_RESPONSE = `{
  "object": "list",
  "data": [
    { "object": "embedding", "index": 0, "embedding": [0.0123, -0.0456, …] },
    { "object": "embedding", "index": 1, "embedding": [0.0311, 0.0094, …] }
  ],
  "model": "fz-embed-v1",
  "usage": { "prompt_tokens": 10, "total_tokens": 10 }
}`;

export const IMAGES = tabs(
  `curl {{BASE_URL}}/images/generations \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "sunburst-2.5",
    "prompt": "A lighthouse on a cliff at dusk, volumetric fog",
    "n": 2,
    "aspect_ratio": "16:9",
    "quality": "2K",
    "style": "cinematic"
  }'`,
  `from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

# OpenAI-style size
img = client.images.generate(
    model="sunburst-2.5",
    prompt="A lighthouse on a cliff at dusk, volumetric fog",
    n=1,
    size="1024x1024",
)
print(img.data[0].url)

# Aspect ratio + quality tier + style preset
img = client.images.generate(
    model="sunburst-2.5",
    prompt="A lighthouse on a cliff at dusk, volumetric fog",
    n=2,
    extra_body={"aspect_ratio": "16:9", "quality": "2K", "style": "cinematic"},
)`,
  `import fs from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

const img = await client.images.generate({
  model: "sunburst-2.5",
  prompt: "A lighthouse on a cliff at dusk, volumetric fog",
  n: 1,
  size: "1024x1024",
  response_format: "b64_json",
});

fs.writeFileSync("lighthouse.png", Buffer.from(img.data[0].b64_json, "base64"));`,
);

export const IMAGE_EDITS = tabs(
  `curl {{BASE_URL}}/images/edits \\
  -H "Authorization: Bearer $API_KEY" \\
  -F model="sunburst-2.5" \\
  -F prompt="Same scene, but in heavy snowfall" \\
  -F image="@lighthouse.png" \\
  -F n=1 \\
  -F size="1024x1024"`,
  `from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

img = client.images.edit(
    model="sunburst-2.5",
    image=open("lighthouse.png", "rb"),
    prompt="Same scene, but in heavy snowfall",
    n=1,
    size="1024x1024",
)
print(img.data[0].url)`,
  `import fs from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

const img = await client.images.edit({
  model: "sunburst-2.5",
  image: fs.createReadStream("lighthouse.png"),
  prompt: "Same scene, but in heavy snowfall",
  n: 1,
  size: "1024x1024",
});
console.log(img.data[0].url);`,
);

export const IMAGES_RESPONSE = `{
  "created": 1763116800,
  "data": [
    { "url": "{{ORIGIN}}/files/…/a1b2c3.png" },
    { "url": "{{ORIGIN}}/files/…/d4e5f6.png" }
  ]
}`;

export const MODELS = tabs(
  `curl {{BASE_URL}}/models \\
  -H "Authorization: Bearer $API_KEY"

# a single model
curl {{BASE_URL}}/models/deepseek-v4.1-flash \\
  -H "Authorization: Bearer $API_KEY"`,
  `from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

for m in client.models.list():
    extra = m.model_extra or {}
    print(m.id, extra.get("type"), extra.get("available_on_your_plan"))`,
  `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

const models = await client.models.list();
for (const m of models.data) console.log(m.id, m.type, m.available_on_your_plan);`,
);

export const MODELS_RESPONSE = `{
  "object": "list",
  "data": [
    {
      "id": "deepseek-v4.1-flash",
      "object": "model",
      "created": 1763116800,
      "owned_by": "DeepSeek",
      "name": "DeepSeek V4.1 Flash",
      "type": "chat",
      "capabilities": ["reasoning", "vision", "tools", "streaming", "json"],
      "context_length": 1000000,
      "max_output_tokens": 65536,
      "available_on_your_plan": true
    }
  ]
}`;

export const RATE_LIMIT_RESPONSE = `HTTP/1.1 429 Too Many Requests
x-ratelimit-limit-requests: 60
x-ratelimit-remaining-requests: 0
x-ratelimit-reset-requests: 12s
retry-after: 12

{
  "error": {
    "message": "Rate limit reached: 60 requests per minute. Upgrade your plan for higher limits.",
    "type": "rate_limit_error",
    "param": null,
    "code": "rate_limit_exceeded"
  }
}`;

export const RETRY: SampleTab[] = [
  {
    id: "python",
    label: "Python",
    lang: "python",
    code: `import time
import openai
from openai import OpenAI

client = OpenAI(base_url="{{BASE_URL}}", api_key="{{KEY_PREFIX}}...")

def create_with_retry(**kwargs):
    for attempt in range(5):
        try:
            return client.chat.completions.create(**kwargs)
        except openai.RateLimitError as e:
            if e.code != "rate_limit_exceeded":
                raise  # out of tokens or a key limit: retrying won't help
            wait = float(e.response.headers.get("retry-after", 2 ** attempt))
            time.sleep(wait)
    raise RuntimeError("Still rate limited after 5 attempts")`,
  },
  {
    id: "node",
    label: "Node.js",
    lang: "js",
    code: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{BASE_URL}}", apiKey: process.env.API_KEY });

async function createWithRetry(body, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await client.chat.completions.create(body);
    } catch (err) {
      if (err.status !== 429 || err.code !== "rate_limit_exceeded") throw err;
      const h = err.headers; // Headers (SDK v5) or a plain object (v4)
      const retryAfter = typeof h?.get === "function" ? h.get("retry-after") : h?.["retry-after"];
      const wait = Number(retryAfter ?? 2 ** i);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  throw new Error("Still rate limited after retries");
}`,
  },
];

export const ERROR_SHAPE = `{
  "error": {
    "message": "This API key is missing the 'images' scope.",
    "type": "permission_error",
    "param": null,
    "code": "missing_scope"
  }
}`;
