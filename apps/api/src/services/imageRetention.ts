import { env } from "../config/env";
import { ImageGeneration } from "../db/models";
import { logger } from "../lib/logger";
import { deleteFiles } from "./storage";

/**
 * Generated images (Image Studio and /v1/images) are temporary: after IMAGE_RETENTION_HOURS
 * (default 48) the files are deleted from storage and the generation record is removed.
 * Billing transactions and request logs are kept, so usage and spend history stay intact.
 */
export const IMAGE_RETENTION_MS = env.IMAGE_RETENTION_HOURS * 3_600_000;

export function imageExpiresAt(createdAt: Date | string | number) {
  return new Date(new Date(createdAt).getTime() + IMAGE_RETENTION_MS);
}

/** All storage keys a generation owns (results + uploaded reference image). */
export function generationFileKeys(g: { images?: { key?: string | null }[] | null; refImage?: { key?: string | null } | null }) {
  return [...(g.images ?? []).map((i) => i.key), g.refImage?.key].filter((k): k is string => Boolean(k));
}

/**
 * Deletes expired generations in batches. Files go first; a record is removed only after its
 * files are gone, so a storage outage leaves records in place and the next run retries them.
 */
export async function purgeExpiredImages(now = new Date(), batchSize = 200) {
  const cutoff = new Date(now.getTime() - IMAGE_RETENTION_MS);
  let generations = 0;
  let files = 0;
  for (;;) {
    const rows = await ImageGeneration.find({ createdAt: { $lte: cutoff } }, { images: 1, refImage: 1 })
      .sort({ createdAt: 1 })
      .limit(batchSize)
      .lean();
    if (!rows.length) break;
    const keys = rows.flatMap(generationFileKeys);
    await deleteFiles(keys);
    await ImageGeneration.deleteMany({ _id: { $in: rows.map((r) => r._id) } });
    generations += rows.length;
    files += keys.length;
    if (rows.length < batchSize) break;
  }
  if (generations) logger.info({ generations, files, retentionHours: env.IMAGE_RETENTION_HOURS }, "Deleted expired images");
  return { generations, files };
}
