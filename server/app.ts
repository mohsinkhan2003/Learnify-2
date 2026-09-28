import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/env";
import { checkDatabase } from "./db";
import { requestContext } from "./middleware/request-context";
import { authenticate } from "./middleware/auth";
import { csrfProtection } from "./middleware/csrf";
import { rateLimits } from "./middleware/rate-limit";
import { apiNotFound, errorHandler } from "./middleware/error-handler";
import authRoutes from "./auth/auth.routes";
import teacherRoutes from "./modules/assignments/teacher.routes";
import studentRoutes from "./modules/tutoring/student.routes";
import pushRoutes from "./notifications/push.routes";
import { studentClassRoutes } from "./modules/classes/classes.routes";

/** Builds the Express app (API + security middleware). The frontend is attached by the caller. */
export function createApp(): Express {
  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");

  app.use(requestContext);
  app.use(
    helmet({
      // Vite's dev server injects inline scripts, so CSP is enforced outside development only.
      contentSecurityPolicy:
        config.env === "development"
          ? false
          : {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                fontSrc: ["'self'", "data:"],
                imgSrc: ["'self'", "data:", "blob:", "https:"], // Google profile photos
                connectSrc: ["'self'"],
                mediaSrc: ["'self'", "blob:"],
                workerSrc: ["'self'"],
                manifestSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                // Framed pages only render an "open in a new tab" link (client/src/main.tsx).
                frameAncestors: config.frameAncestors.length ? config.frameAncestors : ["'none'"],
                upgradeInsecureRequests: config.session.cookieSecure ? [] : null,
              },
            },
      xFrameOptions: config.frameAncestors.length ? false : { action: "sameorigin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      strictTransportSecurity: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "microphone=(self), camera=(), geolocation=(), payment=()");
    next();
  });

  // Liveness: the process is up. Readiness: dependencies are reachable. No internals exposed.
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  const ready: express.RequestHandler = async (_req, res) => {
    try {
      await Promise.race([checkDatabase(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))]);
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  };
  app.get("/ready", ready);
  app.get("/api/health", ready);

  const api = express.Router();
  if (config.allowedOrigins.length > 0) {
    api.use(cors({ origin: config.allowedOrigins, credentials: true }));
  }
  api.use(express.json({ limit: "64kb" }));
  api.use(cookieParser());
  api.use(rateLimits.api);
  api.use(authenticate);
  api.use(csrfProtection);
  api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  api.use("/auth", authRoutes);
  api.use("/teacher", teacherRoutes);
  api.use("/student/classes", studentClassRoutes);
  api.use("/student", studentRoutes);
  api.use("/push", pushRoutes);
  api.use(apiNotFound);

  app.use("/api", api);
  app.use(errorHandler);
  return app;
}
