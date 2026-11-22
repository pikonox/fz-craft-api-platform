import cron from "node-cron";
import { processSubscriptionCycles } from "../services/billing";
import { processPendingPayments } from "../services/payments";
import { purgeExpiredImages } from "../services/imageRetention";
import { checkUpstreamPool } from "../services/adminAlerts";
import { logger } from "../lib/logger";

let running: Record<string, boolean> = {};

function job(name: string, fn: () => Promise<unknown>) {
  return async () => {
    if (running[name]) return;
    running[name] = true;
    try {
      await fn();
    } catch (err) {
      logger.error({ err, job: name }, "job failed");
    } finally {
      running[name] = false;
    }
  };
}

export function startJobs() {
  const subs = job("subscriptions", processSubscriptionCycles);
  const pays = job("payments", processPendingPayments);
  const images = job("image-retention", () => purgeExpiredImages());
  const pool = job("upstream-pool", checkUpstreamPool);
  cron.schedule("*/2 * * * *", subs);
  cron.schedule("* * * * *", pays);
  cron.schedule("*/15 * * * *", images);
  cron.schedule("*/10 * * * *", pool);
  // Run once shortly after boot
  setTimeout(() => {
    void subs();
    void pays();
    void images();
    void pool();
  }, 5_000);
  logger.info("Background jobs scheduled");
}

export function resetJobState() {
  running = {};
}
