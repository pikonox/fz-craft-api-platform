import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";
import { randomBase62 } from "../lib/crypto";
import { logger } from "../lib/logger";

/**
 * Files are stored under two prefixes:
 *  - public/...  served without auth (generated images, payment QR codes)
 *  - private/... served only to the owner or an admin (payment screenshots, chat attachments)
 *
 * Drivers: local disk (the default, also used on the VPS), S3-compatible, or Cloudinary.
 */
export type Visibility = "public" | "private";

const localRoot = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

const s3 =
  env.STORAGE_DRIVER === "s3"
    ? new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT || undefined,
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
        forcePathStyle: Boolean(env.S3_ENDPOINT),
      })
    : null;

const useCloudinary = env.STORAGE_DRIVER === "cloudinary";
if (useCloudinary) {
  const hint = "CLOUDINARY_URL must look like cloudinary://API_KEY:API_SECRET@CLOUD_NAME (copy it from Cloudinary → Settings → API Keys)";
  // Cloudinary's copy button includes the variable name — tolerate "CLOUDINARY_URL=cloudinary://…"
  const raw = env.CLOUDINARY_URL.replace(/^(CLOUDINARY_URL=)+/, "").replace(/^["']|["']$/g, "");
  if (!raw) throw new Error(`STORAGE_DRIVER=cloudinary needs ${hint}`);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid CLOUDINARY_URL. ${hint}`);
  }
  if (u.protocol !== "cloudinary:" || !u.username || !u.password || !u.hostname) throw new Error(`Invalid CLOUDINARY_URL. ${hint}`);
  cloudinary.config({ cloud_name: u.hostname, api_key: decodeURIComponent(u.username), api_secret: decodeURIComponent(u.password), secure: true });
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

export function extFor(mime: string, fallback = "bin") {
  return EXT[mime] ?? fallback;
}

export function newKey(visibility: Visibility, folder: string, mime: string, ownerId?: string) {
  const owner = ownerId ? `${ownerId}/` : "";
  return `${visibility}/${folder}/${owner}${Date.now().toString(36)}-${randomBase62(16)}.${extFor(mime)}`;
}

// ── Cloudinary mapping ──────────────────────────────────

/** Raster formats go through Cloudinary's image pipeline; everything else (SVG, PDF, text) is stored raw so account delivery restrictions don't apply. */
const CLOUDINARY_RASTER = new Set(["png", "jpg", "webp", "gif"]);

export type CloudinaryAsset = { publicId: string; resourceType: "image" | "raw"; type: "upload" | "authenticated"; format?: string };

/** Maps a storage key to its Cloudinary asset. Private keys become "authenticated" assets that need a signed URL. */
export function cloudinaryAsset(key: string, folder = env.CLOUDINARY_FOLDER): CloudinaryAsset {
  const dot = key.lastIndexOf(".");
  const ext = dot > key.lastIndexOf("/") ? key.slice(dot + 1).toLowerCase() : "";
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  const full = prefix ? `${prefix}/${key}` : key;
  const type = key.startsWith("private/") ? "authenticated" : "upload";
  if (CLOUDINARY_RASTER.has(ext)) return { publicId: full.slice(0, -(ext.length + 1)), resourceType: "image", type, format: ext };
  return { publicId: full, resourceType: "raw", type };
}

function cloudinaryUrl(key: string) {
  const a = cloudinaryAsset(key);
  return cloudinary.url(a.publicId, { resource_type: a.resourceType, type: a.type, format: a.format, secure: true, sign_url: a.type === "authenticated" });
}

// ── API ─────────────────────────────────────────────────

export async function putFile(key: string, data: Buffer, mime: string) {
  if (useCloudinary) {
    const a = cloudinaryAsset(key);
    await new Promise<void>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ public_id: a.publicId, resource_type: a.resourceType, type: a.type, overwrite: true }, (err) =>
          err ? reject(new Error(`Cloudinary upload failed: ${err.message}`)) : resolve(),
        )
        .end(data);
    });
    return;
  }
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: data, ContentType: mime }));
    return;
  }
  const full = safePath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

export async function getFile(key: string): Promise<Buffer | null> {
  try {
    if (useCloudinary) {
      const r = await fetch(cloudinaryUrl(key), { signal: AbortSignal.timeout(20_000) });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    }
    if (s3) {
      const out = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      const bytes = await out.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    }
    return await fs.readFile(safePath(key));
  } catch {
    return null;
  }
}

/**
 * Deletes many files. Missing files count as deleted. On Cloudinary, provider errors
 * (auth, rate limit, network) are thrown so callers can keep their records and retry.
 */
export async function deleteFiles(keys: (string | null | undefined)[]) {
  const list = [...new Set(keys.filter((k): k is string => Boolean(k)))];
  if (!list.length) return;
  if (useCloudinary) {
    const groups = new Map<string, { resourceType: CloudinaryAsset["resourceType"]; type: CloudinaryAsset["type"]; ids: string[] }>();
    for (const key of list) {
      const a = cloudinaryAsset(key);
      const g = groups.get(`${a.resourceType}:${a.type}`) ?? { resourceType: a.resourceType, type: a.type, ids: [] };
      g.ids.push(a.publicId);
      groups.set(`${a.resourceType}:${a.type}`, g);
    }
    for (const g of groups.values()) {
      // The Admin API takes at most 100 public ids per call
      for (let i = 0; i < g.ids.length; i += 100) {
        await cloudinary.api.delete_resources(g.ids.slice(i, i + 100), { resource_type: g.resourceType, type: g.type, invalidate: true });
      }
    }
    return;
  }
  await Promise.all(
    list.map(async (key) => {
      try {
        if (s3) await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
        else await fs.unlink(safePath(key));
      } catch {
        /* already gone */
      }
    }),
  );
}

/** Best-effort single delete (never throws). */
export async function deleteFile(key: string) {
  try {
    await deleteFiles([key]);
  } catch (err) {
    logger.warn({ err, key }, "File delete failed");
  }
}

/** URL the browser can load. Public files come from the CDN (Cloudinary/S3) or /files; private ones go through the authed API. */
export function fileUrl(key: string): string {
  if (!key) return "";
  if (key.startsWith("public/")) {
    if (useCloudinary) return cloudinaryUrl(key);
    if (s3 && env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
    return `/files/${key.slice("public/".length)}`;
  }
  return `/api/files/${key.slice("private/".length)}`;
}

export function absoluteUrl(url: string) {
  return url.startsWith("http") ? url : `${env.APP_URL.replace(/\/$/, "")}${url}`;
}

function safePath(key: string) {
  const full = path.resolve(localRoot, key);
  if (!full.startsWith(localRoot + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export function mimeFromKey(key: string): string {
  const ext = key.split(".").pop() ?? "";
  const found = Object.entries(EXT).find(([, e]) => e === ext);
  return found?.[0] ?? "application/octet-stream";
}
