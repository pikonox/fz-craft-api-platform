import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { formatTokens, formatUsd, imageDimensions, qualityForSize, tokenCostMicros, usdToMicros } from "@nova/shared";
import { orderCandidates, weightedShuffle, isRetryable, isAccountProblem } from "../src/gateway/router";
import { billedTokens, costAtModelPrice } from "../src/gateway/usage";
import { normalizeUsage } from "../src/gateway/stream";
import type { PoolKey } from "../src/gateway/registry";

const pA = { _id: new Types.ObjectId(), name: "A", enabled: true } as any;
const pB = { _id: new Types.ObjectId(), name: "B", enabled: true } as any;
const pOff = { _id: new Types.ObjectId(), name: "Off", enabled: false } as any;
const providers = new Map([pA, pB, pOff].map((p) => [String(p._id), p]));
const key = (id: string, p: any, weight = 1, status: "active" | "disabled" = "active"): PoolKey => ({ id, providerId: String(p._id), label: id, secret: "s", weight, status });
const keys = new Map<string, PoolKey[]>([
  [String(pA._id), [key("a1", pA), key("a2", pA, 1, "disabled")]],
  [String(pB._id), [key("b1", pB), key("b2", pB)]],
  [String(pOff._id), [key("o1", pOff)]],
]);

describe("router", () => {
  const model = {
    routes: [
      { providerId: pA._id, upstreamModel: "a-model", priority: 1, weight: 1, enabled: true },
      { providerId: pB._id, upstreamModel: "b-model", priority: 2, weight: 1, enabled: true },
      { providerId: pOff._id, upstreamModel: "x", priority: 0, weight: 1, enabled: true },
    ],
  } as any;

  it("orders by priority, skips disabled providers and keys", () => {
    const c = orderCandidates(model, providers, keys, () => undefined, 0, () => 0.5);
    expect(c.map((x) => x.key.id)).toEqual(["a1", expect.stringMatching(/^b/), expect.stringMatching(/^b/)]);
    expect(c[0].upstreamModel).toBe("a-model");
  });

  it("moves keys in cooldown to the end", () => {
    const c = orderCandidates(model, providers, keys, (id) => (id === "a1" ? { cooldownUntil: 10_000 } : undefined), 1_000, () => 0.5);
    expect(c[c.length - 1].key.id).toBe("a1");
    expect(c[0].key.id).toMatch(/^b/);
  });

  it("weighted shuffle favours heavier items", () => {
    const items = [{ id: "heavy", weight: 9 }, { id: "light", weight: 1 }];
    let heavyFirst = 0;
    for (let i = 0; i < 2000; i++) if (weightedShuffle(items)[0].id === "heavy") heavyFirst++;
    expect(heavyFirst / 2000).toBeGreaterThan(0.8);
    expect(weightedShuffle([{ weight: 0 }])).toHaveLength(0);
  });

  it("retries the right statuses", () => {
    expect([0, 429, 500, 502, 503].every(isRetryable)).toBe(true);
    expect([400, 401, 422].some(isRetryable)).toBe(false);
    // Provider account problems fail over to the next key instead of reaching the user
    expect([401, 402, 403].every(isAccountProblem)).toBe(true);
    expect([400, 404, 422, 429].some(isAccountProblem)).toBe(false);
  });
});

describe("usage maths", () => {
  it("normalises OpenAI and DeepSeek usage shapes", () => {
    expect(normalizeUsage({ prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 40 }, completion_tokens_details: { reasoning_tokens: 5 } })).toEqual({ input: 100, output: 20, cached: 40, reasoning: 5 });
    expect(normalizeUsage({ prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 30 })?.cached).toBe(30);
    expect(normalizeUsage(null)).toBeNull();
  });

  it("bills cached input in full, like the upstream", () => {
    expect(billedTokens({ input: 1000, output: 200, cached: 500, reasoning: 0 })).toBe(1000 + 200);
  });

  it("prices tokens in micros", () => {
    const model = { pricing: { inputPer1M: usdToMicros(1), outputPer1M: usdToMicros(2), cachedInputPer1M: usdToMicros(0.1) } } as any;
    // 1M input ($1) + 0.5M output ($1) = $2
    expect(costAtModelPrice(model, { input: 1_000_000, output: 500_000, cached: 0, reasoning: 0 })).toBe(2_000_000);
    expect(tokenCostMicros(278, usdToMicros(0.27))).toBeCloseTo(75.06, 1);
  });
});

describe("shared helpers", () => {
  it("formats money and tokens", () => {
    expect(formatUsd(1_800)).toBe("$0.0018");
    expect(formatUsd(25_000_000)).toBe("$25.00");
    expect(formatUsd(-1_200_000)).toBe("-$1.20");
    expect(formatTokens(1_300)).toBe("1.3K");
    expect(formatTokens(2_000_000)).toBe("2M");
  });

  it("maps image sizes to quality tiers", () => {
    expect(imageDimensions("1:1", "4K")).toEqual({ width: 3840, height: 3840 });
    expect(imageDimensions("16:9", "1K")).toEqual({ width: 1024, height: 576 });
    expect(imageDimensions("9:16", "2K")).toEqual({ width: 1152, height: 2048 });
    expect(qualityForSize("1024x1024")).toBe("1K");
    expect(qualityForSize("1792x1024")).toBe("2K");
    expect(qualityForSize("3840x2160")).toBe("4K");
  });
});
