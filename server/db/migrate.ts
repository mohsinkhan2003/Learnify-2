import fs from "fs";
import path from "path";
import crypto from "crypto";
import type pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

/**
 * Applies pending SQL migrations from `migrationsFolder`.
 *
 * Databases created by the original demo were managed with `drizzle-kit push`, so they
 * already contain the tables from migration 0000 but have no migration history. For those,
 * 0000 is recorded as applied ("baselined") before running the remaining migrations.
 */
export async function runMigrations(pool: pg.Pool, migrationsFolder: string, log: (msg: string) => void = () => {}) {
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };
  const baseline = journal.entries[0];

  const client = await pool.connect();
  try {
    // Serialise concurrent migrators (e.g. several containers starting at once).
    await client.query("SELECT pg_advisory_lock(727274)");

    await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    );
    const applied = await client.query(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
    const hasUsersTable = await client.query(`SELECT to_regclass('public.users') IS NOT NULL AS exists`);

    if (applied.rows[0].n === 0 && hasUsersTable.rows[0].exists && baseline) {
      const sqlText = fs.readFileSync(path.join(migrationsFolder, `${baseline.tag}.sql`), "utf8");
      const hash = crypto.createHash("sha256").update(sqlText).digest("hex");
      await client.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [hash, baseline.when]);
      log(`Existing schema detected: baselined migration ${baseline.tag}`);
    }

    await migrate(drizzle(client), { migrationsFolder });
    log("Migrations up to date");
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
    client.release();
  }
}
