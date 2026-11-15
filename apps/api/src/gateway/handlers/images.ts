import type { Request, Response } from "express";
import { generateImages, toOpenAiImageResponse } from "../../services/images";
import { GatewayError } from "../errors";

export async function imageGenerations(req: Request, res: Response) {
  const b = req.body ?? {};
  const result = await generateImages(req.gw!, {
    model: b.model,
    prompt: b.prompt,
    n: b.n,
    size: b.size,
    aspect: b.aspect_ratio,
    quality: b.quality === "4K" || b.quality === "2K" || b.quality === "1K" ? b.quality : undefined,
    style: b.style,
  });
  res.json(toOpenAiImageResponse(result, b.response_format));
}

export async function imageEdits(req: Request, res: Response) {
  const b = req.body ?? {};
  const file = req.file;
  if (!file) throw new GatewayError(400, "'image' file is required.", "invalid_request_error", "invalid_value", "image");
  const result = await generateImages(req.gw!, {
    model: b.model,
    prompt: b.prompt,
    n: b.n,
    size: b.size,
    refImage: { buffer: file.buffer, mime: file.mimetype, name: file.originalname },
  });
  res.json(toOpenAiImageResponse(result, b.response_format));
}
