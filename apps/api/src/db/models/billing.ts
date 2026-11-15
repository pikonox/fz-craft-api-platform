import { Schema, model, type InferSchemaType, Types } from "mongoose";
import {
  BILLING_CYCLES,
  MODEL_ACCESS,
  PAYMENT_METHODS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PLAN_KINDS,
  TRANSACTION_TYPES,
} from "@nova/shared";

const planSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    kind: { type: String, enum: PLAN_KINDS, default: "monthly" },
    isFree: { type: Boolean, default: false },
    /** micros */
    priceMonthly: { type: Number, default: 0 },
    priceYearly: { type: Number, default: 0 },
    /** For passes: price of one pass, valid for durationHours */
    pricePass: { type: Number, default: 0 },
    durationHours: { type: Number, default: 24 },
    tokens: { type: Number, required: true },
    rpm: { type: Number, default: 60 },
    modelAccess: { type: String, enum: MODEL_ACCESS, default: "free" },
    features: { type: [String], default: [] },
    badge: { type: String, default: "" },
    highlight: { type: Boolean, default: false },
    sort: { type: Number, default: 100 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type PlanLean = InferSchemaType<typeof planSchema> & { _id: Types.ObjectId };
export const Plan = model("Plan", planSchema);

const subscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    planSlug: { type: String, required: true },
    planName: { type: String, required: true },
    kind: { type: String, enum: PLAN_KINDS, required: true },
    cycle: { type: String, enum: BILLING_CYCLES, required: true },
    priceMicros: { type: Number, default: 0 },
    tokensLimit: { type: Number, required: true },
    tokensUsed: { type: Number, default: 0 },
    rpm: { type: Number, required: true },
    modelAccess: { type: String, enum: MODEL_ACCESS, default: "free" },
    startsAt: { type: Date, default: Date.now },
    /** Token quota resets at this time (monthly for monthly & yearly plans) */
    periodEndsAt: { type: Date, required: true },
    /** Paid-for term ends here (renew or expire) */
    termEndsAt: { type: Date, required: true },
    status: { type: String, enum: ["active", "expired", "cancelled", "refunded"], default: "active" },
    autoRenew: { type: Boolean, default: true },
    refundableUntil: { type: Date, default: null },
    alerts: { p80: { type: Boolean, default: false }, p100: { type: Boolean, default: false } },
  },
  { timestamps: true },
);
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ status: 1, periodEndsAt: 1 });
subscriptionSchema.index({ status: 1, termEndsAt: 1 });
export type SubscriptionLean = InferSchemaType<typeof subscriptionSchema> & { _id: Types.ObjectId; createdAt: Date };
export const Subscription = model("Subscription", subscriptionSchema);

const transactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    wallet: { type: String, enum: ["main", "image", "tokens"], required: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    /** signed micros (for main/image wallets) */
    amountMicros: { type: Number, default: 0 },
    /** signed tokens (for token grants) */
    tokens: { type: Number, default: 0 },
    balanceAfter: { type: Number, default: null },
    description: { type: String, required: true },
    reference: { type: String, default: "" },
    method: { type: String, default: "" },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    status: { type: String, enum: ["completed", "pending", "failed"], default: "completed" },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
transactionSchema.index({ userId: 1, createdAt: -1 });
export const Transaction = model("Transaction", transactionSchema);

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    purpose: { type: String, enum: PAYMENT_PURPOSES, required: true },
    planId: { type: Schema.Types.ObjectId, ref: "Plan" },
    cycle: { type: String, enum: BILLING_CYCLES },
    /** Expected amount in micros */
    amountMicros: { type: Number, required: true },
    amountPkr: { type: Number, default: null },
    pkrRate: { type: Number, default: null },
    /** What actually arrived (auto-verified methods) or what the admin approved */
    receivedMicros: { type: Number, default: null },
    reference: { type: String, default: "" },
    /** `${method}:${reference}` while the reference is claimed; unset on reject so it can be reused */
    referenceKey: { type: String },
    screenshotKey: { type: String, default: "" },
    userNote: { type: String, default: "" },
    status: { type: String, enum: PAYMENT_STATUSES, default: "awaiting_payment" },
    history: {
      type: [{ status: String, at: { type: Date, default: Date.now }, note: String, _id: false }],
      default: [],
    },
    verification: {
      attempts: { type: Number, default: 0 },
      lastCheckedAt: { type: Date },
      lastError: { type: String, default: "" },
      data: { type: Schema.Types.Mixed },
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rejectReason: { type: String, default: "" },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ referenceKey: 1 }, { unique: true, partialFilterExpression: { referenceKey: { $type: "string" } } });
export type PaymentLean = InferSchemaType<typeof paymentSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Payment = model("Payment", paymentSchema);

const paymentMethodSchema = new Schema(
  {
    method: { type: String, enum: PAYMENT_METHODS, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    label: { type: String, required: true },
    currency: { type: String, enum: ["USDT", "PKR"], required: true },
    details: {
      payId: String,
      name: String,
      address: String,
      network: String,
      accountTitle: String,
      accountNumber: String,
      iban: String,
      bankName: String,
    },
    qrImageKey: { type: String, default: "" },
    instructions: { type: String, default: "" },
    minUsd: { type: Number, default: 2 },
    sort: { type: Number, default: 100 },
  },
  { timestamps: true },
);
export type PaymentMethodLean = InferSchemaType<typeof paymentMethodSchema> & { _id: Types.ObjectId };
export const PaymentMethodConfig = model("PaymentMethod", paymentMethodSchema);
