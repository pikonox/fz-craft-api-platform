import { Router } from "express";
import { ACCESS_RANK, microsToUsd, type ModelAccess } from "@nova/shared";
import { Plan } from "../db/models";
import { listModels } from "../gateway/registry";
import { health, registry } from "../gateway/registry";
import { getEntitlement } from "../services/billing";
import { getSettings } from "../services/settings";
import { env } from "../config/env";

export const catalogRouter = Router();

/** Model catalog for the dashboard (also usable without login for the marketing site). */
catalogRouter.get("/models", async (req, res) => {
  const models = (await listModels()).filter((m) => m.enabled).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const access: ModelAccess = req.user ? (await getEntitlement(req.user._id)).access : "free";
  res.json({
    models: models.map((m) => ({
      id: m.publicId,
      name: m.name,
      type: m.type,
      vendor: m.vendor,
      description: m.description,
      capabilities: m.capabilities,
      contextLength: m.contextLength,
      maxOutput: m.maxOutput,
      access: m.access,
      status: m.status ?? "active",
      featured: m.featured,
      pricing: m.pricing,
      available: ACCESS_RANK[m.access as ModelAccess] <= ACCESS_RANK[access],
    })),
  });
});

/** API endpoints each model type is called on. */
const ENDPOINTS: Record<string, string[]> = {
  chat: ["/v1/chat/completions", "/v1/messages"],
  image: ["/v1/images/generations", "/v1/images/edits"],
  embedding: ["/v1/embeddings"],
};

const usd = (micros: number | undefined | null) => (micros ? microsToUsd(micros) : 0);

type Snapshot = Awaited<ReturnType<typeof registry>>;

/**
 * True when a request for this model can actually be answered: at least one enabled route to an
 * enabled provider that has an active key. The built-in dev mock only counts when it is switched on
 * (it is off on the live server).
 */
function servable(m: { routes?: { providerId: unknown; enabled?: boolean }[] }, reg: Snapshot) {
  return (m.routes ?? []).some((r) => {
    if (r.enabled === false) return false;
    const provider = reg.providers.get(String(r.providerId));
    if (!provider || provider.enabled === false) return false;
    if (provider.slug === "mock" && !env.ENABLE_MOCK_PROVIDER) return false;
    return (reg.keysByProvider.get(String(r.providerId)) ?? []).some((k) => k.status === "active");
  });
}

/**
 * Public model list for apps and extensions, served at https://<domain>/models.json (no API key).
 * Built from the database on every request (models are cached for ~30 s), so models added or enabled
 * in Admin → Models show up automatically. Only models that can be used right now are listed (enabled,
 * not under maintenance, and connected to a working provider); ?include=all lists every enabled model
 * with its "available" flag.
 */
catalogRouter.get("/models.json", async (req, res) => {
  const includeAll = req.query.include === "all";
  const reg = await registry();
  const models = [...reg.models.values()]
    .filter((m) => m.enabled)
    .map((m) => ({ m, available: (m.status ?? "active") === "active" && servable(m, reg) }))
    .filter(({ available }) => includeAll || available)
    .sort((a, b) => a.m.sort - b.m.sort || a.m.name.localeCompare(b.m.name));
  const base = env.PUBLIC_API_BASE_URL.replace(/\/+$/, "");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    object: "list",
    provider: env.BRAND_NAME,
    base_url: base,
    // Anthropic SDKs and Claude Code add /v1 themselves
    anthropic_base_url: base.replace(/\/v1$/, ""),
    updated_at: new Date().toISOString(),
    count: models.length,
    data: models.map(({ m, available }) => {
      const p = m.pricing ?? ({} as NonNullable<typeof m.pricing>);
      const pricing =
        m.type === "image"
          ? { currency: "USD", per_image: Object.fromEntries(Object.entries(p.perImage ?? {}).map(([q, v]) => [q, usd(v as number)])) }
          : {
              currency: "USD",
              input_per_1m: usd(p.inputPer1M),
              output_per_1m: usd(p.outputPer1M),
              ...(p.cachedInputPer1M ? { cached_input_per_1m: usd(p.cachedInputPer1M) } : {}),
            };
      return {
        id: m.publicId,
        name: m.name,
        vendor: m.vendor,
        type: m.type,
        status: m.status ?? "active",
        // Can be called right now (always true unless ?include=all)
        available,
        // Which plan unlocks it: free = every account, paid = paid plans and passes, early = top plan
        plan: m.access,
        free: m.access === "free",
        featured: Boolean(m.featured),
        description: m.description ?? "",
        capabilities: m.capabilities ?? [],
        context_length: m.contextLength ?? null,
        max_output_tokens: m.maxOutput ?? null,
        endpoints: ENDPOINTS[m.type] ?? [],
        pricing,
      };
    }),
  });
});

catalogRouter.get("/plans", async (_req, res) => {
  const plans = await Plan.find({ active: true }).sort({ sort: 1 }).lean();
  res.json({
    plans: plans.map((p) => ({
      id: String(p._id),
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      isFree: p.isFree,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      pricePass: p.pricePass,
      durationHours: p.durationHours,
      tokens: p.tokens,
      rpm: p.rpm,
      modelAccess: p.modelAccess,
      features: p.features,
      badge: p.badge,
      highlight: p.highlight,
    })),
  });
});

/** Overall service status for the "All systems normal" pill. */
catalogRouter.get("/status", async (_req, res) => {
  const s = await getSettings();
  // Public contact links for the website footer (placeholder addresses are hidden)
  const email = typeof s.supportEmail === "string" && s.supportEmail.includes("@") && !/@example\.(com|org|net)$/i.test(s.supportEmail) ? s.supportEmail : null;
  const contact = { email, telegram: env.TELEGRAM_BOT_USERNAME ? `https://t.me/${env.TELEGRAM_BOT_USERNAME.replace(/^@/, "")}` : null };
  if (s.statusBanner?.level && s.statusBanner.level !== "none") {
    res.json({ level: s.statusBanner.level === "outage" ? "outage" : s.statusBanner.level === "warning" ? "degraded" : "operational", message: s.statusBanner.message, announcement: s.announcement, contact });
    return;
  }
  const reg = await registry();
  const keys = [...reg.keysByProvider.values()].flat().filter((k) => k.status === "active" && reg.providers.get(k.providerId)?.enabled);
  const now = Date.now();
  const cooling = keys.filter((k) => (health.get(k.id)?.cooldownUntil ?? 0) > now).length;
  const ratio = keys.length ? cooling / keys.length : 0;
  const level = !keys.length ? "degraded" : ratio >= 0.75 ? "outage" : ratio >= 0.34 ? "degraded" : "operational";
  const message = level === "operational" ? "All systems normal" : level === "degraded" ? "Some models are degraded" : "Major outage";
  res.json({ level, message, announcement: s.announcement, brand: env.BRAND_NAME, contact });
});
