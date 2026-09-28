import crypto from "crypto";
import type { IncomingMessage } from "http";
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger";

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Assigns every request an id (honouring a well-formed X-Request-Id from a proxy), exposes it
 * as req.id / X-Request-Id, and logs one structured line per API request.
 * Only the path is logged: query strings can carry OAuth codes.
 */
export const requestContext = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && REQUEST_ID_RE.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  autoLogging: {
    ignore: (req: IncomingMessage) => !req.url?.startsWith("/api") || req.url === "/api/health",
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, path: String(req.url).split("?")[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${String(req.url).split("?")[0]} ${res.statusCode} ${Math.round(responseTime)}ms`,
  customErrorMessage: (req, res) => `${req.method} ${String(req.url).split("?")[0]} ${res.statusCode}`,
});
