import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { FEEDBACK_TYPES, IMAGE_QUALITIES, NOTIFICATION_TYPES, TICKET_CATEGORIES } from "@nova/shared";

// ── Image Studio ────────────────────────────────────────
const imageGenerationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    apiKeyId: { type: Schema.Types.ObjectId, default: null },
    source: { type: String, enum: ["studio", "api"], default: "studio" },
    model: { type: String, required: true },
    prompt: { type: String, required: true },
    finalPrompt: { type: String, default: "" },
    style: { type: String, default: "none" },
    aspect: { type: String, default: "1:1" },
    quality: { type: String, enum: IMAGE_QUALITIES, default: "1K" },
    width: Number,
    height: Number,
    n: { type: Number, default: 1 },
    images: { type: [{ key: String, url: String, width: Number, height: Number, mime: String, _id: false }], default: [] },
    refImage: { key: String, url: String },
    priceMicros: { type: Number, default: 0 },
    costMicros: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "succeeded", "partial", "failed"], default: "pending" },
    error: { type: String, default: "" },
    favorite: { type: Boolean, default: false },
    latencyMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);
imageGenerationSchema.index({ userId: 1, createdAt: -1 });
// Used by the retention job that deletes images after IMAGE_RETENTION_HOURS
imageGenerationSchema.index({ createdAt: 1 });
export type ImageGenerationLean = InferSchemaType<typeof imageGenerationSchema> & { _id: Types.ObjectId; createdAt: Date };
export const ImageGeneration = model("ImageGeneration", imageGenerationSchema);

// ── Referrals ───────────────────────────────────────────
const referralSchema = new Schema(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    refereeId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    code: { type: String, required: true },
    via: { type: String, enum: ["link", "code"], default: "link" },
    status: { type: String, enum: ["pending", "verified"], default: "pending" },
    rewardTokens: { type: Number, default: 0 },
    verifiedAt: { type: Date },
  },
  { timestamps: true },
);
export const Referral = model("Referral", referralSchema);

// ── Notifications ───────────────────────────────────────
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: "system" },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    link: { type: String, default: "" },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });
export const Notification = model("Notification", notificationSchema);

// ── Support ─────────────────────────────────────────────
const ticketSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    number: { type: Number, required: true, unique: true },
    subject: { type: String, required: true },
    category: { type: String, enum: TICKET_CATEGORIES, default: "other" },
    status: { type: String, enum: ["open", "answered", "closed"], default: "open" },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
    messages: {
      type: [
        {
          from: { type: String, enum: ["user", "admin"], required: true },
          authorId: { type: Schema.Types.ObjectId, ref: "User" },
          authorName: String,
          body: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
ticketSchema.index({ userId: 1, lastActivityAt: -1 });
ticketSchema.index({ status: 1, lastActivityAt: -1 });
export const Ticket = model("Ticket", ticketSchema);

const feedbackSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: FEEDBACK_TYPES, default: "idea" },
    rating: { type: Number, min: 1, max: 5, default: null },
    message: { type: String, required: true },
    page: { type: String, default: "" },
    status: { type: String, enum: ["new", "reviewed"], default: "new" },
  },
  { timestamps: true },
);
export const Feedback = model("Feedback", feedbackSchema);

// ── System ──────────────────────────────────────────────
const settingSchema = new Schema({ key: { type: String, unique: true, required: true }, value: Schema.Types.Mixed }, { timestamps: true });
export const Setting = model("Setting", settingSchema);

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = model("Counter", counterSchema);

export async function nextSequence(name: string, start = 1000): Promise<number> {
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return start + (doc?.seq ?? 1);
}

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    targetType: String,
    targetId: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ createdAt: -1 });
export const AuditLog = model("AuditLog", auditLogSchema);
