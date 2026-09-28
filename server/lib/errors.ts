/**
 * Application errors carry a stable machine-readable code and an HTTP status.
 * The error middleware renders them as { error: { code, message, details?, requestId } }.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown, code = "VALIDATION_ERROR") =>
  new AppError(400, code, message, details);
export const unauthorized = (message = "Please sign in to continue", code = "UNAUTHENTICATED") =>
  new AppError(401, code, message);
export const forbidden = (message = "You don't have access to this resource", code = "FORBIDDEN") =>
  new AppError(403, code, message);
export const notFound = (message = "Not found", code = "NOT_FOUND") => new AppError(404, code, message);
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);
export const tooManyRequests = (message: string, code = "RATE_LIMITED") => new AppError(429, code, message);
export const serviceUnavailable = (message: string, code = "SERVICE_UNAVAILABLE") =>
  new AppError(503, code, message);

/** Postgres unique-violation check that works across drivers. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
