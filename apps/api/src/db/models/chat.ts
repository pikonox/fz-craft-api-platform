import { Schema, model, type InferSchemaType, Types } from "mongoose";

const conversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: "New chat" },
    model: { type: String, default: "" },
    pinned: { type: Boolean, default: false },
    /** Leaf of the branch currently shown */
    currentLeafId: { type: Schema.Types.ObjectId, default: null },
    params: {
      temperature: { type: Number, default: 0.7 },
      maxTokens: { type: Number, default: 4096 },
      topP: { type: Number, default: 1 },
      system: { type: String, default: "" },
      reasoningEffort: { type: String, enum: ["", "low", "medium", "high"], default: "" },
      jsonMode: { type: Boolean, default: false },
      webSearch: { type: Boolean, default: false },
    },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
conversationSchema.index({ userId: 1, pinned: -1, lastMessageAt: -1 });
conversationSchema.index({ userId: 1, title: "text" });
export type ConversationLean = InferSchemaType<typeof conversationSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Conversation = model("Conversation", conversationSchema);

const attachmentSchema = new Schema(
  {
    kind: { type: String, enum: ["image", "file"], required: true },
    name: { type: String, default: "" },
    mime: { type: String, default: "" },
    size: { type: Number, default: 0 },
    key: { type: String, default: "" },
    url: { type: String, default: "" },
    /** Extracted text for documents (sent to the model) */
    text: { type: String, default: "" },
  },
  { _id: false },
);

const toolCallSchema = new Schema(
  {
    id: String,
    name: String,
    args: { type: Schema.Types.Mixed },
    status: { type: String, enum: ["running", "done", "error"], default: "done" },
    summary: String,
    sources: { type: [{ title: String, url: String, snippet: String, _id: false }], default: [] },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    parentId: { type: Schema.Types.ObjectId, default: null },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
    reasoning: { type: String, default: "" },
    reasoningMs: { type: Number, default: 0 },
    toolCalls: { type: [toolCallSchema], default: [] },
    model: { type: String, default: "" },
    usage: {
      input: { type: Number, default: 0 },
      output: { type: Number, default: 0 },
      cached: { type: Number, default: 0 },
      reasoning: { type: Number, default: 0 },
    },
    latencyMs: { type: Number, default: 0 },
    ttftMs: { type: Number, default: 0 },
    status: { type: String, enum: ["complete", "streaming", "stopped", "error"], default: "complete" },
    error: { type: String, default: "" },
    feedback: { type: String, enum: ["", "up", "down"], default: "" },
  },
  { timestamps: true },
);
messageSchema.index({ conversationId: 1, createdAt: 1 });
export type MessageLean = InferSchemaType<typeof messageSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Message = model("Message", messageSchema);
