import { Schema, model, type InferSchemaType, Types } from "mongoose";

const requestLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    apiKeyId: { type: Schema.Types.ObjectId, ref: "ApiKey", default: null },
    model: { type: String, required: true },
    endpoint: { type: String, enum: ["chat", "messages", "embeddings", "images", "image_edits"], required: true },
    source: { type: String, enum: ["api", "playground", "studio"], default: "api" },
    providerId: { type: Schema.Types.ObjectId, ref: "Provider", default: null },
    providerName: { type: String, default: "" },
    providerKeyId: { type: Schema.Types.ObjectId, default: null },
    upstreamModel: { type: String, default: "" },
    status: { type: String, enum: ["success", "error"], required: true },
    httpStatus: { type: Number, default: 200 },
    errorCode: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cachedTokens: { type: Number, default: 0 },
    reasoningTokens: { type: Number, default: 0 },
    billedTokens: { type: Number, default: 0 },
    images: { type: Number, default: 0 },
    costMicros: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    ttftMs: { type: Number, default: null },
    stream: { type: Boolean, default: false },
    attempts: { type: Number, default: 1 },
    estimated: { type: Boolean, default: false },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
requestLogSchema.index({ userId: 1, createdAt: -1 });
requestLogSchema.index({ userId: 1, apiKeyId: 1, createdAt: -1 });
requestLogSchema.index({ userId: 1, model: 1, createdAt: -1 });
requestLogSchema.index({ createdAt: -1 });
// History is kept for 90 days
requestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600, name: "ttl_90d" });
export type RequestLogLean = InferSchemaType<typeof requestLogSchema> & { _id: Types.ObjectId; createdAt: Date };
export const RequestLog = model("RequestLog", requestLogSchema);

/** Hourly rollups for fast charts. */
const usageRollupSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  bucket: { type: Date, required: true },
  apiKeyId: { type: Schema.Types.ObjectId, default: null },
  model: { type: String, required: true },
  providerId: { type: Schema.Types.ObjectId, default: null },
  source: { type: String, default: "api" },
  requests: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  cachedTokens: { type: Number, default: 0 },
  reasoningTokens: { type: Number, default: 0 },
  billedTokens: { type: Number, default: 0 },
  images: { type: Number, default: 0 },
  costMicros: { type: Number, default: 0 },
  latencyMsSum: { type: Number, default: 0 },
});
usageRollupSchema.index({ userId: 1, bucket: 1, apiKeyId: 1, model: 1, providerId: 1, source: 1 }, { unique: true });
usageRollupSchema.index({ bucket: 1 });
export const UsageRollup = model("UsageRollup", usageRollupSchema);
