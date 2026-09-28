import path from "path";
import pg from "pg";
import { runMigrations } from "../server/db/migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/learnify_test";
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool, path.resolve(import.meta.dirname, "..", "migrations"));
  } finally {
    await pool.end();
  }
}
