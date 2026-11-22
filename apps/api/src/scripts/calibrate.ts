/**
 * How does the upstream (FreeModel.in) count tokens? It has no usage API, so this sends a few
 * measured requests straight to it and you type in the "Billed tokens" figure from its dashboard
 * before and after. It then compares that with the usage the upstream reports and with how
 * FZ-craft counts tokens for customers (cached input at 10%).
 *
 *   pnpm calibrate gpt-5.5                        (from the repo root)
 *   pnpm calibrate gpt-5.5 --size 20000 --runs 3  (prompt size in tokens, requests per step)
 *   pnpm calibrate gpt-5.5 --provider upstream    (provider slug; default: upstream)
 *
 * It uses about runs × size × 2 tokens of your upstream plan (3 × 20k × 2 ≈ 120k by default).
 * Nothing is written to the database.
 */
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { stdin, stdout } from "node:process";
import { connectDb, disconnectDb } from "../db/connect";
import { Provider, ProviderKey } from "../db/models";
import { decrypt } from "../lib/crypto";
import { CACHED_TOKEN_WEIGHT } from "../gateway/usage";

type Usage = { prompt: number; cached: number; completion: number; reasoning: number };

const args = process.argv.slice(2);
const flag = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const model = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const size = Math.max(2_000, Math.min(200_000, Number(flag("size", "20000")) || 20_000));
const runs = Math.max(1, Math.min(10, Number(flag("runs", "3")) || 3));
const providerSlug = flag("provider", "upstream");

