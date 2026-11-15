import { Router } from "express";
import { ACCESS_RANK, type ModelAccess } from "@nova/shared";
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
