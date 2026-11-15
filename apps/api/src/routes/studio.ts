import { Router } from "express";
import { z } from "zod";
import { ASPECT_RATIOS, IMAGE_QUALITIES, IMAGE_STYLES } from "@nova/shared";
import { ImageGeneration, Transaction, User } from "../db/models";
import { badRequest, notFound } from "../lib/errors";
import { me, requireAuth } from "../middleware/auth";
import { imageUpload } from "../middleware/upload";
import { getEntitlement } from "../services/billing";
import { generateImages } from "../services/images";
import { deleteFiles } from "../services/storage";
import { generationFileKeys, imageExpiresAt } from "../services/imageRetention";
import { getSetting } from "../services/settings";
import { GatewayError } from "../gateway/errors";
import { preflight, type CallerContext } from "../gateway/context";
import { rateLimiter } from "../gateway/ratelimit";
import { dispatch } from "../gateway/router";
import { listModels } from "../gateway/registry";
import { normalizeUsage } from "../gateway/stream";
import { recordRequest } from "../gateway/usage";

export const studioRouter = Router();
studioRouter.use(requireAuth);

async function ctxFor(req: Parameters<typeof me>[0]): Promise<CallerContext> {
  const user = me(req);
  return { user, apiKey: null, ent: await getEntitlement(user._id), source: "studio", ip: req.ip, userAgent: String(req.headers["user-agent"] ?? "") };
}

const serializeGen = (g: any) => ({
  id: String(g._id),
  model: g.model,
  prompt: g.prompt,
  style: g.style,
  aspect: g.aspect,
  quality: g.quality,
  width: g.width,
  height: g.height,
  n: g.n,
  images: g.images,
  refImage: g.refImage?.url ? g.refImage : null,
  priceMicros: g.priceMicros,
  costMicros: g.costMicros,
  status: g.status,
  error: g.error,
  favorite: g.favorite,
  latencyMs: g.latencyMs,
  source: g.source,
  createdAt: g.createdAt,
  /** Images and this record are deleted automatically at this time. */
  expiresAt: g.createdAt ? imageExpiresAt(g.createdAt) : null,
});

studioRouter.get("/summary", async (req, res) => {
  const user = me(req);
  const [models, defaultModel, stats] = await Promise.all([
    listModels(),
    getSetting("imageDefaultModel"),
    ImageGeneration.aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: null, generations: { $sum: 1 }, images: { $sum: { $size: "$images" } }, spent: { $sum: "$costMicros" }, favorites: { $sum: { $cond: ["$favorite", 1, 0] } } } },
    ]),
  ]);
  const imageModels = models.filter((m) => m.enabled && m.type === "image").sort((a, b) => a.sort - b.sort);
  res.json({
    imageBalance: user.imageBalance,
    models: imageModels.map((m) => ({ id: m.publicId, name: m.name, vendor: m.vendor, description: m.description, pricing: m.pricing?.perImage, capabilities: m.capabilities })),
    defaultModel: imageModels.find((m) => m.publicId === defaultModel)?.publicId ?? imageModels[0]?.publicId ?? null,
    styles: IMAGE_STYLES.map((s) => ({ id: s.id, label: s.label })),
    aspects: ASPECT_RATIOS.map((a) => a.id),
    qualities: IMAGE_QUALITIES,
    stats: { generations: stats[0]?.generations ?? 0, images: stats[0]?.images ?? 0, spentMicros: stats[0]?.spent ?? 0, favorites: stats[0]?.favorites ?? 0 },
  });
});

studioRouter.post("/generate", imageUpload.single("image"), async (req, res) => {
  const body = z
    .object({
      model: z.string().min(1),
      prompt: z.string().trim().min(1, "Describe the image you want").max(4000),
      style: z.string().max(30).optional(),
      aspect: z.enum(ASPECT_RATIOS.map((a) => a.id) as [string, ...string[]]).default("1:1"),
      quality: z.enum(IMAGE_QUALITIES).default("1K"),
      n: z.coerce.number().int().min(1).max(4).default(1),
    })
    .parse(req.body);
  const ctx = await ctxFor(req);
  const rl = rateLimiter.hit([{ key: `studio:${ctx.user._id}`, limit: 20 }]);
  if (!rl.ok) throw badRequest("You're generating very fast — please wait a few seconds.");
  const result = await generateImages(ctx, {
    model: body.model,
    prompt: body.prompt,
    style: body.style,
    aspect: body.aspect as never,
    quality: body.quality,
    n: body.n,
    refImage: req.file ? { buffer: req.file.buffer, mime: req.file.mimetype, name: req.file.originalname } : null,
  });
  const user = await User.findById(ctx.user._id).select("imageBalance").lean();
  res.json({ generation: serializeGen(result.generation.toObject()), imageBalance: user?.imageBalance ?? 0 });
});

