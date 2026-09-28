import { createServer } from "http";
import { config } from "./config/env";
import { logger } from "./lib/logger";
import { checkDatabase, pool } from "./db";
import { createApp } from "./app";
import { deleteExpiredSessions } from "./auth/sessions";
import { initPush, processDueNotifications } from "./notifications/push.service";
import { serveStatic } from "./static";

async function main() {
  const app = createApp();
  const server = createServer(app);

  if (config.env === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  try {
    await checkDatabase();
    logger.info("Database connected");
  } catch (error) {
    // Keep serving so /ready reports the problem; the database may become reachable later.
    logger.error({ err: error }, "Initial database check failed");
  }

  initPush();

  // Background jobs. Both are safe to run on several instances (claims / idempotent deletes).
  const notificationTimer = setInterval(() => {
    processDueNotifications().catch((err) => logger.error({ err }, "Notification job failed"));
  }, 60_000);
  const sessionTimer = setInterval(() => {
    deleteExpiredSessions().catch((err) => logger.error({ err }, "Session cleanup failed"));
  }, 60 * 60_000);
  processDueNotifications().catch((err) => logger.error({ err }, "Notification job failed"));

  server.listen(config.port, "0.0.0.0", () => {
    logger.info({ port: config.port, env: config.env }, "Learnify listening");
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    clearInterval(notificationTimer);
    clearInterval(sessionTimer);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logger.fatal({ err: error }, "Fatal error during startup");
  process.exit(1);
});
