# Learnify

An AI homework tutor. Teachers create assignments; students work through each one in a structured,
voice-first conversation with an AI tutor that assesses before it teaches. Teachers see per-student
progress and analytics.

## Stack

- **Client:** React 18, TypeScript, Vite, Wouter, TanStack Query, shadcn/ui + Tailwind, installable PWA
- **Server:** Express 4, TypeScript, Drizzle ORM, PostgreSQL
- **AI:** OpenAI chat completions (default `gpt-4o-mini`), browser Web Speech API for voice
- **Auth:** email/password (bcrypt), opaque bearer session tokens (only SHA-256 hashes are stored)

## Getting started

Requirements: Node 20+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL and OPENAI_API_KEY
export $(grep -v '^#' .env | xargs)   # or use your preferred env loader
npm run db:push             # create/update tables
npm run dev                 # http://localhost:5000
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | API + Vite dev server with HMR on `PORT` (default 5000) |
| `npm run build` | Builds the client to `dist/public` and bundles the server to `dist/index.js` |
| `npm start` | Runs the production build |
| `npm run check` | TypeScript type-check |
| `npm test` | Unit tests (Vitest) |
| `npm run db:push` | Syncs `shared/schema.ts` to the database with drizzle-kit |

## Configuration

All configuration comes from environment variables, validated at startup in `server/config.ts`.
See [`.env.example`](.env.example) for the full list. Required: `DATABASE_URL`, `OPENAI_API_KEY`.

Push notifications are optional. To enable them, generate keys with `npx web-push generate-vapid-keys`
and set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

## Deploying

```bash
docker build -t learnify .
docker run -p 5000:5000 --env-file .env learnify
```

The image runs as a non-root user and has a health check on `GET /api/health`. When you deploy a
schema change, run `npm run db:push` against the production database before rolling out.

Put the app behind a TLS-terminating proxy and set `TRUST_PROXY` to the number of proxy hops, so rate
limiting sees the real client IPs.

## Project layout

```
client/src/        React app (pages, components, hooks)
client/public/     PWA manifest, service worker, icons
server/index.ts    App bootstrap: security headers, error handling, background jobs, shutdown
server/routes.ts   REST API (assignments, chat, progress, push)
server/auth*.ts    Signup/login/session handling
server/tutor.ts    Tutor prompt, OpenAI call, summary detection
server/push.ts     Web push delivery and scheduled notifications
server/storage.ts  Database access
shared/schema.ts   Drizzle schema and shared types
```

## Security notes

- Every `/api` route except auth, health and the VAPID public key requires a valid session.
- Teachers can only see their own assignments and the progress on them. Students can only see
  assignments from their own school and only their own conversation and progress.
- Only the server can move progress to `summary_provided`. Students can mark an assignment
  `completed` only after the tutor's summary, or after sustained effort (3+ minutes and 15+ messages).
- Login/signup and AI chat are rate-limited. Request bodies are never logged.
