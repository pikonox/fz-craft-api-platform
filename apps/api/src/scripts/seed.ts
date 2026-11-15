/**
 * Idempotent seed: plans, payment methods, providers (your upstream + the free-tier provider from .env, plus a mock in dev), the model catalog and an admin user.
 * Existing records are left alone ($setOnInsert), so admin edits survive re-running it.
 */
import { usdToMicros } from "@nova/shared";
import { CHAT_CATALOG, FREE_MODELS, RETIRED_MODEL_IDS } from "./catalog";
import { env } from "../config/env";
import { connectDb, disconnectDb } from "../db/connect";
import { AiModel, PaymentMethodConfig, Plan, Provider, ProviderKey, User } from "../db/models";
import { decrypt, encrypt, hashPassword } from "../lib/crypto";
import { generateReferralCode } from "../services/referrals";
import { onboardUser } from "../services/users";

const M = 1_000_000;

/** One price for every image at any quality: $0.003 → $1 makes 333 images. Change per model in Admin → Models. */
const FLAT_IMAGE_PRICE = { "1K": usdToMicros(0.003), "2K": usdToMicros(0.003), "4K": usdToMicros(0.003) };

const plans = [
  { slug: "free", name: "Free", kind: "monthly", isFree: true, tokens: 1 * M, rpm: 60, modelAccess: "free", sort: 1, features: ["1M free tokens / month", "60 requests / min", "DeepSeek V4.1 Flash & GLM-5.3", "Streaming, reasoning & tools", "Community support"] },
  { slug: "starter", name: "Starter", kind: "monthly", priceMonthly: 2.2, priceYearly: 22, tokens: 30 * M, rpm: 120, modelAccess: "paid", sort: 2, features: ["30M tokens / month", "120 requests / min", "All models", "Streaming, tools & vision", "Email support"] },
  { slug: "basic", name: "Basic", kind: "monthly", priceMonthly: 4.5, priceYearly: 45, tokens: 100 * M, rpm: 300, modelAccess: "paid", sort: 3, features: ["100M tokens / month", "300 requests / min", "All models", "Usage analytics", "Email support"] },
  { slug: "pro", name: "Pro", kind: "monthly", priceMonthly: 6.75, priceYearly: 67.5, tokens: 200 * M, rpm: 600, modelAccess: "paid", sort: 4, badge: "Best value", highlight: true, features: ["200M tokens / month", "600 requests / min", "All models", "Usage analytics", "Priority support"] },
  { slug: "scale", name: "Scale", kind: "monthly", priceMonthly: 12.5, priceYearly: 125, tokens: 500 * M, rpm: 1200, modelAccess: "early", sort: 5, features: ["500M tokens / month", "1,200 requests / min", "All models + early access", "Usage analytics", "Priority support"] },
  { slug: "day-pass", name: "Day Pass", kind: "pass", pricePass: 1, durationHours: 24, tokens: 10 * M, rpm: 120, modelAccess: "paid", sort: 10, features: ["10M tokens for 24 hours", "120 requests / min", "All models"] },
  { slug: "day-pass-pro", name: "Day Pass Pro", kind: "pass", pricePass: 2, durationHours: 24, tokens: 40 * M, rpm: 300, modelAccess: "paid", sort: 11, badge: "Popular", features: ["40M tokens for 24 hours", "300 requests / min", "All models"] },
];

const methods = [
  { method: "binance_pay", label: "Binance Pay", currency: "USDT", sort: 1, minUsd: 2, details: { payId: "", name: "" }, instructions: "Open Binance → Pay → Send, enter our Pay ID and the exact amount in USDT. Then paste the Order ID from the transaction details." },
  { method: "usdt_bep20", label: "USDT · BEP-20", currency: "USDT", sort: 2, minUsd: 2, details: { address: env.USDT_BEP20_ADDRESS, network: "BNB Smart Chain (BEP-20)" }, instructions: "Send the exact amount of USDT on BNB Smart Chain (BEP-20) to the address below, then paste the transaction hash." },
  { method: "jazzcash", label: "JazzCash", currency: "PKR", sort: 3, minUsd: 1, details: { accountTitle: "", accountNumber: "" }, instructions: "Send the PKR amount to our JazzCash account, then upload a screenshot and enter the TID." },
  { method: "easypaisa", label: "Easypaisa", currency: "PKR", sort: 4, minUsd: 1, details: { accountTitle: "", accountNumber: "" }, instructions: "Send the PKR amount to our Easypaisa account, then upload a screenshot and enter the transaction ID." },
  { method: "bank_transfer", label: "Bank transfer", currency: "PKR", sort: 5, minUsd: 1, details: { bankName: "", accountTitle: "", accountNumber: "", iban: "" }, instructions: "Transfer the PKR amount to our bank account (IBFT/RAAST), then upload the receipt and enter the reference number." },
];

