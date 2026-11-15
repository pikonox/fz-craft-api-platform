import * as React from "react";
import Link from "next/link";
import { CircleAlert, Info, KeyRound, Lightbulb, Link2 } from "lucide-react";
import { CopyButton } from "@/components/ui/primitives";
import { API_BASE_URL, BRAND, cn, IMAGE_RETENTION_HOURS, KEY_PREFIX } from "@/lib/utils";
import { CodeBlock, CodeTabs } from "../code-block";
import { ImagePricing } from "../pricing";
import { ModelsTable } from "./live";
import * as S from "./samples";
import * as SA from "./samples-anthropic";

// ── Prose primitives ───────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-border pt-12 first:border-t-0 first:pt-0 lg:scroll-mt-24">
      <h2 id={`${id}-title`} className="group flex items-center gap-2 text-[24px] font-semibold tracking-tight sm:text-[26px]">
        <a href={`#${id}`} className="hover:underline hover:decoration-border-strong hover:underline-offset-4">
          {title}
        </a>
        <Link2 className="size-4 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </h2>
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mt-3 scroll-mt-28 text-[17px] font-semibold tracking-tight lg:scroll-mt-24">
      {id ? <a href={`#${id}`}>{children}</a> : children}
    </h3>
  );
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[15px] leading-7 text-foreground/80", className)}>{children}</p>;
}

