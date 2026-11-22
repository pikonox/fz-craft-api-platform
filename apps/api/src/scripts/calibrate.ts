/**
 * Does FZ-craft count tokens exactly like the upstream (FreeModel.in) bills them?
 *
 * FreeModel reports the plan's tokens left on every response (`x-ratelimit-remaining-tokens`, the
 * value *before* that request), so the drop between two responses is exactly what one request
 * cost. This sends, per model, one short thinking question and the same ~4k-token prompt twice
 * (to exercise reasoning and cached tokens), and compares FreeModel's charge with what FZ-craft's
 * own billing code (normalizeUsage + billedTokens) charges a customer.
 *
 *   pnpm calibrate                         (the models customers use most)
 *   pnpm calibrate gpt-5.5 kimi-k3         (just these)
 *   pnpm calibrate --provider upstream     (provider slug; default: upstream)
 *
 * Uses roughly 10k upstream tokens per model. Nothing is written to the database.
 * Last run (2026-11-22, 12 models): every model matched at 100.0% (±1 token).
 */
import { randomBytes } from "node:crypto";
import { connectDb, disconnectDb } from "../db/connect";
import { Provider, ProviderKey } from "../db/models";
import { decrypt } from "../lib/crypto";
import { normalizeUsage } from "../gateway/stream";
import { billedTokens } from "../gateway/usage";

const DEFAULT_MODELS = [
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-fable-5",
  "gpt-6.1-sol",
  "gpt-5.5",
  "gpt-5.6-terra",
  "gemini-3.1-pro",
  "gemini-3.7-flash",
  "deepseek-v4-pro-max",
  "kimi-k3",
  "qwen3.7-max",
  "grok-4.6",
];

