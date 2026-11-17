import { Router } from "express";
import { ACCESS_RANK, microsToUsd, type ModelAccess } from "@nova/shared";
import { Plan } from "../db/models";
import { listModels } from "../gateway/registry";
import { health, registry } from "../gateway/registry";
import { getEntitlement } from "../services/billing";
import { optionalKeyAccess } from "../gateway/context";
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

type PlanRow = { name: string; kind: string; isFree: boolean; modelAccess: ModelAccess; priceMonthly: number; pricePass: number; durationHours: number };
let planCache: { at: number; plans: PlanRow[] } | null = null;

/** Plans on sale (cached for a minute), used to say what unlocks a model. */
async function plansOnSale(): Promise<PlanRow[]> {
  if (planCache && Date.now() - planCache.at < 60_000) return planCache.plans;
  const plans = await Plan.find({ active: true }).select("name kind isFree modelAccess priceMonthly pricePass durationHours").lean<PlanRow[]>();
  planCache = { at: Date.now(), plans };
  return plans;
}

/** The cheapest monthly plan and the cheapest day pass that unlock models of this access level. */
function unlockedBy(access: ModelAccess, plans: PlanRow[]) {
  const ok = plans.filter((p) => !p.isFree && ACCESS_RANK[p.modelAccess] >= ACCESS_RANK[access]);
  const monthly = ok.filter((p) => p.kind === "monthly").sort((a, b) => a.priceMonthly - b.priceMonthly)[0];
  const pass = ok.filter((p) => p.kind === "pass").sort((a, b) => a.pricePass - b.pricePass)[0];
  return {
    plan: monthly ? { name: monthly.name, price_per_month: usd(monthly.priceMonthly) } : null,
    pass: pass ? { name: pass.name, price: usd(pass.pricePass), hours: pass.durationHours } : null,
  };
}

/**
 * Public model list for apps and extensions, served at https://<domain>/models.json (no API key needed).
 * Built from the database on every request (models are cached for ~30 s), so models added or enabled
 * in Admin → Models show up automatically.
 *
 * Lists every enabled model that isn't under maintenance (?include=all adds those too), including the
 * paid ones: "locked" says whether the caller's plan can use it — send the user's API key
 * (Authorization: Bearer fz_live_…) to get their own plan, otherwise the Free plan is assumed — and
 * "unlock" names the cheapest plan / day pass that opens it. "available" says whether the model is
 * connected to a working provider right now.
 */
catalogRouter.get("/models.json", async (req, res) => {
  const includeAll = req.query.include === "all";
  const [reg, caller, plans] = await Promise.all([registry(), optionalKeyAccess(req), plansOnSale()]);
  const viewerAccess: ModelAccess = caller?.access ?? "free";
  const models = [...reg.models.values()]
    .filter((m) => m.enabled && (includeAll || (m.status ?? "active") === "active"))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const base = env.PUBLIC_API_BASE_URL.replace(/\/+$/, "");
  const site = base.replace(/\/v1$/, "");
  // Personalised answers must not be shared by caches
  res.setHeader("Cache-Control", caller ? "private, max-age=60" : "public, max-age=60");
  res.setHeader("Vary", "Authorization, X-Api-Key");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    object: "list",
    provider: env.BRAND_NAME,
    base_url: base,
    // Anthropic SDKs and Claude Code add /v1 themselves
    anthropic_base_url: site,
    upgrade_url: `${site}/dashboard/billing/plan`,
    // Whose plan "locked" is based on (send an API key to get the user's own)
    viewer: { signed_in: Boolean(caller), plan: caller?.planName ?? "Free" },
    updated_at: new Date().toISOString(),
    count: models.length,
    data: models.map((m) => {
      const p = m.pricing ?? ({} as NonNullable<typeof m.pricing>);
      const access = m.access as ModelAccess;
      const locked = ACCESS_RANK[access] > ACCESS_RANK[viewerAccess];
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
        // Which plan level opens it: free = every account, paid = paid plans and day passes, early = top plan
        plan: access,
        free: access === "free",
        // The caller's plan can't use it yet → show a lock and the upgrade link
        locked,
        unlock: locked ? unlockedBy(access, plans) : null,
        // Connected to a working provider right now
        available: (m.status ?? "active") === "active" && servable(m, reg),
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
