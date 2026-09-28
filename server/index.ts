import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import helmet from "helmet";
import cors from "cors";
import { ZodError } from "zod";
import { config } from "./config";
import { log } from "./logger";
import { checkDatabase, pool } from "./db";
import { registerRoutes } from "./routes";
import { HttpError } from "./middleware";
import { deleteExpiredSessions } from "./auth";
import { initPush, processPendingNotifications } from "./push";
import { serveStatic } from "./static";

const app = express();

app.set("trust proxy", config.trustProxy);
app.disable("x-powered-by");

app.use(
  helmet({
    // Vite's dev server injects inline scripts, so CSP is only enforced in production.
    contentSecurityPolicy: config.isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'"],
            mediaSrc: ["'self'", "blob:"],
            workerSrc: ["'self'"],
            manifestSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
  }),
);

// Same-origin by default; cross-origin callers must be listed in CORS_ORIGINS.
if (config.corsOrigins.length > 0) {
  app.use(cors({ origin: config.corsOrigins }));
}

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

// Request logging (method, path, status, duration). Bodies are never logged:
// they contain passwords, tokens and student conversations.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const start = Date.now();
  res.on("finish", () => {
    log.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

registerRoutes(app);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request", details: err.issues });
  }
  // body-parser errors (malformed JSON, payload too large) carry a status.
  const status = (err as any)?.status ?? (err as any)?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return res.status(status).json({ error: (err as any).expose ? (err as Error).message : "Bad request" });
  }

  log.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

async function main() {
  const server = createServer(app);

  if (config.isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  }

  try {
    await checkDatabase();
    log.info("[Database] Connected");
  } catch (error) {
    // Keep serving so /api/health reports the problem; the DB may come up later.
    log.error("[Database] Initial connection check failed:", error);
  }

  initPush();

  const runJobs = () => {
    processPendingNotifications().catch((e) => log.error("[Jobs] Notification check failed:", e));
  };
  runJobs();
  const notificationTimer = setInterval(runJobs, 60_000);

  const cleanupSessions = () => deleteExpiredSessions().catch((e) => log.error("[Jobs] Session cleanup failed:", e));
  cleanupSessions();
  const sessionTimer = setInterval(cleanupSessions, 60 * 60_000);

  server.listen(config.port, "0.0.0.0", () => {
    log.info(`Server listening on port ${config.port} (${config.env})`);
  });

  const shutdown = (signal: string) => {
    log.info(`${signal} received, shutting down`);
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
  log.error("Fatal error during startup:", error);
  process.exit(1);
});
