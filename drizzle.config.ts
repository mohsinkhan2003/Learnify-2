import { defineConfig } from "drizzle-kit";

// Used by `npm run db:generate` (creates SQL migrations from shared/schema.ts).
// Applying migrations is done by `npm run db:migrate` (server/db/migrate.ts).
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
