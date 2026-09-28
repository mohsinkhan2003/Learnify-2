import type { Request, RequestHandler } from "express";
import type { User } from "@shared/schema";
import type { Role } from "@shared/api";
import { findSessionUser, SESSION_COOKIE } from "../auth/sessions";
import { forbidden, unauthorized } from "../lib/errors";
import { asyncHandler } from "../lib/http";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
    }
  }
}

/** Resolves the session cookie (if any) to req.user. Never rejects on its own. */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 0 && token.length < 200) {
    const user = await findSessionUser(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
      req.log = req.log.child({ userId: user.id });
    }
  }
  next();
});

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : unauthorized());
};

export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== role) return next(forbidden(`This area is only available to ${role}s`, "ROLE_REQUIRED"));
    next();
  };
}

/** The authenticated user. Only call behind requireAuth/requireRole. */
export function currentUser(req: Request): User {
  if (!req.user) throw unauthorized();
  return req.user;
}
