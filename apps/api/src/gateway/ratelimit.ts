/**
 * Sliding-window request limiter (per minute). In-memory, so it is per API process;
 * swap this implementation for Redis when running more than one instance.
 */
export interface RateLimiter {
  /** Records a hit on every bucket only if none of them is over its limit. */
  hit(buckets: { key: string; limit: number }[]): { ok: boolean; limit: number; remaining: number; resetMs: number };
}

const WINDOW_MS = 60_000;

class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor() {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  private window(key: string, now: number) {
    const arr = this.hits.get(key) ?? [];
    let i = 0;
    while (i < arr.length && arr[i] <= now - WINDOW_MS) i++;
    const kept = i ? arr.slice(i) : arr;
    this.hits.set(key, kept);
    return kept;
  }

  hit(buckets: { key: string; limit: number }[]) {
    const now = Date.now();
    let tightest = { limit: Infinity, remaining: Infinity, resetMs: 0 };
    for (const b of buckets) {
      const arr = this.window(b.key, now);
      const remaining = b.limit - arr.length;
      const resetMs = arr.length ? arr[0] + WINDOW_MS - now : 0;
      if (remaining <= 0) return { ok: false, limit: b.limit, remaining: 0, resetMs: Math.max(resetMs, 1000) };
      if (remaining < tightest.remaining) tightest = { limit: b.limit, remaining, resetMs };
    }
    for (const b of buckets) this.hits.get(b.key)!.push(now);
    return { ok: true, limit: tightest.limit, remaining: tightest.remaining - 1, resetMs: tightest.resetMs || WINDOW_MS };
  }

  private sweep() {
    const now = Date.now();
    for (const [k, arr] of this.hits) {
      if (!arr.length || arr[arr.length - 1] <= now - WINDOW_MS) this.hits.delete(k);
    }
  }
}

export const rateLimiter: RateLimiter = new MemoryRateLimiter();
