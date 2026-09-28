import crypto from "crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { getApp } from "../helpers";
import { pool } from "../../server/db";
import { PgRateLimitStore, purgeExpiredRateLimits } from "../../server/middleware/pg-rate-limit-store";
import { loadConfig } from "../../server/config/env";
import type { Options } from "express-rate-limit";

describe("Postgres rate-limit store", () => {
  const store = () => {
    const s = new PgRateLimitStore();
    s.init({ windowMs: 60_000 } as Options);
    return s;
  };

  it("counts hits per key within a window and can reset", async () => {
    const s = store();
    const key = `test:${crypto.randomUUID()}`;
    expect((await s.increment(key)).totalHits).toBe(1);
    expect((await s.increment(key)).totalHits).toBe(2);
    const third = await s.increment(key);
    expect(third.totalHits).toBe(3);
    expect(third.resetTime!.getTime()).toBeGreaterThan(Date.now() + 50_000);
    await s.decrement(key);
    expect((await s.increment(key)).totalHits).toBe(3);
    await s.resetKey(key);
    expect((await s.increment(key)).totalHits).toBe(1);
  });

  it("starts a new window once the old one has expired, and purges stale rows", async () => {
    const s = store();
    const key = `test:${crypto.randomUUID()}`;
    await s.increment(key);
    await s.increment(key);
    await pool.query("UPDATE rate_limit_hits SET reset_at = now() - interval '2 hours' WHERE key = $1", [key]);
    expect((await s.increment(key)).totalHits).toBe(1);
    await pool.query("UPDATE rate_limit_hits SET reset_at = now() - interval '2 hours' WHERE key = $1", [key]);
    await purgeExpiredRateLimits();
    const { rowCount } = await pool.query("SELECT 1 FROM rate_limit_hits WHERE key = $1", [key]);
    expect(rowCount).toBe(0);
  });
});

describe("maintenance cron endpoint", () => {
  it("runs with the right bearer secret and is invisible otherwise", async () => {
    const app = getApp();
    const ok = await request(app).get("/api/internal/cron").set("Authorization", "Bearer test-cron-secret-0123456789");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });
    expect((await request(app).get("/api/internal/cron")).status).toBe(404);
    expect((await request(app).get("/api/internal/cron").set("Authorization", "Bearer wrong-secret-0123456789ab")).status).toBe(404);
  });
});

describe("Vercel configuration defaults", () => {
  const base = { NODE_ENV: "production", DATABASE_URL: "postgres://x", OPENAI_API_KEY: "sk-test" };

  it("derives the public URL, a small pool and the shared rate-limit store", () => {
    const c = loadConfig({
      ...base,
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "learnify.vercel.app",
      VERCEL_URL: "learnify-abc.vercel.app",
    });
    expect(c.appOrigin).toBe("https://learnify.vercel.app");
    expect(c.allowedOrigins).toContain("https://learnify-abc.vercel.app");
    expect(c.database.poolMax).toBe(3);
    expect(c.rateLimitStore).toBe("postgres");
  });

  it("keeps long-running defaults elsewhere, and explicit settings win", () => {
    const c = loadConfig({ ...base, APP_URL: "https://school.example" });
    expect(c.database.poolMax).toBe(10);
    expect(c.rateLimitStore).toBe("memory");
    const v = loadConfig({ ...base, VERCEL: "1", APP_URL: "https://school.example", DATABASE_POOL_MAX: "5" });
    expect(v.appOrigin).toBe("https://school.example");
    expect(v.database.poolMax).toBe(5);
  });
});