async function main() {
  await connectDb();

  // SYNC_PLANS=1 pushes the prices, tokens and features above onto existing plans (new purchases only —
  // subscriptions already paid for keep the price they paid). Without it, existing plans are left alone.
  const syncPlans = process.env.SYNC_PLANS === "1";
  for (const p of plans) {
    const { priceMonthly = 0, priceYearly = 0, pricePass = 0, ...rest } = p as typeof p & { priceMonthly?: number; priceYearly?: number; pricePass?: number };
    const fields = { ...rest, priceMonthly: usdToMicros(priceMonthly), priceYearly: usdToMicros(priceYearly), pricePass: usdToMicros(pricePass) };
    await Plan.updateOne(
      { slug: p.slug },
      syncPlans ? { $set: fields, $setOnInsert: { active: true } } : { $setOnInsert: { ...fields, active: true } },
      { upsert: true },
    );
  }
  console.log(`✓ ${plans.length} plans${syncPlans ? " (prices, tokens and features updated)" : ""}`);

  for (const m of methods) {
    await PaymentMethodConfig.updateOne({ method: m.method }, { $setOnInsert: { ...m, enabled: true } }, { upsert: true });
  }
  console.log(`✓ ${methods.length} payment methods`);

  /**
   * Creates or updates an OpenAI-compatible provider from .env and adds any new API keys. Stored keys
   * are recognised by decrypting them, so re-running the seed never duplicates them.
   */
  async function ensureProvider(slug: string, name: string, rawBaseUrl: string, keysCsv: string, envPrefix: string) {
    const baseUrl = rawBaseUrl.replace(/\/+$/, "");
    let provider = await Provider.findOne({ slug });
    if (!provider) {
      provider = await Provider.create({ name, slug, baseUrl, notes: `Created by \`pnpm seed\` from ${envPrefix}_* in .env.` });
    } else if (provider.baseUrl !== baseUrl || provider.name !== name) {
      // A new address means a different provider: the old keys belong to the old one, so drop them
      if (provider.baseUrl !== baseUrl) {
        const dropped = await ProviderKey.deleteMany({ providerId: provider._id });
        if (dropped.deletedCount) console.log(`  removed ${dropped.deletedCount} key(s) of the previous ${envPrefix} provider (${provider.baseUrl})`);
      }
      provider.set({ baseUrl, name });
      await provider.save();
    }
    const providerId = provider._id;
    const wanted = keysCsv.split(",").map((k) => k.trim()).filter(Boolean);
    const existing = await ProviderKey.find({ providerId }).lean();
    const known = new Set(
      existing.map((k) => {
        try {
          return decrypt(k.keyEnc);
        } catch {
          return "";
        }
      }),
    );
    const fresh = wanted.filter((k) => !known.has(k));
    if (fresh.length) {
      await ProviderKey.create(fresh.map((k, i) => ({ providerId, label: `Key ${existing.length + i + 1}`, keyEnc: encrypt(k), last4: k.slice(-4), weight: 1 })));
    }
    const total = existing.length + fresh.length;
    console.log(`✓ provider "${provider.name}" → ${baseUrl} (${total} key${total === 1 ? "" : "s"}${fresh.length ? `, ${fresh.length} added` : ""})`);
    if (!total) console.warn(`! ${envPrefix}_API_KEYS is empty — add at least one key, then run the seed again.`);
    return provider;
  }

  // ── Your main upstream (UPSTREAM_* in .env): every paid catalog model, under the same model id ──
  const upstream = env.UPSTREAM_BASE_URL ? await ensureProvider("upstream", env.UPSTREAM_NAME, env.UPSTREAM_BASE_URL, env.UPSTREAM_API_KEYS, "UPSTREAM") : null;
  // ── Free-tier provider (FREE_UPSTREAM_* in .env): only the FREE_MODELS, under their own model ids ──
  const freeTier = env.FREE_UPSTREAM_BASE_URL
    ? await ensureProvider("free-tier", env.FREE_UPSTREAM_NAME, env.FREE_UPSTREAM_BASE_URL, env.FREE_UPSTREAM_API_KEYS, "FREE_UPSTREAM")
    : null;

  // ── Mock provider (development only): this API's own /mock/v1 ──
  let mock: InstanceType<typeof Provider> | null = null;
  if (env.ENABLE_MOCK_PROVIDER) {
    const mockUrl = `http://localhost:${env.API_PORT}/mock/v1`;
    mock = await Provider.findOne({ slug: "mock" });
    if (!mock) {
      mock = await Provider.create({ name: "Mock provider (dev)", slug: "mock", baseUrl: mockUrl, notes: "Built-in fake upstream for local development." });
      await ProviderKey.create([
        { providerId: mock._id, label: "mock key A", keyEnc: encrypt("mock-key-a"), last4: "ey-a", weight: 2 },
        { providerId: mock._id, label: "mock key B", keyEnc: encrypt("mock-key-b"), last4: "ey-b", weight: 1 },
      ]);
    }
    console.log(`✓ mock provider → ${mock.baseUrl}`);
  }
  if (!upstream && !mock) console.warn("! No provider: set UPSTREAM_BASE_URL and UPSTREAM_API_KEYS in .env so models can answer.");

  /** Free models → the free-tier provider; everything else → your upstream (same id); otherwise the dev mock. */
  const route = (publicId: string, mockModel: string) => {
    const freeModelId = FREE_MODELS[publicId];
    if (freeModelId && freeTier) return [{ providerId: freeTier._id, upstreamModel: freeModelId, priority: 1, weight: 1 }];
    if (upstream) return [{ providerId: upstream._id, upstreamModel: publicId, priority: 1, weight: 1 }];
    return mock ? [{ providerId: mock._id, upstreamModel: mockModel, priority: 1, weight: 1 }] : [];
  };
  /** Models only the dev mock can serve (our own demo ids). */
  const mockOnly = (mockModel: string) => (mock ? [{ providerId: mock._id, upstreamModel: mockModel, priority: 1, weight: 1 }] : []);

  const models = [
    ...CHAT_CATALOG.map((m) => ({ ...m, routes: route(m.publicId, "mock-chat") })),
    {
      publicId: "fz-embed-v1",
      name: "FZ Embed v1",
      vendor: "FZ-craft",
      type: "embedding",
      description: "General purpose text embeddings (256 dimensions in the mock).",
      capabilities: [],
      contextLength: 8_192,
      maxOutput: 0,
      access: "free",
      sort: 200,
      pricing: { inputPer1M: usdToMicros(0.02) },
      routes: mockOnly("mock-embed"),
    },
    {
      publicId: "sunburst-2.5",
      name: "Sunburst 2.5",
      vendor: "Sunburst",
      type: "image",
      description: "Photoreal detail up to 4K. Text-to-image and image-to-image.",
      capabilities: [],
      contextLength: 0,
      maxOutput: 0,
      access: "free",
      featured: true,
      sort: 300,
      pricing: { perImage: FLAT_IMAGE_PRICE },
      routes: route("sunburst-2.5", "mock-image"),
    },
    {
      publicId: "sunburst-lite",
      name: "Sunburst Lite",
      vendor: "Sunburst",
      type: "image",
      description: "Fast drafts and ideas at the lowest price.",
      capabilities: [],
      contextLength: 0,
      maxOutput: 0,
      access: "free",
      sort: 301,
      pricing: { perImage: FLAT_IMAGE_PRICE },
      routes: route("sunburst-lite", "mock-image"),
    },
  ];
  // Fresh databases get the whole catalog. SYNC_MODELS=1 also refreshes names, prices, capabilities
  // and status of existing models (routes and on/off switches you set in the admin are kept)
  // and removes the retired demo models.
  const sync = process.env.SYNC_MODELS === "1";
  for (const m of models) {
    const { routes, ...catalog } = m;
    await AiModel.updateOne(
      { publicId: m.publicId },
      sync ? { $set: catalog, $setOnInsert: { routes, enabled: true } } : { $setOnInsert: { ...m, enabled: true } },
      { upsert: true },
    );
  }
  if (sync) {
    const removed = await AiModel.deleteMany({ publicId: { $in: RETIRED_MODEL_IDS } });
    console.log(`✓ synced ${models.length} models${removed.deletedCount ? `, removed ${removed.deletedCount} retired demo models` : ""}`);
  } else {
    console.log(`✓ ${models.length} models (existing ones left unchanged; run with SYNC_MODELS=1 to refresh them)`);
  }

  // Existing models: make sure each one is routed to the upstream, and drop dev-mock routes
  if (upstream) {
    const mockDoc = await Provider.findOne({ slug: "mock" }).select("_id").lean();
    let linked = 0;
    for (const m of models) {
      if (!m.routes.some((r) => String(r.providerId) === String(upstream!._id))) continue;
      if (mockDoc) await AiModel.updateOne({ publicId: m.publicId }, { $pull: { routes: { providerId: mockDoc._id } } });
      const r = await AiModel.updateOne(
        { publicId: m.publicId, "routes.providerId": { $ne: upstream._id } },
        { $push: { routes: { providerId: upstream._id, upstreamModel: m.publicId, priority: 1, weight: 1, enabled: true } } },
      );
      linked += r.modifiedCount;
    }
    console.log(`✓ ${models.filter((m) => m.routes.some((r) => String(r.providerId) === String(upstream!._id))).length} models routed to "${upstream.name}"${linked ? ` (${linked} newly linked)` : ""}`);
  }

  // Free models: served only by the free-tier provider (drops any dev-mock or main-upstream route)
  if (freeTier) {
    // Models that are no longer free stop using the free-tier provider
    const unrouted = await AiModel.updateMany(
      { publicId: { $nin: Object.keys(FREE_MODELS) }, "routes.providerId": freeTier._id },
      { $pull: { routes: { providerId: freeTier._id } } },
    );
    if (unrouted.modifiedCount) console.log(`  ${unrouted.modifiedCount} model(s) no longer free: removed from "${freeTier.name}"`);
    const mockDoc = await Provider.findOne({ slug: "mock" }).select("_id").lean();
    const others = [mockDoc?._id, upstream?._id].filter((id): id is NonNullable<typeof id> => Boolean(id));
    let linked = 0;
    for (const [publicId, upstreamModel] of Object.entries(FREE_MODELS)) {
      if (others.length) await AiModel.updateOne({ publicId }, { $pull: { routes: { providerId: { $in: others } } } });
      const existing = await AiModel.updateOne(
        { publicId, "routes.providerId": freeTier._id },
        { $set: { "routes.$.upstreamModel": upstreamModel, "routes.$.enabled": true } },
      );
      if (!existing.matchedCount) {
        const r = await AiModel.updateOne({ publicId }, { $push: { routes: { providerId: freeTier._id, upstreamModel, priority: 1, weight: 1, enabled: true } } });
        linked += r.modifiedCount;
      }
    }
    console.log(`✓ ${Object.keys(FREE_MODELS).length} free models routed to "${freeTier.name}"${linked ? ` (${linked} newly linked)` : ""}`);
  }

  // Development: a chat model left without any route answers from the mock again
  if (mock) {
    const back = await AiModel.updateMany(
      { type: "chat", routes: { $size: 0 } },
      { $push: { routes: { providerId: mock._id, upstreamModel: "mock-chat", priority: 1, weight: 1, enabled: true } } },
    );
    if (back.modifiedCount) console.log(`✓ ${back.modifiedCount} model(s) without a provider routed back to the dev mock`);
  }

  // Admin user
  let admin = await User.findOne({ email: env.ADMIN_EMAIL.toLowerCase() });
  if (!admin) {
    admin = await User.create({
      email: env.ADMIN_EMAIL.toLowerCase(),
      name: "Admin",
      passwordHash: await hashPassword(env.ADMIN_PASSWORD),
      role: "admin",
      emailVerified: true,
      referralCode: await generateReferralCode(),
      // Starts at $0 like every account; add money through a real top-up or Admin → Users → Adjust balance
    });
    console.log(`✓ admin created: ${env.ADMIN_EMAIL} / ${env.ADMIN_PASSWORD}`);
  } else if (admin.role !== "admin") {
    admin.role = "admin";
    await admin.save();
    console.log(`✓ ${env.ADMIN_EMAIL} promoted to admin`);
  } else {
    console.log(`✓ admin exists: ${env.ADMIN_EMAIL}`);
  }
  await onboardUser(admin._id);

  await disconnectDb();
  console.log("Seed complete.");
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
