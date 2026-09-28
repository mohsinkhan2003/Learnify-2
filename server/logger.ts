// Minimal leveled logger. Debug output is suppressed in production.
const isProduction = process.env.NODE_ENV === "production";

function timestamp(): string {
  return new Date().toISOString();
}

export const log = {
  debug: (...args: unknown[]) => {
    if (!isProduction) console.debug(timestamp(), "DEBUG", ...args);
  },
  info: (...args: unknown[]) => console.log(timestamp(), "INFO", ...args),
  warn: (...args: unknown[]) => console.warn(timestamp(), "WARN", ...args),
  error: (...args: unknown[]) => console.error(timestamp(), "ERROR", ...args),
};