/** Rewrite a short idea into a detailed image prompt using the utility chat model (billed as tokens). */
studioRouter.post("/enhance", async (req, res) => {
  const { prompt, style } = z.object({ prompt: z.string().trim().min(2).max(2000), style: z.string().max(30).optional() }).parse(req.body);
  const ctx = await ctxFor(req);
  const preferred = await getSetting("utilityModel");
  const chatModels = (await listModels()).filter((m) => m.enabled && m.type === "chat").sort((a, b) => a.sort - b.sort);
  const pick = chatModels.find((m) => m.publicId === preferred) ?? chatModels.find((m) => m.access === "free") ?? chatModels[0];
  if (!pick) throw badRequest("No chat model is available to enhance prompts");
  const model = await preflight(ctx, pick.publicId, "chat");
  const startedAt = Date.now();
  const messages = [
    {
      role: "system",
      content:
        "You improve prompts for an image generator. Rewrite the user's idea into one vivid, specific prompt (max 70 words): subject, setting, composition, lighting, mood, camera or medium. Reply with the prompt only, no quotes or preamble.",
    },
    { role: "user", content: `${prompt}${style && style !== "none" ? `\nStyle: ${style}` : ""}` },
  ];
  const d = await dispatch({ model, path: "/chat/completions", signal: AbortSignal.timeout(30_000), body: (up) => JSON.stringify({ model: up, messages, max_tokens: 200, temperature: 0.8 }) });
  if (d.clientError) throw new GatewayError(502, "Couldn't enhance the prompt right now", "server_error");
  const json: any = await d.res.json();
  let text = String(json?.choices?.[0]?.message?.content ?? "").trim().replace(/^["“]|["”]$/g, "");
  const usage = normalizeUsage(json?.usage);
  await recordRequest(ctx, { model, endpoint: "chat", candidate: d.candidate, status: "success", httpStatus: 200, usage, latencyMs: Date.now() - startedAt });
  // The mock provider doesn't follow instructions; keep something useful.
  if (!text || text.length > 1200 || text.includes("mock provider")) text = `${prompt}, highly detailed, rich atmosphere, balanced composition, dramatic lighting`;
  res.json({ prompt: text });
});

studioRouter.get("/generations", async (req, res) => {
  const tab = String(req.query.tab ?? "history");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(60, Number(req.query.limit) || 24);
  const filter: Record<string, unknown> = { userId: me(req)._id };
  if (tab === "favorites") filter.favorite = true;
  if (tab === "gallery" || tab === "favorites") filter.status = { $in: ["succeeded", "partial"] };
  const [rows, total] = await Promise.all([
    ImageGeneration.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ImageGeneration.countDocuments(filter),
  ]);
  res.json({ generations: rows.map(serializeGen), total, page, limit });
});

studioRouter.patch("/generations/:id", async (req, res) => {
  const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);
  const g = await ImageGeneration.findOneAndUpdate({ _id: req.params.id, userId: me(req)._id }, { $set: { favorite } }, { new: true }).lean();
  if (!g) throw notFound("Not found");
  res.json({ generation: serializeGen(g) });
});

studioRouter.delete("/generations/:id", async (req, res) => {
  const g = await ImageGeneration.findOne({ _id: req.params.id, userId: me(req)._id }).lean();
  if (!g) throw notFound("Not found");
  // Remove the files first so a storage error never leaves orphaned images behind
  await deleteFiles(generationFileKeys(g));
  await ImageGeneration.deleteOne({ _id: g._id });
  res.json({ ok: true });
});

studioRouter.get("/transactions", async (req, res) => {
  const rows = await Transaction.find({ userId: me(req)._id, wallet: "image" }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({
    transactions: rows.map((t) => ({ id: String(t._id), createdAt: t.createdAt, type: t.type, description: t.description, amountMicros: t.amountMicros, method: t.method })),
  });
});
