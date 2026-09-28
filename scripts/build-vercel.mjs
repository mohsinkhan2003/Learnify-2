// Builds Learnify for Vercel using the Build Output API (https://vercel.com/docs/build-output-api):
//   .vercel/output/static            the client (served by Vercel's CDN)
//   .vercel/output/functions/api.func the Express API as one Node.js function
// Also applies database migrations on production builds, before the new code goes live.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, ".vercel/output");
const func = path.join(out, "functions/api.func");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

fs.rmSync(out, { recursive: true, force: true });

// 1. Client + migration runner (the normal build).
run("npm run build");
fs.cpSync(path.join(root, "dist/public"), path.join(out, "static"), { recursive: true });

// 2. API function: everything bundled except bcrypt (native addon), which is copied alongside.
await build({
  entryPoints: [path.join(root, "server/vercel.ts")],
  outfile: path.join(func, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: ["bcrypt", "pg-native", "pino-pretty"],
  // Runs before any module: give bundled CommonJS code a require(), and default to production.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url); process.env.NODE_ENV ??= 'production';",
  },
  logLevel: "warning",
});
for (const dep of ["bcrypt", "node-gyp-build"]) {
  fs.cpSync(path.join(root, "node_modules", dep), path.join(func, "node_modules", dep), {
    recursive: true,
    filter: (src) => !/[\\/](test|examples|src|build-tmp.*)$/.test(src),
  });
}
fs.writeFileSync(
  path.join(func, ".vc-config.json"),
  JSON.stringify(
    { runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60 },
    null,
    2,
  ),
);

// 3. Routing, caching and security headers for the static client. Mirrors server/app.ts + static.ts.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "object-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
].join(";");
const securityHeaders = {
  "Content-Security-Policy": csp,
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
const config = {
  version: 3,
  routes: [
    { src: "^/(api|health|ready)(?:/.*)?$", dest: "/api" },
    { src: "^/assets/(.*)$", headers: { ...securityHeaders, "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
    { src: "^/(?!assets/)(.*)$", headers: { ...securityHeaders, "Cache-Control": "no-cache" }, continue: true },
    { handle: "filesystem" },
    { src: "^/(.*)$", dest: "/index.html" },
  ],
  crons: [{ path: "/api/internal/cron", schedule: "17 3 * * *" }],
};
fs.writeFileSync(path.join(out, "config.json"), JSON.stringify(config, null, 2));

// 4. Migrations: production deployments only (previews must not change the shared database).
if (process.env.VERCEL_ENV === "production") {
  run("node dist/migrate.js");
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`);
}
console.log("Vercel build output written to .vercel/output");
