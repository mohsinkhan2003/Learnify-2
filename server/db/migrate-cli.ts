// Entry point for `npm run db:migrate` (bundled to dist/migrate.js for production images).
import path from "path";
import pg from "pg";
import { runMigrations } from "./migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const folder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "migrations");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await runMigrations(pool, folder, (m) => console.log(`[migrate] ${m}`));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
