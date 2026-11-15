import { Router } from "express";
import { Message, Payment } from "../db/models";
import { forbidden, notFound } from "../lib/errors";
import { requireAuth, me } from "../middleware/auth";
import { getFile, mimeFromKey } from "../services/storage";

/** Public files: generated images, QR codes. Served at /files/* */
export const publicFilesRouter = Router();
publicFilesRouter.get("/*path", async (req, res) => {
  const rel = ([] as string[]).concat((req.params as { path: string | string[] }).path).join("/");
  if (!rel || rel.includes("..")) throw notFound();
  const key = `public/${rel}`;
  const buf = await getFile(key);
  if (!buf) throw notFound();
  const mime = mimeFromKey(key);
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (mime === "image/svg+xml") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buf);
});

/** Private files: payment screenshots and chat attachments. Owner or admin only. */
export const privateFilesRouter = Router();
privateFilesRouter.use(requireAuth);
privateFilesRouter.get("/*path", async (req, res) => {
  const rel = ([] as string[]).concat((req.params as { path: string | string[] }).path).join("/");
  if (!rel || rel.includes("..")) throw notFound();
  const key = `private/${rel}`;
  const user = me(req);
  const ownerId = rel.split("/")[1];
  if (user.role !== "admin" && ownerId !== String(user._id)) {
    // Fall back to an explicit ownership check
    const owned = (await Payment.exists({ userId: user._id, screenshotKey: key })) || (await Message.exists({ userId: user._id, "attachments.key": key }));
    if (!owned) throw forbidden();
  }
  const buf = await getFile(key);
  if (!buf) throw notFound();
  res.setHeader("Content-Type", mimeFromKey(key));
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buf);
});
