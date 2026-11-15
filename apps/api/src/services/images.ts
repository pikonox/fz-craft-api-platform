import {
  IMAGE_STYLES,
  formatUsd,
  imageDimensions,
  qualityForSize,
  type AspectRatioId,
  type ImageQuality,
} from "@nova/shared";
import { ImageGeneration, Transaction, User, type ModelLean } from "../db/models";
import { GatewayError } from "../gateway/errors";
import { preflight, type CallerContext } from "../gateway/context";
import { dispatch } from "../gateway/router";
import { recordRequest } from "../gateway/usage";
import { scrubUpstreamError } from "../gateway/handlers/chat";
import { debitWallet } from "./billing";
import { absoluteUrl, fileUrl, newKey, putFile } from "./storage";
import { logger } from "../lib/logger";

export type GenerateParams = {
  model: string;
  prompt: string;
  n?: number;
  /** OpenAI style "1792x1024". Takes precedence over aspect/quality. */
  size?: string;
  aspect?: AspectRatioId;
  quality?: ImageQuality;
  style?: string;
  refImage?: { buffer: Buffer; mime: string; name: string } | null;
};

export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  const head = buf.toString("utf8", 0, 200).trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

function parseSize(size?: string) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(size ?? "");
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

function stylePrompt(prompt: string, style?: string) {
  const s = IMAGE_STYLES.find((x) => x.id === style);
  return s && s.suffix ? `${prompt.trim()}, ${s.suffix}` : prompt.trim();
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 30 * 1024 * 1024 ? null : buf;
  } catch {
    return null;
  }
}

export function imagePrice(model: Pick<ModelLean, "pricing">, quality: ImageQuality): number {
  return model.pricing?.perImage?.[quality] ?? 0;
}

/**
 * Generate (or edit, when refImage is set) images. Holds n × price from the image wallet,
 * charges only for images that come back and returns the rest.
 */
