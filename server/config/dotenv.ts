import fs from "fs";
import path from "path";
import { parseEnv } from "util";

/**
 * Loads `.env` for local development and tooling. Never used in production or tests, and
 * never overrides variables that are already set (real environment always wins).
 */
export function loadDotEnv(file = path.resolve(process.cwd(), ".env")): void {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") return;
  if (!fs.existsSync(file)) return;
  const parsed = parseEnv(fs.readFileSync(file, "utf8")) as Record<string, string>;
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