function C({ children }: { children: React.ReactNode }) {
  const text = React.Children.toArray(children)
    .filter((c) => typeof c === "string" || typeof c === "number")
    .join("");
  // Short tokens stay on one line; long ones (URLs, JSON) may wrap so they never overflow narrow screens.
  return (
    <code
      className={cn(
        "rounded-md border border-border bg-muted px-1.5 py-px font-mono text-[12.5px] text-foreground [box-decoration-break:clone]",
        text.length > 24 ? "[overflow-wrap:anywhere]" : "whitespace-nowrap",
      )}
    >
      {children}
    </code>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-7 text-foreground/80 marker:text-subtle-foreground">{children}</ul>;
}

function Callout({ tone = "info", title, children }: { tone?: "info" | "warning" | "tip"; title?: string; children: React.ReactNode }) {
  const t = {
    info: { icon: Info, cls: "border-info/25 bg-info-soft", ic: "text-info" },
    warning: { icon: CircleAlert, cls: "border-warning/30 bg-warning-soft", ic: "text-warning" },
    tip: { icon: Lightbulb, cls: "border-accent/25 bg-accent-soft", ic: "text-accent" },
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3.5 text-[14px] leading-6", t.cls)}>
      <t.icon className={cn("mt-0.5 size-4 shrink-0", t.ic)} />
      <div className="min-w-0 text-foreground/85">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        {children}
      </div>
    </div>
  );
}

function Table({ head, rows, minWidth = 560, className }: { head: string[]; rows: React.ReactNode[][]; minWidth?: number; className?: string }) {
  return (
    <div className={cn("scrollbar-thin overflow-x-auto rounded-xl border border-border bg-card", className)}>
      <table className="w-full border-collapse text-left text-[13.5px]" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 text-[12px] font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border align-top last:border-0">
              {r.map((cell, j) => (
                <td key={j} className={cn("px-4 py-2.5", j === 0 ? "text-foreground" : "text-foreground/75")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Status = ({ code }: { code: number }) => (
  <span
    className={cn(
      "inline-flex rounded-md px-1.5 py-px font-mono text-[12px] font-semibold tabular",
      code >= 500 ? "bg-danger-soft text-danger" : code === 429 || code === 402 ? "bg-warning-soft text-warning" : code >= 400 ? "bg-info-soft text-info" : "bg-success-soft text-success",
    )}
  >
    {code}
  </span>
);

const Method = ({ m }: { m: "GET" | "POST" }) => (
  <span className={cn("inline-flex w-12 justify-center rounded-md py-px font-mono text-[11px] font-semibold", m === "GET" ? "bg-success-soft text-success" : "bg-accent-soft text-accent")}>{m}</span>
);

// ── Base URL hero box ──────────────────────────────────

function BaseUrlBox() {
  return (
    <div className="hero-surface relative overflow-hidden rounded-2xl border border-accent/30 p-5 shadow-lg shadow-accent/5 sm:p-6">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(to_left,black,transparent_70%)]" aria-hidden />
      <div className="relative">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent">Base URL</p>
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-border bg-background/80 py-2 pl-4 pr-2 backdrop-blur">
          <code className="min-w-0 flex-1 break-all font-mono text-[14.5px] font-medium text-foreground sm:text-[16px]">{API_BASE_URL}</code>
          <CopyButton value={API_BASE_URL} label="Base URL" className="shrink-0" />
        </div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background/60 px-3 py-2.5 text-[13px]">
            <KeyRound className="size-4 shrink-0 text-accent" />
            <span className="min-w-0 text-muted-foreground">
              Keys look like <code className="font-mono text-foreground">{KEY_PREFIX}…</code>
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-background/60 px-3 py-2.5 text-[13px]">
            <span className="shrink-0 text-[11.5px] font-medium text-muted-foreground">Header</span>
            <code className="min-w-0 truncate font-mono text-foreground">Authorization: Bearer {KEY_PREFIX}…</code>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Content ────────────────────────────────────────────

export function DocsContent() {
  return (
    <div className="flex flex-col gap-14">
      {/* Introduction */}
      <Section id="introduction" title="Introduction">
        <P>
          {BRAND} gives you one OpenAI-compatible REST API for chat, reasoning, vision, tool calling, embeddings and image generation across many models. If you already use an OpenAI
          SDK, switching takes two lines: set the base URL and use your {BRAND} API key. Request and response bodies, streaming and error shapes all follow the OpenAI format.
        </P>
        <BaseUrlBox />
        <Table
          head={["Method", "Endpoint", "Key scope", "What it does"]}
          minWidth={620}
          rows={[
            [<Method key="m" m="GET" />, <C key="p">/v1/models</C>, <C key="s">models:read</C>, "List the models you can call"],
            [<Method key="m" m="GET" />, <C key="p">/v1/models/{"{id}"}</C>, <C key="s">models:read</C>, "Details for one model"],
            [<Method key="m" m="POST" />, <C key="p">/v1/chat/completions</C>, <C key="s">inference</C>, "Chat, reasoning, vision and tools — streaming or not"],
            [<Method key="m" m="POST" />, <C key="p">/v1/embeddings</C>, <C key="s">embeddings</C>, "Text embeddings"],
            [<Method key="m" m="POST" />, <C key="p">/v1/images/generations</C>, <C key="s">images</C>, "Text-to-image"],
            [<Method key="m" m="POST" />, <C key="p">/v1/images/edits</C>, <C key="s">images</C>, "Image-to-image (multipart upload)"],
          ]}
        />
        <Callout tone="tip" title="Try it without code">
          Every model is also available in the{" "}
          <Link href="/dashboard/playground" className="font-medium text-accent hover:underline">
            Playground
          </Link>{" "}
          and{" "}
          <Link href="/dashboard/image-studio" className="font-medium text-accent hover:underline">
            Image Studio
          </Link>{" "}
          once you sign in.
        </Callout>
      </Section>

      {/* Authentication */}
      <Section id="authentication" title="Authentication">
        <P>
          Create a key in{" "}
          <Link href="/dashboard/api-keys" className="font-medium text-accent hover:underline">
            Dashboard → API keys
          </Link>
          . Keys start with <C>{KEY_PREFIX}</C> and are shown only once, so store them in a secret manager or an environment variable. Send the key on every request in the{" "}
          <C>Authorization</C> header as a bearer token. An <C>x-api-key</C> header is accepted too.
        </P>
        <CodeBlock code={S.AUTH_HEADERS} lang="bash" />
        <P>Each key can be locked down independently. Limits are checked before the request reaches a model:</P>
        <Table
          head={["Key setting", "Effect", "When it blocks a request"]}
          minWidth={600}
          rows={[
            ["Scopes", "Which endpoints the key may call (inference, embeddings, images, models:read)", <><Status key="s" code={403} /> <C>missing_scope</C></>],
            ["Requests per minute", "Per-key cap; can't exceed your plan's limit", <><Status key="s" code={429} /> <C>rate_limit_exceeded</C></>],
            ["Token limit", "Lifetime token budget for the key", <><Status key="s" code={429} /> <C>key_token_limit_reached</C></>],
            ["Spend limit", "Budget measured at each model's list price", <><Status key="s" code={402} /> <C>key_spend_limit_reached</C></>],
            ["Allowed models", "Restrict the key to specific model ids", <><Status key="s" code={403} /> <C>model_not_allowed</C></>],
            ["IP allowlist", "Only accept requests from these IPs", <><Status key="s" code={403} /> <C>ip_not_allowed</C></>],
            ["Expiry date", "Key stops working after this date", <><Status key="s" code={401} /> <C>key_expired</C></>],
            ["Pause / revoke", "Temporarily or permanently disable the key", <><Status key="s" code={403} /> <C>key_paused</C> · <Status key="t" code={401} /> <C>invalid_api_key</C></>],
          ]}
        />
        <Callout tone="warning" title="Keep keys on the server">
          Anyone with your key can spend your quota. Don&apos;t ship keys in browser or mobile app code — call {BRAND} from your backend, and give each app its own key with
          tight limits.
        </Callout>
      </Section>

      {/* Base URL */}
      <Section id="base-url" title="Base URL">
        <P>
          All endpoints live under <C>{API_BASE_URL}</C>. Use it as the <C>base_url</C> / <C>baseURL</C> in any OpenAI SDK, or in any framework or tool that lets you set an
          OpenAI-compatible endpoint. The SDK appends paths like <C>/chat/completions</C> for you.
        </P>
        <CodeBlock code={S.ENV_SETUP} lang="bash" title=".env / shell" />
        <CodeTabs tabs={S.CLIENT_SETUP} title="client setup" />
        <P className="text-[14px] text-muted-foreground">Every sample below is self-contained and already points at this base URL. Code tabs remember the language you pick.</P>
      </Section>

      {/* Chat completions */}
      <Section id="chat-completions" title="Chat completions">
        <P>
          <C>POST {API_BASE_URL}/chat/completions</C> generates a reply from a list of messages. It takes the standard OpenAI parameters; anything not listed below is passed through to
          the model unchanged.
        </P>
        <CodeTabs tabs={S.CHAT} title="POST /v1/chat/completions" />
        <Table
          head={["Parameter", "Type", "Notes"]}
          minWidth={560}
          rows={[
            [<C key="c">model</C>, "string, required", "A model id from /v1/models, e.g. deepseek-v4.1-flash"],
            [<C key="c">messages</C>, "array, required", "system / user / assistant / tool messages; must not be empty"],
            [<C key="c">stream</C>, "boolean", "Return server-sent events instead of one JSON body"],
            [<C key="c">stream_options</C>, "object", <span key="n">Set <C>include_usage: true</C> to get a final usage chunk</span>],
            [<C key="c">max_tokens</C>, "integer", <span key="n">Also <C>max_completion_tokens</C>. Capped at the model&apos;s maximum output</span>],
            [<C key="c">temperature</C>, "number", <span key="n">Plus <C>top_p</C>, <C>stop</C>, <C>seed</C>, penalties…</span>],
            [<C key="c">tools</C>, "array", <span key="n">Function definitions; see <a href="#tools" className="text-accent hover:underline">Tool calling</a></span>],
            [<C key="c">response_format</C>, "object", <span key="n"><C>{`{"type": "json_object"}`}</C> on models with the <C>json</C> capability</span>],
          ]}
        />
        <CodeBlock code={S.CHAT_RESPONSE} lang="json" title="200 OK" />

        <H3 id="streaming">Streaming</H3>
        <P>
          With <C>&quot;stream&quot;: true</C> the response is a <C>text/event-stream</C>. Each event is a <C>data:</C> line holding a <C>chat.completion.chunk</C>; the stream ends
          with <C>data: [DONE]</C>. Usage is only sent when you ask for it with <C>stream_options.include_usage</C> — it arrives in a final chunk with an empty <C>choices</C> array.
        </P>
        <CodeTabs tabs={S.STREAM} title="stream: true" />
        <CodeBlock code={S.STREAM_WIRE} lang="sse" title="What arrives on the wire" />
        <UL>
          <li>
            Lines starting with <C>:</C> are keep-alive comments — ignore them (the SDKs do).
          </li>
          <li>
            If the model fails mid-stream you receive one <C>{`data: {"error": {...}}`}</C> event with <C>code: &quot;upstream_error&quot;</C> and the stream closes.
          </li>
          <li>Closing the connection cancels generation; you&apos;re only billed for tokens produced so far.</li>
        </UL>
      </Section>

      {/* Reasoning */}
      <Section id="reasoning" title="Reasoning output">
        <P>
          Models with the <C>reasoning</C> capability (for example <C>deepseek-v4.1-flash</C>) think before they answer. The chain of thought is returned separately from the answer in{" "}
          <C>message.reasoning_content</C>, or as <C>delta.reasoning_content</C> chunks that arrive before <C>delta.content</C> when streaming. Show it, log it or ignore it — the final
          answer is always in <C>content</C>.
        </P>
        <CodeTabs tabs={S.REASONING} title="model: deepseek-v4.1-flash" />
        <CodeBlock code={S.REASONING_RESPONSE} lang="json" title="200 OK" />
        <Callout>
          Reasoning tokens are output tokens: they count toward your allowance and are reported in <C>usage.completion_tokens_details.reasoning_tokens</C> when the model provides it.
          Use <C>max_tokens</C> to cap them.
        </Callout>
      </Section>

      {/* Vision */}
      <Section id="vision" title="Vision input">
        <P>
          Models with the <C>vision</C> capability accept images inside a user message. Use the OpenAI content-parts format: a <C>text</C> part plus one or more <C>image_url</C> parts
          pointing at an <C>https://</C> URL or a base64 <C>data:</C> URL.
        </P>
        <CodeTabs tabs={S.VISION} title="image_url parts" />
        <UL>
          <li>
            Sending images to a model without vision returns <Status code={400} /> <C>vision_not_supported</C>.
          </li>
          <li>The JSON body may be up to 25 MB, including base64 images. Larger bodies get <Status code={413} /> <C>request_too_large</C>.</li>
          <li>Image inputs count toward input tokens, as reported by the model.</li>
        </UL>
      </Section>

      {/* Tools */}
      <Section id="tools" title="Tool calling">
        <P>
          Describe functions in <C>tools</C>. When the model wants one, the reply has <C>finish_reason: &quot;tool_calls&quot;</C> and a <C>tool_calls</C> array. Run the function, append
          the assistant message and a <C>role: &quot;tool&quot;</C> message with the matching <C>tool_call_id</C>, then call the API again. <C>tool_choice</C> and{" "}
          <C>parallel_tool_calls</C> are passed through. Look for the <C>tools</C> capability in the model list.
        </P>
        <CodeTabs tabs={S.TOOLS} title="tools" />
        <CodeBlock code={S.TOOL_CALL_RESPONSE} lang="json" title="First response" />
      </Section>

      {/* Embeddings */}
      <Section id="embeddings" title="Embeddings">
        <P>
          <C>POST {API_BASE_URL}/embeddings</C> turns text into vectors for search, clustering and RAG. <C>input</C> can be a string or an array of strings. Embedding requests count
          input tokens only, and need the <C>embeddings</C> scope.
        </P>
        <CodeTabs tabs={S.EMBEDDINGS} title="POST /v1/embeddings" />
        <CodeBlock code={S.EMBEDDINGS_RESPONSE} lang="json" title="200 OK" />
      </Section>

      {/* Images */}
      <Section id="images" title="Image generation & edits">
        <P>
          <C>POST {API_BASE_URL}/images/generations</C> creates images from a prompt; <C>POST {API_BASE_URL}/images/edits</C> transforms an uploaded image. Both need the{" "}
          <C>images</C> scope and are paid per image from your separate <strong className="font-semibold text-foreground">image wallet</strong>, not from your token allowance.
        </P>
        <Table
          head={["Parameter", "Values", "Notes"]}
          minWidth={600}
          rows={[
            [<C key="c">model</C>, "image model id", "e.g. sunburst-2.5"],
            [<C key="c">prompt</C>, "string, required", "Up to 4,000 characters"],
            [<C key="c">n</C>, "1 – 4", "Default 1"],
            [<C key="c">size</C>, <C key="v">WxH</C>, "e.g. 1024x1024. Quality tier follows the long side: ≤ 1536 → 1K, ≤ 2560 → 2K, larger → 4K. Overrides aspect_ratio / quality"],
            [<C key="c">aspect_ratio</C>, "1:1 · 16:9 · 9:16 · 3:2 · 2:3 · 4:3 · 3:4", "Default 1:1 (generations only)"],
            [<C key="c">quality</C>, "1K · 2K · 4K", "Long side 1024 / 2048 / 3840 px. Default 1K (generations only)"],
            [<C key="c">style</C>, "none · photoreal · cinematic · anime · 3d · neon · fantasy · watercolor · product · logo · pixel", "Appends a style preset to the prompt (generations only)"],
            [<C key="c">response_format</C>, "url · b64_json", `Default url. URLs stop working after ${IMAGE_RETENTION_HOURS} hours`],
            [<C key="c">image</C>, "file (edits only)", "PNG, JPG, WEBP or GIF, up to 10 MB, sent as multipart/form-data"],
          ]}
        />
        <H3>Generate</H3>
        <CodeTabs tabs={S.IMAGES} title="POST /v1/images/generations" />
        <H3>Edit</H3>
        <CodeTabs tabs={S.IMAGE_EDITS} title="POST /v1/images/edits" />
        <CodeBlock code={S.IMAGES_RESPONSE} lang="json" title="200 OK" />
        <Callout tone="warning" title={`Images are kept for ${IMAGE_RETENTION_HOURS} hours`}>
          Generated images, and their entries in Image Studio history, are deleted automatically {IMAGE_RETENTION_HOURS} hours after they are created. Download anything you want to
          keep, or request <C>response_format: &quot;b64_json&quot;</C> to receive the image bytes directly. Your billing and usage history are not affected.
        </Callout>
        <H3>Pricing &amp; wallet</H3>
        <P>
          The price of <C>n</C> images at the requested quality is held from the image wallet when the request starts. You&apos;re charged only for images that come back; the rest is
          returned straight away. If the wallet can&apos;t cover the hold, the request fails with <Status code={402} /> <C>insufficient_image_balance</C> — top up the image wallet from
          Billing.
        </P>
        <ImagePricing />
      </Section>

      {/* Models */}
      <Section id="models" title="Models list">
        <P>
          <C>GET {API_BASE_URL}/models</C> lists every enabled model with its type, capabilities, context length and whether your current plan can use it (
          <C>available_on_your_plan</C>). Calling a model your plan doesn&apos;t include returns <Status code={403} /> <C>model_not_in_plan</C>.
        </P>
        <CodeTabs tabs={S.MODELS} title="GET /v1/models" />
        <CodeBlock code={S.MODELS_RESPONSE} lang="json" title="200 OK" />
        <H3>Available right now</H3>
        <ModelsTable />
      </Section>

      {/* Anthropic Messages */}
      <Section id="anthropic" title="Anthropic Messages API">
        <P>
          <C>POST {API_BASE_URL}/messages</C> speaks Anthropic&apos;s Messages format, so the official Anthropic SDKs and tools built on them — like Claude Code — work with the same
          key. It isn&apos;t limited to Claude: <strong className="font-semibold text-foreground">every chat model in the catalog</strong> can be called this way, and every OpenAI model can
          be called through <C>/chat/completions</C>.
        </P>
        <Table
          head={["Feature", "Support"]}
          minWidth={480}
          rows={[
            ["Auth", <span key="a">Send your key as <C>x-api-key</C> or <C>Authorization: Bearer</C>. The <C>anthropic-version</C> header is accepted.</span>],
            ["Text, system prompts, images", "Supported (images need a vision model)"],
            ["Streaming", "Full event stream: message_start, content_block_*, message_delta, message_stop"],
            ["Tool use", "Custom tools, tool_choice, tool_result and parallel calls. Anthropic server tools (web search, code execution) are ignored."],
            ["Extended thinking", <span key="t"><C>thinking</C> maps to the model&apos;s reasoning effort; reasoning comes back as thinking blocks</span>],
            ["Token counting", <span key="c"><C>POST /v1/messages/count_tokens</C> returns an estimate and isn&apos;t billed</span>],
            ["Model names", <span key="m">Catalog ids, plus Anthropic-style aliases such as <C>claude-sonnet-5-5-20261101</C> → <C>claude-sonnet-5-5</C></span>],
          ]}
        />
        <CodeTabs tabs={SA.MESSAGES} title="POST /v1/messages" />
        <CodeBlock code={SA.MESSAGES_RESPONSE} lang="json" title="200 OK" />
        <H3>Streaming</H3>
        <P>
          Set <C>&quot;stream&quot;: true</C> to receive Anthropic server-sent events. Errors use Anthropic&apos;s shape: <C>{`{"type":"error","error":{"type":"rate_limit_error","message":"…"}}`}</C>.
        </P>
        <CodeBlock code={SA.MESSAGES_STREAM} lang="sse" title="event stream" />
      </Section>

      {/* Claude Code */}
      <Section id="claude-code" title="Claude Code">
        <P>
          Point Claude Code at {BRAND} with two environment variables, then pick the models it should use. The base URL is the site address — <strong className="font-semibold text-foreground">without</strong>{" "}
          <C>/v1</C>, because Claude Code adds it.
        </P>
        <CodeTabs tabs={SA.CLAUDE_CODE} title="Claude Code setup" />
        <Callout tone="tip" title="Choosing models">
          <C>ANTHROPIC_MODEL</C> is the main model. Claude Code also sends small background requests (titles, summaries) to the &quot;haiku&quot; model — set{" "}
          <C>ANTHROPIC_DEFAULT_HAIKU_MODEL</C> to a fast, cheap model so they don&apos;t use a model that&apos;s under maintenance. Any chat model works, including non-Claude ones like{" "}
          <C>deepseek-v4.1-flash</C>. On the Free plan, use the free models (<C>deepseek-v4.1-flash</C> and <C>glm-5.3</C>) for all of them.
        </Callout>
        <H3>Other coding tools</H3>
        <P>
          Cursor, Cline, Roo Code, Kilo Code, opencode and most other tools have an &quot;OpenAI-compatible&quot; provider option. Choose it, then enter:
        </P>
        <Table
          head={["Setting", "Value"]}
          minWidth={420}
          rows={[
            ["Base URL", <C key="b">{API_BASE_URL}</C>],
            ["API key", <C key="k">{KEY_PREFIX}…</C>],
            ["Model", <span key="m">Any model id from the <Link href="/models" className="text-accent hover:underline">catalog</Link>, e.g. <C>claude-sonnet-5-5</C></span>],
          ]}
        />
      </Section>

      {/* Rate limits */}
      <Section id="rate-limits" title="Rate limits & quotas">
        <P>
          Requests are limited per minute (a sliding 60-second window). Your plan sets the limit for the whole account; a key can have a lower cap of its own. Every response carries
          the current state in headers:
        </P>
        <Table
          head={["Header", "Meaning"]}
          minWidth={480}
          rows={[
            [<C key="h">x-ratelimit-limit-requests</C>, "Requests allowed per minute for this key (the tighter of key and plan)"],
            [<C key="h">x-ratelimit-remaining-requests</C>, "Requests left in the current window"],
            [<C key="h">x-ratelimit-reset-requests</C>, <span key="v">Time until a slot frees up, e.g. <C>12s</C></span>],
            [<C key="h">retry-after</C>, "Seconds to wait — sent with 429 rate-limit errors"],
          ]}
        />
        <P>Separately from speed limits, usage is capped by quota:</P>
        <Table
          head={["Limit", "Applies to", "Response when reached"]}
          minWidth={560}
          rows={[
            ["Requests per minute", "Account and key", <><Status key="s" code={429} /> <C>rate_limit_exceeded</C></>],
            ["Token allowance (plan + pass + bonus)", "Account", <><Status key="s" code={429} /> <C>insufficient_quota</C></>],
            ["Key token limit", "One key", <><Status key="s" code={429} /> <C>key_token_limit_reached</C></>],
            ["Key spend limit", "One key", <><Status key="s" code={402} /> <C>key_spend_limit_reached</C></>],
            ["Image wallet balance", "Account (images only)", <><Status key="s" code={402} /> <C>insufficient_image_balance</C></>],
          ]}
        />
        <Callout tone="tip" title="429 vs 402">
          <span className="block">
            <strong className="font-semibold">429</strong> means slow down <em>or</em> you&apos;re out of tokens — check <C>error.code</C>. Only <C>rate_limit_exceeded</C> is worth
            retrying (after <C>retry-after</C>); <C>insufficient_quota</C> needs a bigger plan or a 24h pass.
          </span>
          <span className="mt-1.5 block">
            <strong className="font-semibold">402</strong> is about money: the key&apos;s spend cap or the image wallet. Retrying won&apos;t help until you raise the cap or top up.
          </span>
        </Callout>
        <CodeBlock code={S.RATE_LIMIT_RESPONSE} lang="http" title="429 Too Many Requests" />
        <CodeTabs tabs={S.RETRY} title="retry with backoff" />
        <P className="text-[14px] text-muted-foreground">The official SDKs also retry 429 and 5xx responses a couple of times by default; the helper above adds rate-limit-aware waits.</P>
      </Section>

      {/* Errors */}
      <Section id="errors" title="Errors">
        <P>
          Errors use the OpenAI shape, so SDK exception types work unchanged. <C>type</C> is the broad category, <C>code</C> the specific reason, and <C>param</C> names the offending
          field when there is one.
        </P>
        <CodeBlock code={S.ERROR_SHAPE} lang="json" title="Error body" />
        <Table
          head={["Status", "Type", "Code", "Meaning"]}
          minWidth={720}
          rows={ERRORS.map(([s, type, code, meaning]) => [<Status key="s" code={s} />, <C key="t">{type}</C>, <C key="c">{code}</C>, meaning])}
        />
        <P className="text-[14px] text-muted-foreground">
          If the model itself rejects a request (for example the prompt exceeds its context window), you get its 4xx status and message with the same error shape.
        </P>
      </Section>

      {/* Billing */}
      <Section id="billing" title="Billing">
        <P>
          Token usage is covered by plans instead of per-request charges. See current prices on the{" "}
          <Link href="/pricing" className="font-medium text-accent hover:underline">
            pricing page
          </Link>
          .
        </P>
        <UL>
          <li>
            <strong className="font-semibold text-foreground">Plans</strong> — every account has one monthly plan (Free by default). It includes a token allowance that refreshes every 30
            days, a requests-per-minute limit and a model access level (free models, all models, or all models plus early access). Paid plans are billed monthly or yearly; yearly plans
            still refresh tokens every 30 days.
          </li>
          <li>
            <strong className="font-semibold text-foreground">What counts</strong> — input tokens + output tokens (including reasoning). Cached input tokens count at 10%. Embeddings count
            input tokens only.
          </li>
          <li>
            <strong className="font-semibold text-foreground">24h passes</strong> — for accounts on the Free plan: a block of tokens for 24 hours with no subscription. Pass tokens are
            used first, then the free allowance, then bonus tokens from rewards. While a pass is active you get its higher rate limit and model access. Passes can&apos;t be added to an
            active paid monthly plan — upgrade the plan instead.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Balance</strong> — your main USD balance pays for plans and passes, and for auto-renewal when a term ends. If auto-renew is off
            or the balance is too low, you drop back to Free.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Image wallet</strong> — a separate balance used only for images, charged per image by model and quality tier.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Changes &amp; refunds</strong> — upgrading credits the unused part of your current paid plan. Your first paid monthly plan can
            be refunded to your balance within 24 hours.
          </li>
        </UL>
      </Section>

      {/* Payments */}
      <Section id="payments" title="Payments">
        <P>
          Add funds from{" "}
          <Link href="/dashboard/billing/balance" className="font-medium text-accent hover:underline">
            Billing → Balance
          </Link>
          . A payment can top up your main balance, top up the image wallet, or pay for a plan directly.
        </P>
        <Table
          head={["Method", "Currency", "Verification", "You submit"]}
          minWidth={600}
          rows={[
            ["Binance Pay", "USDT", <span key="v" className="font-medium text-success">Automatic</span>, "Binance Pay order ID"],
            ["USDT · BEP-20 (BNB Smart Chain)", "USDT", <span key="v" className="font-medium text-success">Automatic, on-chain</span>, "Transaction hash"],
            ["JazzCash", "PKR", <span key="v" className="font-medium text-warning">Manual review</span>, "Screenshot + TID"],
            ["Easypaisa", "PKR", <span key="v" className="font-medium text-warning">Manual review</span>, "Screenshot + transaction ID"],
            ["Bank transfer (IBFT / RAAST)", "PKR", <span key="v" className="font-medium text-warning">Manual review</span>, "Receipt + reference number"],
          ]}
        />
        <UL>
          <li>
            <strong className="font-semibold text-foreground">Binance Pay and BEP-20</strong> are verified automatically. For on-chain transfers, send the exact amount shown at checkout,
            including the cents — it ties your transfer to your order. Credit lands once the transaction is confirmed.
          </li>
          <li>
            <strong className="font-semibold text-foreground">JazzCash, Easypaisa and bank transfer</strong> are paid in PKR at the rate shown at checkout, then reviewed by our team.
            You&apos;re notified when the payment is approved or rejected.
          </li>
          <li>Unpaid orders expire — after 2 hours for automatic methods and 72 hours for manual ones. Minimum amounts are shown at checkout.</li>
        </UL>
      </Section>

      {/* Terms */}
      <Section id="terms" title="Terms">
        <Callout>
          This is a short summary. The binding versions are the <Link href="/legal/terms">Terms of Service</Link>, <Link href="/legal/privacy">Privacy Policy</Link>,{" "}
          <Link href="/legal/refunds">Refund Policy</Link> and <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>.
        </Callout>
        <UL>
          <li>Use the API lawfully, follow the usage policies of the models you call, and don&apos;t use it to build abusive, deceptive or harmful products.</li>
          <li>You&apos;re responsible for your API keys and for all usage made with them. Don&apos;t share or resell keys.</li>
          <li>Service is provided as-is. We aim for high availability but don&apos;t guarantee uptime, and model availability can change.</li>
          <li>Payments buy plans, passes and wallet credit. They&apos;re non-refundable except as described under Billing.</li>
          <li>We may suspend accounts that break these terms or harm the service. We may update these terms and will note changes here.</li>
        </UL>
      </Section>
    </div>
  );
}

const ERRORS: [number, string, string, string][] = [
  [400, "invalid_request_error", "missing_model", "The model parameter is missing"],
  [400, "invalid_request_error", "invalid_value", "A field is missing or invalid (messages, input, prompt, image…); see param"],
  [400, "invalid_request_error", "invalid_json", "The body isn't valid JSON"],
  [400, "invalid_request_error", "wrong_model_type", "Model type doesn't match the endpoint (e.g. an image model on chat)"],
  [400, "invalid_request_error", "vision_not_supported", "Image input sent to a model without vision"],
  [401, "invalid_request_error", "missing_api_key", "No key in Authorization or x-api-key"],
  [401, "invalid_request_error", "invalid_api_key", "The key is wrong or has been revoked"],
  [401, "invalid_request_error", "key_expired", "The key is past its expiry date"],
  [402, "insufficient_quota", "key_spend_limit_reached", "The key reached its spend limit"],
  [402, "insufficient_quota", "insufficient_image_balance", "The image wallet can't cover the requested images"],
  [403, "permission_error", "key_paused", "The key is paused — resume it in the dashboard"],
  [403, "permission_error", "ip_not_allowed", "The caller's IP isn't on the key's allowlist"],
  [403, "permission_error", "missing_scope", "The key lacks the scope this endpoint needs"],
  [403, "permission_error", "model_not_in_plan", "The model needs a paid plan or the top plan"],
  [403, "permission_error", "model_not_allowed", "The model isn't on the key's allowed list"],
  [403, "permission_error", "account_suspended", "The account is suspended"],
  [403, "permission_error", "telegram_verification_required", "The free tier needs a verified Telegram account (when enabled)"],
  [404, "invalid_request_error", "model_not_found", "Unknown or disabled model id"],
  [404, "invalid_request_error", "unknown_url", "No such endpoint"],
  [413, "invalid_request_error", "request_too_large", "Body larger than 25 MB"],
  [429, "rate_limit_error", "rate_limit_exceeded", "Too many requests this minute — wait for retry-after"],
  [429, "insufficient_quota", "insufficient_quota", "Token allowance used up for this cycle"],
  [429, "insufficient_quota", "key_token_limit_reached", "The key reached its token limit"],
  [500, "server_error", "internal_error", "Unexpected error on our side — safe to retry"],
  [502, "server_error", "upstream_unavailable", "Every provider for this model failed — retry shortly"],
  [502, "server_error", "bad_upstream_response", "The provider returned an unreadable response"],
  [502, "server_error", "no_images", "The provider returned no images — you weren't charged"],
  [503, "server_error", "no_upstream", "The model has no provider configured right now"],
];