export async function generateImages(ctx: CallerContext, p: GenerateParams) {
  const prompt = (p.prompt ?? "").trim();
  if (!prompt) throw new GatewayError(400, "'prompt' is required.", "invalid_request_error", "invalid_value", "prompt");
  if (prompt.length > 4000) throw new GatewayError(400, "'prompt' must be 4000 characters or fewer.", "invalid_request_error", "invalid_value", "prompt");
  const model = await preflight(ctx, p.model, "image");

  const n = Math.min(4, Math.max(1, Math.floor(Number(p.n ?? 1)) || 1));
  const explicit = parseSize(p.size);
  const quality: ImageQuality = explicit ? qualityForSize(p.size) : (p.quality ?? "1K");
  const dims = explicit ?? imageDimensions(p.aspect ?? "1:1", quality);
  const price = imagePrice(model, quality);
  const hold = price * n;
  const finalPrompt = stylePrompt(prompt, p.style);
  const userId = ctx.user._id;
  const startedAt = Date.now();

  if (hold > 0) {
    await debitWallet({ userId, wallet: "image", amountMicros: hold, type: "image_charge", description: "Image hold", noLedger: true }).catch(() => {
      throw new GatewayError(402, `Not enough image balance: ${n} image(s) cost ${formatUsd(hold)}. Top up your image wallet to continue.`, "insufficient_quota", "insufficient_image_balance");
    });
  }

  const gen = await ImageGeneration.create({
    userId,
    apiKeyId: ctx.apiKey?._id ?? null,
    source: ctx.source === "api" ? "api" : "studio",
    model: model.publicId,
    prompt,
    finalPrompt,
    style: p.style ?? "none",
    aspect: p.aspect ?? "1:1",
    quality,
    width: dims.width,
    height: dims.height,
    n,
    priceMicros: price,
    status: "pending",
  });

  let refKey = "";
  if (p.refImage) {
    refKey = newKey("public", "refs", p.refImage.mime, String(userId));
    await putFile(refKey, p.refImage.buffer, p.refImage.mime);
    gen.refImage = { key: refKey, url: fileUrl(refKey) };
  }

  const ac = new AbortController();
  const endpoint = p.refImage ? ("image_edits" as const) : ("images" as const);
  const size = `${dims.width}x${dims.height}`;

  const refund = async (amount: number) => {
    if (amount > 0) await User.updateOne({ _id: userId }, { $inc: { imageBalance: amount } });
  };

  try {
    const d = await dispatch({
      model,
      path: p.refImage ? "/images/edits" : "/images/generations",
      json: !p.refImage,
      signal: ac.signal,
      body: (up) => {
        if (!p.refImage) return JSON.stringify({ model: up, prompt: finalPrompt, n, size, response_format: "b64_json" });
        const fd = new FormData();
        fd.append("model", up);
        fd.append("prompt", finalPrompt);
        fd.append("n", String(n));
        fd.append("size", size);
        fd.append("response_format", "b64_json");
        fd.append("image", new Blob([new Uint8Array(p.refImage.buffer)], { type: p.refImage.mime }), p.refImage.name || "image.png");
        return fd;
      },
    });

    if (d.clientError) {
      const err = scrubUpstreamError(await d.res.text(), d.candidate.upstreamModel, model.publicId);
      throw new GatewayError(d.res.status, err?.error?.message ?? "The image request was rejected.", "invalid_request_error", err?.error?.code ?? "upstream_rejected");
    }

    const json: any = await d.res.json();
    const items: any[] = Array.isArray(json?.data) ? json.data.slice(0, n) : [];
    const stored: { key: string; url: string; width: number; height: number; mime: string; buffer: Buffer; revised?: string }[] = [];
    for (const item of items) {
      let buf: Buffer | null = null;
      if (typeof item?.b64_json === "string") buf = Buffer.from(item.b64_json, "base64");
      else if (typeof item?.url === "string") buf = await fetchImage(item.url);
      if (!buf) continue;
      const mime = sniffImageMime(buf);
      if (!mime) continue;
      const key = newKey("public", "images", mime, String(userId));
      await putFile(key, buf, mime);
      stored.push({ key, url: fileUrl(key), width: dims.width, height: dims.height, mime, buffer: buf, revised: item.revised_prompt });
    }

    const charge = stored.length * price;
    await refund(hold - charge);
    if (charge > 0) {
      const u = await User.findById(userId).select("imageBalance").lean();
      await Transaction.create({
        userId,
        wallet: "image",
        type: "image_charge",
        amountMicros: -charge,
        balanceAfter: u?.imageBalance ?? null,
        description: `${stored.length} image${stored.length > 1 ? "s" : ""} · ${model.name} · ${quality}`,
        reference: String(gen._id),
      });
    }

    gen.set("images", stored.map(({ key, url, width, height, mime }) => ({ key, url, width, height, mime })));
    gen.costMicros = charge;
    gen.status = stored.length === 0 ? "failed" : stored.length < n ? "partial" : "succeeded";
    gen.error = stored.length === 0 ? "The provider returned no images" : "";
    gen.latencyMs = Date.now() - startedAt;
    await gen.save();

    await recordRequest(ctx, {
      model,
      endpoint,
      candidate: d.candidate,
      attempts: d.attempts,
      status: stored.length ? "success" : "error",
      httpStatus: stored.length ? 200 : 502,
      errorMessage: gen.error,
      images: stored.length,
      costMicros: charge,
      latencyMs: gen.latencyMs,
    });

    if (!stored.length) throw new GatewayError(502, "The image provider returned no images. You were not charged.", "server_error", "no_images");
    return { generation: gen, stored, created: Math.floor(Date.now() / 1000) };
  } catch (err) {
    if (gen.status === "pending") {
      await refund(hold);
      gen.status = "failed";
      gen.error = (err as Error)?.message ?? "failed";
      gen.latencyMs = Date.now() - startedAt;
      await gen.save().catch(() => {});
      const ge = err instanceof GatewayError ? err : null;
      if (!ge || ge.status !== 499) {
        await recordRequest(ctx, {
          model,
          endpoint,
          status: "error",
          httpStatus: ge?.status ?? 500,
          errorCode: ge?.code ?? "image_failed",
          errorMessage: gen.error,
          costMicros: 0,
          latencyMs: gen.latencyMs,
        });
      }
    }
    if (!(err instanceof GatewayError)) logger.error({ err }, "image generation failed");
    throw err;
  }
}

/** OpenAI-style response payload for /v1/images/*. */
export function toOpenAiImageResponse(result: Awaited<ReturnType<typeof generateImages>>, format: string | undefined) {
  return {
    created: result.created,
    data: result.stored.map((s) =>
      format === "b64_json" ? { b64_json: s.buffer.toString("base64"), revised_prompt: s.revised } : { url: absoluteUrl(s.url), revised_prompt: s.revised },
    ),
  };
}
