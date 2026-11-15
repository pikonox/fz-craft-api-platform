import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env, isDev } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./lib/errors";
import { loadSession } from "./middleware/auth";
import { v1Router } from "./gateway";
import { mockUpstream } from "./dev/mockUpstream";
import { authRouter } from "./routes/auth";
import { meRouter } from "./routes/me";
import { keysRouter } from "./routes/keys";
import { usageRouter } from "./routes/usage";
import { catalogRouter } from "./routes/catalog";
import { playgroundRouter } from "./routes/playground";
import { billingRouter } from "./routes/billing";
import { studioRouter } from "./routes/studio";
import { feedbackRouter, notificationsRouter, referralsRouter, supportRouter } from "./routes/social";
import { adminRouter } from "./routes/admin";
import { privateFilesRouter, publicFilesRouter } from "./routes/files";

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // Request logs: only problems by default — errors, failed requests and slow ones (LOG_REQUESTS=all logs everything)
  const logAll = process.env.LOG_REQUESTS === "all";
  const SLOW_MS = 1500;
  app.use((req, _res, next) => {
    (req as { startedAt?: number }).startedAt = Date.now();
    next();
  });
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/health" || req.url?.startsWith("/files/") === true || req.url?.startsWith("/api/usage/live") === true },
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (logAll) return res.statusCode >= 400 ? "warn" : "info";
        // Signed-out visitors checking for a session is normal, not a problem
        if (res.statusCode === 401 && req.url?.startsWith("/api/me")) return "silent";
        if (res.statusCode >= 400) return "warn";
        const ms = Date.now() - ((req as { startedAt?: number }).startedAt ?? Date.now());
        return ms > SLOW_MS ? "warn" : "silent";
      },
      serializers: { req: (req) => ({ method: req.method, url: req.url }), res: (res) => ({ status: res.statusCode }) },
    }),
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Public OpenAI-compatible API (API-key auth, own error format)
  app.use("/v1", v1Router);
  if (env.ENABLE_MOCK_PROVIDER) app.use("/mock/v1", mockUpstream);

  // Static generated files
  app.use("/files", publicFilesRouter);

  // Dashboard API (cookie session)
  app.use("/api", cookieParser(), express.json({ limit: "5mb" }), loadSession);
  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/keys", keysRouter);
  app.use("/api/usage", usageRouter);
  app.use("/api/playground", playgroundRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/studio", studioRouter);
  app.use("/api/referrals", referralsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/feedback", feedbackRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/files", privateFilesRouter);
  app.use("/api", catalogRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (isDev) logger.debug("Express app created");
  return app;
}
