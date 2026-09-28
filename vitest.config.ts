import { defineConfig } from "vitest/config";
import path from "path";

// Unit tests are pure. Integration tests need a Postgres database: TEST_DATABASE_URL
// (default: local postgres on 5432, database learnify_test). The schema is recreated
// from migrations before the run.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/learnify_test",
      AI_PROVIDER: "mock",
      CORS_ORIGINS: "http://test.local",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
    },
  },
});
