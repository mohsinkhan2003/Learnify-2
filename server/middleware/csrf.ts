import type { RequestHandler } from "express";
import { config } from "../config/env";
import { forbidden } from "../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF protection for cookie-authenticated requests.
 *
 * Session cookies are SameSite=Lax (blocks cross-site POSTs in modern browsers). As a second
 * layer, every state-changing request must carry an Origin (or Referer) that matches this
 * server or an explicitly allowed origin. Browsers always send Origin on cross-origin
 * requests and cannot be made to forge it.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = originOf(req.get("origin")) ?? originOf(req.get("referer"));
  const self = `${req.protocol}://${req.get("host")}`;

  if (origin && (origin === self || config.allowedOrigins.includes(origin))) return next();

  req.log.warn({ origin, self }, "Blocked request with missing or foreign Origin");
  next(forbidden("Request origin not allowed", "CSRF_REJECTED"));
};
