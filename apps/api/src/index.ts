import { env } from "./config/env";
import { connectDb, disconnectDb } from "./db/connect";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { startJobs } from "./jobs";
import { startLiveFeed } from "./services/analytics";
import { startTelegramBot, stopTelegramBot } from "./services/telegram";
import { registry } from "./gateway/registry";

async function main() {
  await connectDb();
  await registry(); // warm the provider/model cache
  const app = createApp();
  const onListen = () => logger.info(`🚀 ${env.BRAND_NAME} server on http://${env.API_HOST || "localhost"}:${env.API_PORT}  (public: ${env.APP_URL})`);
  // Behind a reverse proxy, API_HOST=127.0.0.1 keeps the port off the internet
  const server = env.API_HOST ? app.listen(env.API_PORT, env.API_HOST, onListen) : app.listen(env.API_PORT, onListen);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  startLiveFeed();
  startJobs();
  await startTelegramBot();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    stopTelegramBot();
    server.close();
    await disconnectDb().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start");
  process.exit(1);
});
