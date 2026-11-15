import pino from "pino";
import { isDev } from "../config/env";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  transport: isDev ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } } : undefined,
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.apiKey"],
});
