import multer from "multer";
import { badRequest } from "../lib/errors";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const DOC_TYPES = ["application/pdf", "text/plain", "text/markdown", "text/csv", "application/json"];

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(badRequest("Only PNG, JPG, WEBP or GIF images are allowed"));
  },
});

export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = IMAGE_TYPES.includes(file.mimetype) || DOC_TYPES.includes(file.mimetype) || /\.(md|txt|csv|json|ts|tsx|js|py|go|rs|java|html|css|yaml|yml)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(badRequest("Unsupported file type"));
  },
});

export const IMAGE_MIME = IMAGE_TYPES;
