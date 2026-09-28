import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { User } from "@shared/schema";
import { validateSession } from "./auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Wraps an async route handler so rejected promises reach the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/** Rejects the request with 401 unless it carries a valid session token. */
export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, "Authentication required");

  const user = await validateSession(token);
  if (!user) throw new HttpError(401, "Invalid or expired session");

  req.user = user;
  next();
});

export function requireRole(role: "teacher" | "student"): RequestHandler {
  return (req, _res, next) => {
    if (req.user?.role !== role) {
      return next(new HttpError(403, `Access denied - ${role}s only`));
    }
    next();
  };
}

/** Returns the authenticated user; only valid after requireAuth. */
export function currentUser(req: Request): User {
  if (!req.user) throw new HttpError(401, "Authentication required");
  return req.user;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws 400 if the value is not a UUID (avoids Postgres cast errors surfacing as 500s). */
export function assertUuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return value;
}
