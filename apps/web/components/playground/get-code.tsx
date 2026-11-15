"use client";

import { Dialog } from "@/components/ui/overlay";
import { CodeTabs, type Snippet } from "@/components/code-tabs";
import { API_BASE_URL } from "@/lib/utils";
import type { Msg, Params } from "./types";

/** Reproduces the visible conversation + parameters as an API request. */
export function GetCodeDialog({ open, onOpenChange, model, params, messages }: { open: boolean; onOpenChange: (o: boolean) => void; model: string; params: Params; messages: Msg[] }) {
  const base = API_BASE_URL;
  const msgs: { role: string; content: string }[] = [
    ...(params.system ? [{ role: "system", content: params.system }] : []),
    ...messages.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content })),
  ];
  if (!msgs.some((m) => m.role === "user")) msgs.push({ role: "user", content: "Hello!" });

  const body: Record<string, unknown> = { model, messages: msgs, temperature: params.temperature, max_tokens: params.maxTokens, top_p: params.topP, stream: true };
  if (params.reasoningEffort) body.reasoning_effort = params.reasoningEffort;
  if (params.jsonMode) body.response_format = { type: "json_object" };
  const json = JSON.stringify(body, null, 2);

  const pyMessages = JSON.stringify(msgs, null, 4).replace(/\n/g, "\n    ");
  const pyExtra = [params.reasoningEffort ? `    reasoning_effort="${params.reasoningEffort}",` : "", params.jsonMode ? `    response_format={"type": "json_object"},` : ""].filter(Boolean);

  const snippets: Snippet[] = [
    {
      id: "curl",
      label: "curl",
      code: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${json.replace(/'/g, "'\\''")}'`,
    },
    {
      id: "python",
      label: "python",
      code: [
        "import os",
        "from openai import OpenAI",
        "",
        `client = OpenAI(base_url="${base}", api_key=os.environ["API_KEY"])`,
        "",
        "stream = client.chat.completions.create(",
        `    model="${model}",`,
        `    messages=${pyMessages},`,
        `    temperature=${params.temperature},`,
        `    max_tokens=${params.maxTokens},`,
        `    top_p=${params.topP},`,
        ...pyExtra,
        "    stream=True,",
        ")",
        "for chunk in stream:",
        '    print(chunk.choices[0].delta.content or "", end="")',
      ].join("\n"),
    },
    {
      id: "node",
      label: "node",
      code: [
        'import OpenAI from "openai";',
        "",
        `const client = new OpenAI({ baseURL: "${base}", apiKey: process.env.API_KEY });`,
        "",
        `const stream = await client.chat.completions.create(${json});`,
        'for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");',
      ].join("\n"),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Get code" description="This conversation and its parameters as an API request." size="lg">
      <CodeTabs snippets={snippets} maxHeight={460} />
    </Dialog>
  );
}
