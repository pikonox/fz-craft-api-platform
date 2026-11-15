import { AiModel, Provider, ProviderKey, type ModelLean, type ProviderLean } from "../db/models";
import { decrypt } from "../lib/crypto";
import { logger } from "../lib/logger";

/**
 * In-memory snapshot of models, providers and upstream keys.
 * Refreshed every 30s and immediately after admin edits (invalidateRegistry).
 */
export type PoolKey = {
  id: string;
  providerId: string;
  label: string;
  secret: string;
  weight: number;
  status: "active" | "disabled";
};

type Snapshot = {
  at: number;
  models: Map<string, ModelLean>;
  providers: Map<string, ProviderLean>;
  keysByProvider: Map<string, PoolKey[]>;
};

let snap: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;
const TTL = 30_000;

async function load(): Promise<Snapshot> {
  const [models, providers, keys] = await Promise.all([
    AiModel.find().lean<ModelLean[]>(),
    Provider.find().lean<ProviderLean[]>(),
    ProviderKey.find().lean(),
  ]);
  const keysByProvider = new Map<string, PoolKey[]>();
  for (const k of keys) {
    let secret = "";
    try {
      secret = decrypt(k.keyEnc);
    } catch {
      logger.error({ key: String(k._id) }, "Could not decrypt provider key (ENCRYPTION_KEY changed?)");
      continue;
    }
    const list = keysByProvider.get(String(k.providerId)) ?? [];
    list.push({ id: String(k._id), providerId: String(k.providerId), label: k.label, secret, weight: k.weight, status: k.status as PoolKey["status"] });
    keysByProvider.set(String(k.providerId), list);
    seedHealth(String(k._id), k.failStreak ?? 0, k.cooldownUntil ? new Date(k.cooldownUntil).getTime() : 0);
  }
  return {
    at: Date.now(),
    models: new Map(models.map((m) => [m.publicId, m])),
    providers: new Map(providers.map((p) => [String(p._id), p])),
    keysByProvider,
  };
}

function refresh(): Promise<Snapshot> {
  if (!loading) {
    loading = load()
      .then((s) => (snap = s))
      .finally(() => (loading = null));
  }
  return loading;
}

/**
 * Stale-while-revalidate: once loaded, callers always get the snapshot immediately and an
 * expired one is refreshed in the background, so no request waits on the database. Only the
 * very first load (and the first one after invalidateRegistry) is awaited.
 */
export async function registry(): Promise<Snapshot> {
  if (!snap) return refresh();
  if (Date.now() - snap.at >= TTL) {
    refresh().catch((err) => logger.warn({ err }, "Background registry refresh failed; serving the previous snapshot"));
  }
  return snap;
}

export function invalidateRegistry() {
  snap = null;
}

export async function getModel(publicId: string) {
  return (await registry()).models.get(publicId) ?? null;
}

export async function listModels() {
  return [...(await registry()).models.values()];
}

// ── Health (in-memory, persisted asynchronously by router.ts) ──
export type Health = { failStreak: number; cooldownUntil: number };
export const health = new Map<string, Health>();

function seedHealth(id: string, failStreak: number, cooldownUntil: number) {
  if (!health.has(id)) health.set(id, { failStreak, cooldownUntil });
}
