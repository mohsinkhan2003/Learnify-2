import type { IncomingMessage, ServerResponse } from "http";
import { waitUntil } from "@vercel/functions";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { initPush, processDueNotifications } from "./notifications/push.service";

// Vercel serverless entry: the same Express app, without the static server (Vercel's CDN serves
// the client) and without timers (instances are frozen between requests). Instead, due
// notifications are swept at most once a minute per instance while requests arrive, plus the
// daily cron (/api/internal/cron) for housekeeping.
const app = createApp();
initPush();

const SWEEP_EVERY_MS = 60_000;
let lastSweep = 0;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const now = Date.now();
  if (now - lastSweep > SWEEP_EVERY_MS) {
    lastSweep = now;
    waitUntil(processDueNotifications().catch((err) => logger.error({ err }, "Notification sweep failed")));
  }
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
