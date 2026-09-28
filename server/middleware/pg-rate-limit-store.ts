import type { IncrementResponse, Options, Store } from "express-rate-limit";
import { pool } from "../db";

/**
 * express-rate-limit store backed by Postgres, so limits hold across serverless instances.
 * One upsert per request; a window starts at the first hit and resets once it has passed.
 */
export class PgRateLimitStore implements Store {
  localKeys = false;
  private windowMs = 60_000;

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const { rows } = await pool.query<{ hits: number; reset_at: Date }>(
      `INSERT INTO rate_limit_hits (key, hits, reset_at)
       VALUES ($1, 1, now() + $2 * interval '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN rate_limit_hits.reset_at <= now() THEN 1 ELSE rate_limit_hits.hits + 1 END,
         reset_at = CASE WHEN rate_limit_hits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rate_limit_hits.reset_at END
       RETURNING hits, reset_at`,
      [key, this.windowMs],
    );
    return { totalHits: rows[0].hits, resetTime: rows[0].reset_at };
  }

  async decrement(key: string): Promise<void> {
    await pool.query("UPDATE rate_limit_hits SET hits = GREATEST(hits - 1, 0) WHERE key = $1", [key]);
  }

  async resetKey(key: string): Promise<void> {
    await pool.query("DELETE FROM rate_limit_hits WHERE key = $1", [key]);
  }
}

/** Removes expired counters (run from the maintenance job). */
export async function purgeExpiredRateLimits(): Promise<void> {
  await pool.query("DELETE FROM rate_limit_hits WHERE reset_at < now() - interval '1 hour'");
}
