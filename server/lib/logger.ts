import pino from "pino";
import { config } from "../config/env";

// Structured JSON logs in production; pretty output in development.
// Sensitive values are redacted defensively even though we avoid logging them.
export const logger = pino({
  level: config.logLevel,
  base: { service: "learnify" },
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'res.headers["set-cookie"]',
      "password",
      "*.password",
      "token",
      "*.token",
    ],
    censor: "[redacted]",
  },
  transport:
    config.env === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname,service" } }
      : undefined,
});

export type Logger = typeof logger;
