import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", ".vercel", "node_modules", "migrations", "client/src/components/ui", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "tests/**/*.ts", "e2e/**/*.ts", "scripts/**/*.mjs", "*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ["client/public/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["server/db/migrate-cli.ts", "tests/**/*.ts", "e2e/**/*.ts", "scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },
);
