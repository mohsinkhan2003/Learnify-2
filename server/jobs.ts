import { deleteExpiredSessions } from "./auth/sessions";
import { purgeExpiredRateLimits } from "./middleware/pg-rate-limit-store";
import { processDueNotifications } from "./notifications/push.service";
import { config } from "./config/env";

/** Daily housekeeping plus a notification sweep. Safe to run concurrently (idempotent). */
export async function runMaintenance(): Promise<void> {
  await processDueNotifications();
  await deleteExpiredSessions();
  if (config.rateLimitStore === "postgres") await purgeExpiredRateLimits();
}
