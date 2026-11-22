import { ProviderKey, type ModelLean, type ProviderLean } from "../db/models";
import { logger } from "../lib/logger";
import { noteUpstreamQuota, upstreamFailed } from "../services/adminAlerts";
import { GatewayError } from "./errors";
import { health, registry, type PoolKey } from "./registry";

export type Candidate = {
  provider: ProviderLean;
  key: PoolKey;
  upstreamModel: string;
  priority: number;
  weight: number;
};

const MAX_ATTEMPTS = 3;
const BASE_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_MS = 10 * 60_000;
const AUTH_COOLDOWN_MS = 60 * 60_000;

/** Weighted random order (Efraimidis–Spirakis): higher weight ⇒ more likely to be first. */
export function weightedShuffle<T extends { weight: number }>(items: T[], rand: () => number = Math.random): T[] {
  return items
    .filter((i) => i.weight > 0)
    .map((i) => ({ i, k: Math.pow(rand(), 1 / i.weight) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.i);
}

/**
 * Order every usable (route × key) pair: by route priority, weighted-random inside a priority,
 * healthy keys first. Keys in cooldown are kept as a last resort.
 */
export function orderCandidates(
  model: Pick<ModelLean, "routes">,
  providers: Map<string, ProviderLean>,
  keysByProvider: Map<string, PoolKey[]>,
  healthOf: (id: string) => { cooldownUntil: number } | undefined,
  now = Date.now(),
  rand: () => number = Math.random,
): Candidate[] {
  const routes = (model.routes ?? []).filter((r) => r.enabled !== false);
  const priorities = [...new Set(routes.map((r) => r.priority ?? 1))].sort((a, b) => a - b);
  const healthy: Candidate[] = [];
  const cooling: (Candidate & { until: number })[] = [];

  for (const p of priorities) {
    const group: Candidate[] = [];
    for (const r of routes.filter((x) => (x.priority ?? 1) === p)) {
      const provider = providers.get(String(r.providerId));
      if (!provider || !provider.enabled) continue;
      for (const key of keysByProvider.get(String(provider._id)) ?? []) {
        if (key.status !== "active") continue;
        const c: Candidate = { provider, key, upstreamModel: r.upstreamModel, priority: p, weight: (r.weight ?? 1) * (key.weight ?? 1) };
        const until = healthOf(key.id)?.cooldownUntil ?? 0;
        if (until > now) cooling.push({ ...c, until });
        else group.push(c);
      }
    }
    healthy.push(...weightedShuffle(group, rand));
  }
  cooling.sort((a, b) => a.until - b.until);
  return [...healthy, ...cooling];
}

/** The upstream rejected our key or account (401/403), or the account is out of credit (402). */
export function isAccountProblem(status: number) {
  return status === 401 || status === 402 || status === 403;
}

export function isRetryable(status: number) {
  return status === 0 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export function markSuccess(c: Candidate) {
  const h = health.get(c.key.id);
  const wasBad = h && (h.failStreak > 0 || h.cooldownUntil > 0);
  health.set(c.key.id, { failStreak: 0, cooldownUntil: 0 });
  const update: Record<string, unknown> = { $set: { lastUsedAt: new Date() }, $inc: { successCount: 1 } };
  if (wasBad) (update.$set as Record<string, unknown>).failStreak = 0;
  if (wasBad) (update.$set as Record<string, unknown>).cooldownUntil = null;
  ProviderKey.updateOne({ _id: c.key.id }, update).catch(() => {});
}

export function markFailure(c: Candidate, status: number, message: string) {
  const prev = health.get(c.key.id) ?? { failStreak: 0, cooldownUntil: 0 };
  const failStreak = prev.failStreak + 1;
  const cooldown = isAccountProblem(status) ? AUTH_COOLDOWN_MS : Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** (failStreak - 1));
  const cooldownUntil = Date.now() + cooldown;
  health.set(c.key.id, { failStreak, cooldownUntil });
  logger.warn({ provider: c.provider.name, key: c.key.label || c.key.id, status, cooldownMs: cooldown }, `upstream failure: ${message.slice(0, 200)}`);
  upstreamFailed(c.provider, status, message);
  ProviderKey.updateOne(
    { _id: c.key.id },
    {
      $set: { failStreak, cooldownUntil: new Date(cooldownUntil), lastError: `${status || "network"}: ${message.slice(0, 300)}`, lastErrorAt: new Date() },
      $inc: { failCount: 1 },
    },
  ).catch(() => {});
}

export type DispatchResult = {
  res: Response;
  candidate: Candidate;
  attempts: number;
  /** true when the upstream rejected the request itself (4xx) and we pass the error through */
  clientError: boolean;
};

/**
 * Send a request to the first healthy upstream for `model`, failing over on network errors,
 * 429s, 5xx and auth/404 problems. Returns once response headers are received.
 */
export async function dispatch(opts: {
  model: ModelLean;
  path: string;
  body: (upstreamModel: string) => NonNullable<RequestInit["body"]>;
  json?: boolean;
  signal: AbortSignal;
}): Promise<DispatchResult> {
  const reg = await registry();
  const candidates = orderCandidates(opts.model, reg.providers, reg.keysByProvider, (id) => health.get(id)).slice(0, MAX_ATTEMPTS);
  if (!candidates.length) {
    throw new GatewayError(503, `No upstream is configured for model '${opts.model.publicId}'.`, "server_error", "no_upstream");
  }

  let attempts = 0;
  for (const c of candidates) {
    attempts++;
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    opts.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ac.abort(new Error("upstream timeout")), c.provider.timeoutMs ?? 120_000);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${c.key.secret}` };
      const extra = c.provider.headers as unknown as Map<string, string> | Record<string, string> | undefined;
      if (extra) for (const [k, v] of extra instanceof Map ? extra : Object.entries(extra)) headers[k] = v;
      if (opts.json !== false) headers["Content-Type"] = "application/json";
      const url = `${c.provider.baseUrl.replace(/\/$/, "")}${opts.path}`;
      const res = await fetch(url, { method: "POST", headers, body: opts.body(c.upstreamModel), signal: ac.signal });
      clearTimeout(timer);

      if (res.ok) {
        markSuccess(c);
        noteUpstreamQuota(c.provider, res.headers);
        return { res, candidate: c, attempts, clientError: false };
      }
      const text = await res.text().catch(() => "");
      // Our key/account at the provider is the problem (bad key, out of credit) or the model is
      // missing there: rest this key and try the next route instead of showing the user the
      // provider's error (a provider 402 would read like *their* quota ran out).
      if (isRetryable(res.status) || isAccountProblem(res.status) || res.status === 404) {
        markFailure(c, res.status, text || res.statusText);
        continue;
      }
      // The upstream says the request itself is invalid: pass it through unchanged.
      return { res: new Response(text, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } }), candidate: c, attempts, clientError: true };
    } catch (err) {
      clearTimeout(timer);
      if (opts.signal.aborted) throw new GatewayError(499, "Client closed request", "invalid_request_error", "client_closed");
      markFailure(c, 0, (err as Error)?.message ?? "network error");
    } finally {
      opts.signal.removeEventListener("abort", onAbort);
    }
  }
  throw new GatewayError(
    502,
    `The upstream provider for '${opts.model.publicId}' is unavailable right now. Please retry in a moment.`,
    "server_error",
    "upstream_unavailable",
  );
}
