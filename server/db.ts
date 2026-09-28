import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { config } from "./config";

// Standard Postgres driver: works with Neon, RDS, Supabase, self-hosted, etc.
// SSL is controlled via the connection string (e.g. ?sslmode=require).
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema, logger: false });

export async function checkDatabase(): Promise<void> {
  await db.execute(sql`SELECT 1`);
}
