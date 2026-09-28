import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";

export const apiNotFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", "Endpoint not found"));
};

/**
 * Renders every error as { error: { code, message, details?, requestId } }.
 * Unexpected errors are logged with context and returned as a generic 500 — stack traces,
 * SQL and internal messages never reach clients.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Something went wrong on our side. Please try again.";
  let details: unknown;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = err.issues[0]?.message ?? "Invalid request";
    details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  } else if (err instanceof multer.MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    code = err.code === "LIMIT_FILE_SIZE" ? "AUDIO_TOO_LARGE" : "INVALID_UPLOAD";
    message = err.code === "LIMIT_FILE_SIZE" ? "That recording is too long. Please keep it under a minute." : "Invalid upload";
  } else if (err?.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request is too large";
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    code = "MALFORMED_JSON";
    message = "Request body is not valid JSON";
  }

  if (status >= 500) {
    req.log.error({ err }, "Unhandled error");
  }

  res.status(status).json({
    error: { code, message, ...(details !== undefined ? { details } : {}), requestId: req.id },
  });
};
