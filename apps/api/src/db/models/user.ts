import { Schema, model, type InferSchemaType, type HydratedDocument, Types } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    name: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    passwordHash: { type: String },
    googleId: { type: String },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    status: { type: String, enum: ["active", "banned", "deleted"], default: "active" },
    emailVerified: { type: Boolean, default: false },
    telegram: {
      id: { type: String },
      username: { type: String },
      verifiedAt: { type: Date },
      linkToken: { type: String },
      linkTokenExpires: { type: Date },
    },
    /** Wallets, integer micro-USD */
    mainBalance: { type: Number, default: 0 },
    imageBalance: { type: Number, default: 0 },
    /** Non-expiring tokens from referrals / admin grants */
    bonusTokens: { type: Number, default: 0 },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "User" },
    defaults: {
      model: { type: String, default: "" },
      maxTokens: { type: Number, default: 4096 },
      temperature: { type: Number, default: 0.7 },
      timezone: { type: String, default: "UTC" },
    },
    notificationPrefs: {
      emailBilling: { type: Boolean, default: true },
      emailUsage: { type: Boolean, default: true },
      emailSecurity: { type: Boolean, default: true },
      emailProduct: { type: Boolean, default: false },
      telegram: { type: Boolean, default: true },
    },
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secretEnc: { type: String },
      pendingSecretEnc: { type: String },
    },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: "string" } } });
userSchema.index({ "telegram.id": 1 }, { unique: true, partialFilterExpression: { "telegram.id": { $type: "string" } } });
userSchema.index({ "telegram.linkToken": 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export type UserLean = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const User = model("User", userSchema);

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = model("Session", sessionSchema);

const otpSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true },
    purpose: { type: String, enum: ["verify", "reset"], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
otpSchema.index({ email: 1, purpose: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OtpCode = model("OtpCode", otpSchema);
