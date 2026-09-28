import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { badRequest } from "./errors";

/** Wraps an async handler so rejections reach the error middleware (Express 4). */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as Req, res, next).catch(next);
  };
}

/** Validates untrusted input; throws a 400 with field-level issues. */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw badRequest(issues[0]?.message ?? "Invalid request", issues);
  }
  return result.data;
}

export const uuidParam = z.string().uuid("Invalid id");

export function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}
