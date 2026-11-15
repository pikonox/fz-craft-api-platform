import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { API_KEY_SCOPES } from "@nova/shared";

const apiKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    /** First chars shown in UI, e.g. "fz_live_a1b2" */
    start: { type: String, required: true },
    last4: { type: String, required: true },
    hash: { type: String, required: true, unique: true },
    /** AES-GCM encrypted full key so the owner can reveal/copy it again */
    keyEnc: { type: String, required: true },
    scopes: { type: [String], enum: API_KEY_SCOPES, default: [...API_KEY_SCOPES] },
    /** null = use plan limit */
    rpm: { type: Number, default: null },
    tokenLimit: { type: Number, default: null },
    spendLimitMicros: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    allowedModels: { type: [String], default: [] },
    ipAllowlist: { type: [String], default: [] },
    status: { type: String, enum: ["active", "paused", "revoked"], default: "active" },
    revokedAt: { type: Date },
    // Lifetime counters
    requests: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: 0 },
    spendMicros: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true },
);
apiKeySchema.index({ userId: 1, status: 1 });

export type ApiKeyLean = InferSchemaType<typeof apiKeySchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const ApiKey = model("ApiKey", apiKeySchema);
