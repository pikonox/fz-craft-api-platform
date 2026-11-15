import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { MODEL_ACCESS, MODEL_CAPABILITIES, MODEL_STATUSES, MODEL_TYPES } from "@nova/shared";

/** An upstream OpenAI-compatible endpoint, e.g. https://api.example.com/v1 */
const providerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    baseUrl: { type: String, required: true, trim: true },
    headers: { type: Map, of: String, default: {} },
    enabled: { type: Boolean, default: true },
    timeoutMs: { type: Number, default: 120_000 },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);
export type ProviderLean = InferSchemaType<typeof providerSchema> & { _id: Types.ObjectId };
export const Provider = model("Provider", providerSchema);

/** One upstream API key in the pool. */
const providerKeySchema = new Schema(
  {
    providerId: { type: Schema.Types.ObjectId, ref: "Provider", required: true, index: true },
    label: { type: String, default: "" },
    keyEnc: { type: String, required: true },
    last4: { type: String, default: "" },
    weight: { type: Number, default: 1, min: 0 },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    failStreak: { type: Number, default: 0 },
    cooldownUntil: { type: Date, default: null },
    lastError: { type: String, default: "" },
    lastErrorAt: { type: Date },
    lastUsedAt: { type: Date },
    successCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export type ProviderKeyLean = InferSchemaType<typeof providerKeySchema> & { _id: Types.ObjectId };
export const ProviderKey = model("ProviderKey", providerKeySchema);

const routeSchema = new Schema(
  {
    providerId: { type: Schema.Types.ObjectId, ref: "Provider", required: true },
    upstreamModel: { type: String, required: true },
    /** Lower = tried first. Same priority = weighted load balancing. */
    priority: { type: Number, default: 1 },
    weight: { type: Number, default: 1 },
    enabled: { type: Boolean, default: true },
  },
  { _id: true },
);

const modelSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true },
    type: { type: String, enum: MODEL_TYPES, default: "chat" },
    vendor: { type: String, default: "" },
    description: { type: String, default: "" },
    capabilities: { type: [String], enum: MODEL_CAPABILITIES, default: ["streaming"] },
    contextLength: { type: Number, default: 128_000 },
    maxOutput: { type: Number, default: 16_384 },
    access: { type: String, enum: MODEL_ACCESS, default: "free" },
    enabled: { type: Boolean, default: true },
    status: { type: String, enum: MODEL_STATUSES, default: "active" },
    featured: { type: Boolean, default: false },
    sort: { type: Number, default: 100 },
    pricing: {
      /** micros per 1M tokens (shown as "cost at model price") */
      inputPer1M: { type: Number, default: 0 },
      outputPer1M: { type: Number, default: 0 },
      cachedInputPer1M: { type: Number, default: 0 },
      /** micros per image by quality tier (charged from the image wallet) */
      perImage: {
        "1K": { type: Number, default: 0 },
        "2K": { type: Number, default: 0 },
        "4K": { type: Number, default: 0 },
      },
    },
    routes: { type: [routeSchema], default: [] },
  },
  { timestamps: true },
);
export type ModelLean = InferSchemaType<typeof modelSchema> & { _id: Types.ObjectId };
export const AiModel = model("Model", modelSchema);
