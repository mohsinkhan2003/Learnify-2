# Deployment

Learnify is one stateless Node process plus PostgreSQL. It runs anywhere that can run a
container or Node 20+: Fly.io, Render, Railway, Google Cloud Run, AWS ECS/App Runner, a VM, etc.

## What you need

| Item | Notes |
|---|---|
| PostgreSQL 14+ | Neon, RDS, Cloud SQL, Supabase, self-hosted. Use TLS (`?sslmode=require`). Enable backups/PITR. |
| Domain + HTTPS | Terminate TLS at your platform / load balancer. Set `APP_URL=https://your.domain`. |
| OpenAI API key | With a monthly budget limit set in the OpenAI dashboard. |
| (optional) Resend API key | `RESEND_API_KEY` + `EMAIL_FROM` to email password-reset links. |
| (optional) VAPID keys | `npx web-push generate-vapid-keys` for push notifications. |
| (optional) Google OAuth client | Authorised redirect URI `https://your.domain/api/auth/google/callback`; also set `SESSION_SECRET`. |

## Free hosting: Render + Neon

The cheapest way to run Learnify for a pilot: **Render** (free web service) for the app and
**Neon** (free Postgres) for the database. Both need no credit card. The only thing you pay for
is OpenAI usage.

**Why not Vercel or Netlify?** They run serverless functions, not a long-running server.
Learnify is an Express server with a database connection pool, in-process rate limits, and a
background job that sends "new homework" notifications at the scheduled release time. Those
don't work reliably (or at all) on per-request functions without a rewrite.

### 1. Database (Neon)

1. Sign up at <https://neon.tech> → **New project** (pick the region closest to your users; the
   Render region should match, e.g. both in Frankfurt or both in US East).
2. On the project dashboard click **Connect**, turn **Connection pooling off** (migrations use
   a session advisory lock, which pooled connections don't support), and copy the connection
   string. It looks like `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

### 2. App (Render)

1. Sign up at <https://render.com> with GitHub and allow access to this repository.
2. **New → Blueprint**, pick the repository and branch. Render reads `render.yaml`.
3. Fill in the secrets it asks for:
   - `DATABASE_URL` — the Neon string from step 1.
   - `OPENAI_API_KEY` — from <https://platform.openai.com/api-keys>. Set a monthly budget limit there.
   - Leave the optional ones (`RESEND_API_KEY`, `EMAIL_FROM`, `VAPID_*`) empty for now.
4. **Apply**. The first build takes a few minutes; migrations run automatically on every start.
   Your app is live at `https://learnify-xxxx.onrender.com` (`APP_URL` is picked up automatically
   from Render's `RENDER_EXTERNAL_URL`; set `APP_URL` yourself only for a custom domain).
5. Open the URL, sign up as a teacher, create a class, and share its code.

### 3. Optional extras

- **Password-reset emails:** create a free <https://resend.com> account, verify a domain, then set
  `RESEND_API_KEY` and `EMAIL_FROM="Learnify <no-reply@your-domain>"`. Without it, teachers can
  still generate reset links for their students from the class page.
- **Push notifications:** run `npx web-push generate-vapid-keys` locally and set
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.
- **Custom domain:** Render → Settings → Custom Domains, then set `APP_URL=https://your.domain`.

### Free-tier limits to know about

- Render's free service **sleeps after 15 minutes without traffic**; the next visit takes about
  a minute to wake it. Scheduled-release notifications are sent when it next wakes, not exactly
  on time (the homework itself still appears at the right time). The $7/month Starter plan
  removes sleeping.
- Neon's free tier has 0.5 GB storage and suspends idle compute (wakes in under a second) —
  plenty for a pilot. Its restore history is short on the free plan, so export backups
  (`pg_dump`) regularly if the data matters.
- Render free services have 512 MB RAM; `DATABASE_POOL_MAX=5` is set in `render.yaml` to stay
  well within Neon's connection limit.

## Free hosting without a card: Vercel + Neon

Vercel's free Hobby plan runs the API as a serverless function and serves the client from its
CDN. `vercel.json` points Vercel at `scripts/build-vercel.mjs`, which writes the
[Build Output API](https://vercel.com/docs/build-output-api) layout and applies database
migrations on production builds. `npm run build` + `node dist/index.js` is unchanged for other
hosts.

1. Make sure the code you want to deploy is on the repository's default branch (`main`) —
   Vercel deploys that branch to production.
2. Sign in at <https://vercel.com> with GitHub → **Add New… → Project** → import the repository.
3. Leave the framework preset as **Other** and the build settings as they are (they come from
   `vercel.json`). Under **Environment Variables** add:
   - `DATABASE_URL` — the Neon connection string (pooling off, ends with `sslmode=require`)
   - `OPENAI_API_KEY`
   - optional `CRON_SECRET` — any random string of 16+ characters; enables the daily
     housekeeping cron (expired sessions and rate-limit rows, a notification sweep)
4. **Deploy.** The app is live at `https://<project>.vercel.app`; `APP_URL` is derived from
   Vercel's production URL (set it yourself only for a custom domain).

### Email (sign-up confirmation and password resets)

With email configured, new accounts must confirm their address before using the app. The
simplest free option is a Gmail account with an app password (about 500 emails a day):

1. Turn on 2-Step Verification for the Google account, then create an app password at
   <https://myaccount.google.com/apppasswords> (16 characters).
2. Add environment variables: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`,
   `SMTP_USER=<the gmail address>`, `SMTP_PASS=<the app password>`.
3. Redeploy. Emails come from `Learnify <SMTP_USER>` (override with `EMAIL_FROM`).

Accounts that existed before verification was added are treated as confirmed.

### Google sign-in

1. <https://console.cloud.google.com> → create a project → **APIs & Services → OAuth consent
   screen**: External, app name "Learnify", your email; publish the app.
2. **Credentials → Create credentials → OAuth client ID** → *Web application*. Authorised
   redirect URI: `https://<your-domain>/api/auth/google/callback` (exactly).
3. Add environment variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET`
   (32+ random characters), then redeploy. The "Continue with Google" button appears
   automatically.

> Environment variables are read when a deployment is built. After adding or changing one,
> redeploy the **newest** deployment (Deployments → top row → ⋯ → Redeploy) or push a commit.

How it differs from a long-running server:

| Concern | On Vercel |
|---|---|
| Rate limits | Stored in Postgres (`rate_limit_hits`), shared by all instances — automatic when `VERCEL` is set |
| DB connections | Pool of 3 per instance (override with `DATABASE_POOL_MAX`) |
| "New homework" push notifications | Swept at most once a minute per instance while the app is in use, and daily by the cron. A scheduled release with nobody online notifies when the next person uses the app. The homework itself always appears on time. |
| Migrations | Run during production builds (`VERCEL_ENV=production`); previews never migrate the database |
| Function limits | 60 s per request, 4.5 MB request body (voice clips are capped at 3 MB) |
| Preview deployments | Protected by Vercel Authentication by default; share the production URL with users |

CI runs the whole end-to-end suite against this build output as well
(`E2E_TARGET=vercel npm run test:e2e`, via `scripts/serve-vercel-output.mjs`).

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
- Rate-limit counters are per instance by default. With N instances effective limits are ×N;
  set `RATE_LIMIT_STORE=postgres` to share them through the database (automatic on Vercel).
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