const M = 1_000_000;
const fmt = (n: number) => (Math.abs(n) >= M ? `${(n / M).toFixed(3)}M` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const say = (s = "") => stdout.write(`${s}\n`);

/** Accepts 1234567, 1,234,567, 1.23M, 523.4K. */
function parseCount(s: string): number | null {
  const m = s.trim().replace(/,/g, "").match(/^([\d.]+)\s*([kKmMbB]?)$/);
  if (!m) return null;
  const n = Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as "k" | "m" | "b"] ?? 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Roughly `tokens` tokens of varied text. The nonce goes first so a new nonce defeats prompt caching. */
function buildPrompt(nonce: string, tokens: number) {
  const words = ["river", "copper", "lantern", "orbit", "maple", "signal", "harbor", "velvet", "quartz", "meadow", "falcon", "ember", "glacier", "prism", "cedar", "nebula"];
  const lines = [`Reference ${nonce}. Read the notes below, then reply with only the word OK.`];
  let i = 0;
  // ~15 tokens per line
  while (lines.length * 15 < tokens) {
    lines.push(`Note ${i}: ${words[i % 16]} ${words[(i * 7) % 16]} ${words[(i * 11) % 16]} ${(i * 7919) % 10007} ${words[(i * 5) % 16]}.`);
    i++;
  }
  lines.push("Reply with only the word OK.");
  return lines.join("\n");
}

async function send(baseUrl: string, key: string, prompt: string): Promise<Usage> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 16, stream: false }),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  const u = (JSON.parse(text).usage ?? {}) as Record<string, any>;
  return {
    prompt: u.prompt_tokens ?? u.input_tokens ?? 0,
    cached: u.prompt_tokens_details?.cached_tokens ?? u.cache_read_input_tokens ?? 0,
    completion: u.completion_tokens ?? u.output_tokens ?? 0,
    reasoning: u.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

const sum = (list: Usage[]) => list.reduce((a, u) => ({ prompt: a.prompt + u.prompt, cached: a.cached + u.cached, completion: a.completion + u.completion, reasoning: a.reasoning + u.reasoning }), { prompt: 0, cached: 0, completion: 0, reasoning: 0 });
/** What a customer is charged for this usage on FZ-craft (gateway/usage.ts billedTokens). */
const ours = (u: Usage) => Math.max(0, u.prompt - u.cached) + Math.ceil(u.cached * CACHED_TOKEN_WEIGHT) + u.completion;

async function main() {
  if (!model) {
    say("Usage: pnpm calibrate <model-id> [--size 20000] [--runs 3] [--provider upstream]");
    say("Example: pnpm calibrate gpt-5.5");
    process.exit(1);
  }
  await connectDb();
  const provider = await Provider.findOne({ slug: providerSlug }).lean();
  if (!provider) throw new Error(`No provider with slug "${providerSlug}"`);
  const keyDoc = await ProviderKey.findOne({ providerId: provider._id, status: "active" }).lean();
  if (!keyDoc) throw new Error(`Provider "${provider.name}" has no active key`);
  const key = decrypt(keyDoc.keyEnc);
  await disconnectDb();

  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (q: string) => {
    for (;;) {
      const n = parseCount(await rl.question(q));
      if (n !== null) return n;
      say("  Please type a number like 1234567 or 1.23M");
    }
  };

  say(`\nMeasuring how ${provider.name} counts tokens for "${model}" (key …${keyDoc.last4}).`);
  say(`Each step sends ${runs} requests of about ${fmt(size)} tokens: roughly ${fmt(runs * size * 2)} in total.\n`);
  say(`Open ${provider.name}'s dashboard and find "Billed tokens" (or total tokens used).`);
  const b0 = await ask("1) Billed tokens right now: ");

  say(`\nStep 1/2: ${runs} different prompts (nothing can be cached)…`);
  const fresh: Usage[] = [];
  for (let i = 0; i < runs; i++) {
    const u = await send(provider.baseUrl, key, buildPrompt(randomBytes(6).toString("hex"), size));
    fresh.push(u);
    say(`  request ${i + 1}: input ${fmt(u.prompt)} (cached ${fmt(u.cached)}) · output ${fmt(u.completion)}${u.reasoning ? ` (reasoning ${fmt(u.reasoning)})` : ""}`);
  }
  say("\nWait about a minute, then refresh the dashboard until the number stops changing.");
  const b1 = await ask("2) Billed tokens now: ");

  say(`\nStep 2/2: the same prompt ${runs} times (the provider may cache it)…`);
  const same = buildPrompt(randomBytes(6).toString("hex"), size);
  const repeat: Usage[] = [];
  for (let i = 0; i < runs; i++) {
    const u = await send(provider.baseUrl, key, same);
    repeat.push(u);
    say(`  request ${i + 1}: input ${fmt(u.prompt)} (cached ${fmt(u.cached)}) · output ${fmt(u.completion)}${u.reasoning ? ` (reasoning ${fmt(u.reasoning)})` : ""}`);
  }
  say("\nWait about a minute again and refresh.");
  const b2 = await ask("3) Billed tokens now: ");
  rl.close();

  // ── Results ──
  const s1 = sum(fresh);
  const s2 = sum(repeat);
  const billed1 = b1 - b0;
  const billed2 = b2 - b1;
  const reported1 = s1.prompt + s1.completion;
  const ratio = reported1 ? billed1 / reported1 : 0;

  say(`\n━━━ Results for ${model} ━━━`);
  say(`Step 1 (no cache): ${provider.name} reported ${fmt(reported1)} tokens and its dashboard went up ${fmt(billed1)}.`);
  say(`  → ${provider.name} bills ${(ratio * 100).toFixed(0)}% of the tokens it reports${Math.abs(ratio - 1) <= 0.05 ? " (the same, good)" : ""}.`);
  say(`  FZ-craft would charge a customer ${fmt(ours(s1))} for this.`);

  say(`\nStep 2 (same prompt): ${fmt(s2.cached)} of ${fmt(s2.prompt)} input tokens came from the cache; dashboard went up ${fmt(billed2)}.`);
  let weight: number | null = null;
  if (s2.cached < s2.prompt * 0.2) {
    say(`  This model hardly used the cache, so this step can't tell how ${provider.name} bills cached tokens. Try another model.`);
  } else if (ratio > 0) {
    // Undo any flat multiplier from step 1, then find the cached-token weight that explains the bill
    const adj = billed2 / ratio;
    weight = Math.max(0, Math.min(1, (adj - (s2.prompt - s2.cached) - s2.completion) / s2.cached));
    say(`  → ${provider.name} bills cached input at about ${(weight * 100).toFixed(0)}% of a normal token. FZ-craft counts it at ${(CACHED_TOKEN_WEIGHT * 100).toFixed(0)}%.`);
    say(`  FZ-craft would charge a customer ${fmt(ours(s2))} for this step; ${provider.name} billed you ${fmt(billed2)}.`);
  }

  say("\n━━━ What it means ━━━");
  const avg = (b: number, n: number) => (n ? b / n : 0);
  say(`One ${fmt(size)}-token request costs you ${fmt(avg(billed1, runs))} on ${provider.name} when nothing is cached${weight !== null ? ` and ${fmt(avg(billed2, runs))} when it is` : ""}.`);
  say(`So 1M ${provider.name} tokens ≈ ${Math.round(M / Math.max(1, avg(billed1, runs)))} such requests${weight !== null ? ` (${Math.round(M / Math.max(1, avg(billed2, runs)))} with caching)` : ""}.`);
  const mismatch = Math.abs(ratio - 1) > 0.05 || (weight !== null && Math.abs(weight - CACHED_TOKEN_WEIGHT) > 0.1);
  say(
    mismatch
      ? `\n⚠ ${provider.name} counts differently from FZ-craft, so customers' plans would drain slower than yours. Send these results to Claude to adjust the counting.`
      : `\n✓ ${provider.name} counts tokens the same way as FZ-craft. Nothing to change.`,
  );
}

main().catch(async (err) => {
  say(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
