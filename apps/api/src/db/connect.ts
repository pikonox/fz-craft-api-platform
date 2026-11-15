import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "../lib/logger";

mongoose.set("strictQuery", true);

export async function connectDb() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: mongoose.connection.name }, "MongoDB connected");
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/** Run `fn` inside a MongoDB transaction (requires a replica set). */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
