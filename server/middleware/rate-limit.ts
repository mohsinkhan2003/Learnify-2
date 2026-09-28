import type { Request } from "express";
import { rateLimit, ipKeyGenerator, type Options } from "express-rate-limit";
import { config } from "../config/env";

/**
 * Per-endpoint limits sized to each endpoint's cost and abuse risk.
 * State is in-process: correct for a single instance. For several instances, plug a shared
 * store (e.g. rate-limit-redis) into `store` below.
 */
function limiter(name: string, windowMs: number, limit: number, keyBy: "ip" | "user" | "ip+email" = "ip") {
  const options: Partial<Options> = {
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Tests exercise limits explicitly via ENABLE_RATE_LIMITS_IN_TEST.
    skip: () => config.isTest && process.env.ENABLE_RATE_LIMITS_IN_TEST !== "1",
    keyGenerator: (req: Request) => {
      const ip = ipKeyGenerator(req.ip ?? "unknown");
      if (keyBy === "user") return req.user ? `${name}:u:${req.user.id}` : `${name}:ip:${ip}`;
      if (keyBy === "ip+email") {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 255) : "";
        return `${name}:${ip}:${email}`;
      }
      return `${name}:ip:${ip}`;
    },
    handler: (req, res) => {
      req.log.warn({ limiter: name }, "Rate limit exceeded");
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again.", requestId: req.id },
      });
    },
  };
  return rateLimit(options);
}

const MIN = 60 * 1000;

export const rateLimits = {
  /** Broad ceiling for all API traffic from one IP. */
  api: limiter("api", MIN, 300),
  /** Credential stuffing: per IP + email, plus a per-IP ceiling. */
  loginPerAccount: limiter("login-acct", 15 * MIN, 10, "ip+email"),
  loginPerIp: limiter("login-ip", 15 * MIN, 50),
  signup: limiter("signup", 60 * MIN, 20),
  oauth: limiter("oauth", 15 * MIN, 30),
  /** Each tutor turn is a paid model call. */
  tutorTurn: limiter("tutor-turn", MIN, 12, "user"),
  transcription: limiter("transcription", MIN, 12, "user"),
  push: limiter("push", 60 * MIN, 30, "user"),
  analytics: limiter("analytics", MIN, 60, "user"),
};
