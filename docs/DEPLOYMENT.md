# Deployment

Learnify is one stateless Node process plus PostgreSQL. It runs anywhere that can run a
container or Node 20+: Fly.io, Render, Railway, Google Cloud Run, AWS ECS/App Runner, a VM, etc.

## What you need

| Item | Notes |
|---|---|
| PostgreSQL 14+ | Neon, RDS, Cloud SQL, Supabase, self-hosted. Use TLS (`?sslmode=require`). Enable backups/PITR. |
| Domain + HTTPS | Terminate TLS at your platform / load balancer. Set `APP_URL=https://your.domain`. |
| OpenAI API key | With a monthly budget limit set in the OpenAI dashboard. |
| (optional) VAPID keys | `npx web-push generate-vapid-keys` for push notifications. |
| (optional) Google OAuth client | Authorised redirect URI `https://your.domain/api/auth/google/callback`; also set `SESSION_SECRET`. |

## Build & run with Docker

```bash
docker build -t learnify .
# one-off release step: apply migrations
docker run --rm --env-file .env.production learnify node dist/migrate.js
# run the app
docker run -d -p 5000:5000 --env-file .env.production --name learnify learnify
```

The image runs as the non-root `node` user, contains only production dependencies, exposes
port 5000 (override with `PORT`) and has a Docker `HEALTHCHECK` on `/health`.
Set `RUN_MIGRATIONS=true` to migrate on container start instead of a release step (safe with
several replicas — migrations take an advisory lock).

Minimum production environment (`.env.production`, never committed):

```
NODE_ENV=production
APP_URL=https://learnify.example.com
DATABASE_URL=postgresql://…?sslmode=require
OPENAI_API_KEY=sk-…
TRUST_PROXY=1          # number of proxies in front of the app
# optional: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
# optional: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, SESSION_SECRET
```

Startup fails fast with a clear message if production config is incomplete (missing `APP_URL`,
`OPENAI_API_KEY`, a mock AI provider, Google without `SESSION_SECRET`, …).

## Without Docker

```bash
npm ci && npm run build
npm prune --omit=dev
NODE_ENV=production node dist/migrate.js
NODE_ENV=production node dist/index.js
```

## Health checks

- `GET /health` — liveness (process is up). Use for container restarts.
- `GET /ready` — readiness (database reachable within 3 s). Use for load-balancer routing.
  Both return only `{ "status": … }`.

## Scaling notes

- The app is stateless; run 2+ instances behind a load balancer for availability.
- Background jobs (due notifications, expired sessions) run in every instance but are safe:
  notifications are claimed atomically, deletes are idempotent.
- Rate-limit counters are per instance. With N instances effective limits are ×N; for strict
  limits add a shared store (e.g. `rate-limit-redis`) in `server/middleware/rate-limit.ts`.
- Postgres pool: `DATABASE_POOL_MAX` (default 10) per instance — keep instances × pool below the
  database's connection limit (or use a pooler such as PgBouncer / Neon pooling).

## Graceful shutdown

On `SIGTERM`/`SIGINT` the server stops accepting connections, finishes in-flight requests, closes
the database pool and exits (forced after 10 s). Configure your platform's stop timeout ≥ 15 s.

## Migrating an existing demo database

The original Replit demo managed its schema with `drizzle-kit push` (no migration history).
`node dist/migrate.js` detects this (tables exist, no history), records migration `0000_baseline`
as applied, then runs `0001_production_foundation`, which is **non-destructive**:

- adds tables (`assignment_students`, `ai_usage`), columns and indexes (`IF NOT EXISTS`);
- converts `timestamp` → `timestamptz` interpreting stored values as UTC (how the demo wrote them);
- converts `assignments.notification_sent` text `'true'/'false'` → boolean;
- backfills the tutor stage from each progress row's status;
- keeps orphaned chat messages and the legacy `assignments.student_id` column.

Recommended procedure: take a backup/snapshot → run the migration on a copy (e.g. a Neon branch)
→ check the app → run on production. Existing users must sign in again (session tokens are now
stored hashed). **Rotate the database password** from the demo archive first.

## Logs & monitoring

- Logs are JSON lines on stdout (pino) with `reqId`, `userId`, route, status and duration —
  ship them to your platform's log store. `LOG_LEVEL` controls verbosity.
- Every error response carries `requestId`; search logs for it to find the server-side error.
- Error tracking (e.g. Sentry) is not bundled; add it in `server/middleware/error-handler.ts`
  and `client/src/app/error-boundary.tsx` if wanted.
- Watch: 5xx rate, `/ready` failures, `AI_UNAVAILABLE`/`AI_INVALID_RESPONSE` codes, and daily
  `ai_usage` totals (see [AI_TUTOR.md](AI_TUTOR.md#cost-controls)).

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:
lint · format · typecheck · `npm audit` (prod, high) → unit/integration tests against Postgres →
build + Playwright E2E (mock AI, no secrets) → Docker build. Deploy from `main` with your
platform's GitHub integration once CI is green.
