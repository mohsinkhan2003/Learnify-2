import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { config } from "../config/env";

// Standard Postgres driver: works with Neon, RDS, Supabase and self-hosted Postgres.
// SSL is controlled through the connection string (e.g. ?sslmode=require).
export const pool = new pg.Pool({
  connectionString: config.database.url,
  max: config.database.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });

export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle (same query API as `db`). */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Either the root connection or a transaction. */
export type DbOrTx = Database | Tx;

export async function checkDatabase(): Promise<void> {
  await db.execute(sql`SELECT 1`);
}
