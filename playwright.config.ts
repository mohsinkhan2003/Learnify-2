import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the production build with the mock AI provider, so CI never
// calls a paid AI API. Requires E2E_DATABASE_URL (a disposable Postgres database).
const PORT = Number(process.env.E2E_PORT ?? 5181);
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@localhost:5432/learnify_e2e";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "node dist/migrate.js && node dist/index.js",
    url: `http://localhost:${PORT}/ready`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: "test",
      PORT: String(PORT),
      DATABASE_URL,
      AI_PROVIDER: "mock",
      LOG_LEVEL: "warn",
    },
  },
});