const args = process.argv.slice(2);
const pi = args.indexOf("--provider");
const providerSlug = pi >= 0 && args[pi + 1] ? args[pi + 1] : "upstream";
const named = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--provider");
const MODELS = named.length ? named : DEFAULT_MODELS;
const say = (s = "") => process.stdout.write(`${s}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RawUsage = Record<string, any>;
type Call = { model: string; kind: string; remaining: number; usage?: RawUsage; ours?: number; error?: string };

async function main() {
  await connectDb();
  const provider = await Provider.findOne({ slug: providerSlug }).lean();
  if (!provider) throw new Error(`No provider with slug "${providerSlug}"`);
  const keyDoc = await ProviderKey.findOne({ providerId: provider._id, status: "active" }).lean();
  if (!keyDoc) throw new Error(`Provider "${provider.name}" has no active key`);
  const key = decrypt(keyDoc.keyEnc);
  await disconnectDb();
  const base = provider.baseUrl.replace(/\/$/, "");
  const calls: Call[] = [];

  async function call(model: string, kind: string, content: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
          signal: AbortSignal.timeout(240_000),
        });
      } catch (err) {
        if (attempt === 0) {
          await sleep(6000);
          continue;
        }
        calls.push({ model, kind, remaining: Number.NaN, error: (err as Error).message });
        return;
      }
      const header = res.headers.get("x-ratelimit-remaining-tokens");
      const remaining = header === null ? Number.NaN : Number(header);
      const text = await res.text();
      if (res.ok) {
        const usage = JSON.parse(text).usage as RawUsage;
        const u = normalizeUsage(usage);
        calls.push({ model, kind, remaining, usage, ours: u ? billedTokens(u) : 0 });
        return;
      }
      if (attempt === 0 && (res.status >= 500 || res.status === 429)) {
        await sleep(6000);
        continue;
      }
      calls.push({ model, kind, remaining, error: `${res.status} ${text.slice(0, 160)}` });
      return;
    }
  }

  const filler = (tag: string) => {
    const w = ["river", "copper", "lantern", "orbit", "maple", "signal", "harbor", "velvet", "quartz", "meadow", "falcon", "ember"];
    const lines = [`Reference ${tag}. Read these notes, then answer the question at the end in one short sentence.`];
    for (let i = 0; i < 260; i++) lines.push(`Note ${i}: ${w[i % 12]} ${w[(i * 7) % 12]} ${(i * 7919) % 10007} ${w[(i * 5) % 12]}.`);
    lines.push("Question: which word appears in note 7? Answer in one short sentence.");
    return lines.join("\n");
  };

  say(`Checking ${MODELS.length} model${MODELS.length === 1 ? "" : "s"} on ${provider.name} (key …${keyDoc.last4}), about ${MODELS.length * 10}k tokens…\n`);
  for (const m of MODELS) {
    stdout(`  ${m}… `);
    await call(m, "thinking", `Find all pairs of positive integers (x, y) with x^2 - y^2 = 45. Think it through, then give the final list on the last line. [${randomBytes(3).toString("hex")}]`);
    const doc = filler(randomBytes(4).toString("hex"));
    await call(m, "prompt", doc);
    await call(m, "repeat", doc);
    const mine = calls.filter((c) => c.model === m);
    say(mine.every((c) => !c.error) ? "done" : mine.map((c) => c.error ?? "ok").join(" | "));
  }
  // One tiny call: its header tells us the tokens left after the last real test
  await call(MODELS[0], "end", "Reply OK");

  if (!calls.some((c) => Number.isFinite(c.remaining))) {
    say(`\n✗ ${provider.name} doesn't report x-ratelimit-remaining-tokens, so its charges can't be read automatically.`);
    process.exit(1);
  }

  say("\nmodel                 | step     | input  | cached | output | reasoning | FZ-craft | upstream");
  const totals = new Map<string, { ours: number; theirs: number; errors: number }>();
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c.kind === "end") continue;
    const t = totals.get(c.model) ?? { ours: 0, theirs: 0, errors: 0 };
    totals.set(c.model, t);
    if (c.error || !c.usage) {
      t.errors++;
      continue;
    }
    const next = calls.slice(i + 1).find((x) => Number.isFinite(x.remaining));
    const theirs = next && Number.isFinite(c.remaining) ? c.remaining - next.remaining : Number.NaN;
    const u = c.usage;
    say(
      [
        c.model.padEnd(21),
        c.kind.padEnd(8),
        String(u.prompt_tokens ?? u.input_tokens ?? 0).padStart(6),
        String(u.prompt_tokens_details?.cached_tokens ?? u.cache_read_input_tokens ?? 0).padStart(6),
        String(u.completion_tokens ?? u.output_tokens ?? 0).padStart(6),
        String(u.completion_tokens_details?.reasoning_tokens ?? 0).padStart(9),
        String(c.ours).padStart(8),
        Number.isFinite(theirs) ? String(theirs).padStart(8) : "       ?",
      ].join(" | "),
    );
    if (Number.isFinite(theirs)) {
      t.ours += c.ours ?? 0;
      t.theirs += theirs;
    }
  }

  say("\nSummary (FZ-craft charges ÷ upstream charges; 100% = exact match)");
  let off = 0;
  for (const [m, t] of totals) {
    if (!t.theirs) {
      say(`  ${m.padEnd(22)} couldn't be measured${t.errors ? ` (${t.errors} failed request${t.errors === 1 ? "" : "s"})` : ""}`);
      continue;
    }
    const pct = (t.ours / t.theirs) * 100;
    const ok = Math.abs(pct - 100) <= 2;
    if (!ok) off++;
    say(`  ${ok ? "✓" : "⚠"} ${m.padEnd(22)} ${pct.toFixed(1)}%  (${t.ours} vs ${t.theirs})`);
  }
  say(off ? `\n⚠ ${off} model(s) are counted differently. Send this output to Claude to adjust the counting.` : `\n✓ Every model is counted exactly like ${provider.name} bills it.`);
}

const stdout = (s: string) => process.stdout.write(s);

main().catch(async (err) => {
  say(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
