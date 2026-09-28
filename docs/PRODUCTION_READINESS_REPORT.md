# Learnify — Production Readiness Report

Branch `claude/gracious-cerf-w7o9x6`. Baseline: the Replit demo archive (commit `4b79ac7`),
audited in [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md).

## 1. Executive summary

The demo has been turned into a maintainable, tested, deployable application. The concept and
all existing features are preserved: teacher assignments with AI guidance, the voice-first
tutor with its greeting → readiness → knowledge → analytical questions → summary → complete
flow, progress tracking, teacher analytics and push notifications.

What changed:

- **Repository recovered:** real source is tracked instead of a nested zip. Secrets, generated
  files and build output are ignored.
- **Critical demo bugs fixed:**
  - The tutor never received conversation history.
  - Re-opening an assignment reset completed progress.
  - Assignments silently disappeared once more than 10 existed.
  - "Great job" unlocked completion.
  - Teacher instructions were never sent to the AI.
  - The build and typecheck were broken.
  - Any server error crashed the process.
- **Security:**
  - Added cookie sessions with hashed tokens and CSRF protection.
  - Centralised authorization and fixed the IDOR bugs.
  - Closed the open push-notification relay.
  - Hardened Google OAuth with state and PKCE.
  - Added rate limits, security headers, input validation and upload validation.
  - Removed secret-bearing logs.
- **Backend:** replaced the 1,331-line route file with feature modules (routes → services →
  repositories), and added validated config, structured logging, a consistent error envelope,
  migrations, transactions and atomic concurrency control.
- **AI tutor:** the server-side state machine controls the lesson; the model returns validated
  JSON and can no longer change application state by what it writes.
  - Prompts are centralised, with defences against prompt injection and a leak canary.
  - Moderation runs on both student input and tutor output.
  - Cost is bounded by limits and tracked per call.
  - A mock provider lets development and tests run without paid AI calls.
- **Redesign:**
  - A design system with tokens and light/dark themes.
  - New teacher dashboard, 5-step assignment wizard, assignment detail with evidence-backed
    insights, and a students page.
  - A simpler student home, and a dedicated tutoring screen with explicit voice states.
  - Accessibility checks, responsive layouts and a PWA that doesn't strand users on stale builds.
- **Quality and operations:**
  - 85 unit/integration tests and 6 E2E tests with automated accessibility scans.
  - ESLint and Prettier, a GitHub Actions CI pipeline, and a Docker image.
  - Health and readiness probes, graceful shutdown, and documentation.

## 2. Architecture

The app is a single Node service (Express API + built SPA) backed by PostgreSQL, with OpenAI
called only from the server. Details are in [ARCHITECTURE.md](ARCHITECTURE.md). Key decisions:

| Decision | Why |
|---|---|
| Kept the stack (React/Vite/TanStack Query/Express/Drizzle/Postgres) | It works and the team knows it; no fashionable rewrite |
| Feature modules with a thin route → service → repository split | Understandable without heavy abstraction |
| Switched `neon-http` to `node-postgres` | Works with any Postgres (Neon included); enables real transactions |
| httpOnly cookie sessions and an Origin-check CSRF defence | No tokens in JavaScript or `localStorage` |
| One policy module for assignment access, with a SQL twin | Authorization isn't scattered through handlers |
| Server-owned tutor state machine | Completion can't depend on model wording |
| In-process jobs with atomic claims | No extra infrastructure; safe to run several instances |
| Mock AI provider (rejected in production by config) | Free local development and deterministic CI |

## 3. UI/UX

- **Design system:** Inter, a fixed typography scale, token-based colours (indigo/violet on warm
  white), soft shadows, and glass used only on navigation, the tutor dock and floating controls
  (with solid fallbacks). Dark mode is included, and reduced motion/transparency are respected.
- **Teacher:**
  - Greeting and four meaningful KPIs.
  - An explainable "may need attention" list; every signal shows its evidence and links to the
    transcript.
  - Assignment cards with completion meters.
  - A progressive creation wizard (details → students → tutor guidance → schedule → review) with
    autosaved drafts, a choice of a whole class or selected class members, and time-zone-aware
    scheduling.
  - Classes with join codes (copy, regenerate, archive), member management, and one-time
    password reset links for students.
  - Editing assignments after creation (release time while still scheduled).
  - Assignment detail: evidence table, not-started list, archiving with confirmation.
  - A students page with search and pagination.
  - Dismissible onboarding.
- **Student:**
  - Homework grouped as In progress / To do / Completed, with one obvious action per card.
  - An opt-in notification prompt and light onboarding.
- **Tutor screen:**
  - A start screen that explains what's coming.
  - A progress stepper driven by the server.
  - Conversation that scrolls automatically but never pulls the student away from reading
    earlier messages.
  - Inline Retry and Edit for failed sends.
  - A voice control with distinct idle / listening (live waveform) / transcribing / thinking /
    speaking / error / microphone-blocked / unsupported states, plus a live text status, a
    hands-free toggle, a tutor-voice mute and tap-to-interrupt.
  - A hand-in confirmation and a completion celebration.
- **States everywhere:** skeletons, empty states, retryable errors with request ids, an offline
  banner, an error boundary, and an update banner.

## 4. Security

| Area | Protection |
|---|---|
| Passwords | bcrypt (cost 12), comparison against a dummy hash for unknown emails, generic errors |
| Sessions | 256-bit tokens, SHA-256 stored, httpOnly + SameSite=Lax + Secure/`__Host-` in production, 7-day expiry, server-side logout, hourly purge |
| CSRF | SameSite plus a required matching `Origin`/`Referer` on all unsafe methods |
| OAuth | Authorization code + PKCE; `state` in a signed httpOnly cookie; fixed redirect URI; verified emails only |
| Authorization | Role-scoped routers, one assignment policy, 404 for others' resources, ids from the session only, school-validated recipients |
| Input | zod on bodies/params/queries, 64 KB JSON limit, UUID validation, escaped LIKE |
| Uploads | Memory-only, 3 MB, MIME allowlist + magic-byte sniffing, duration check, never on disk |
| Abuse | Separate rate limits per endpoint type, AI turn/day/assignment caps, turn lock |
| Headers | CSP, HSTS, nosniff, frame-ancestors none, Referrer-Policy, Permissions-Policy |
| SSRF | Push endpoints allowlisted to browser push services |
| Errors and logs | Uniform error envelope with request id; no stacks, SQL or secrets in responses; bodies, query strings and tokens never logged |
| Dependencies | `npm audit --omit=dev`: **0 vulnerabilities** (drizzle-orm upgraded for GHSA-gpj5-g38j-94v9); unused packages removed |

## 5. AI tutoring engine

This summarises [AI_TUTOR.md](AI_TUTOR.md).

- **The server plans every turn.** `planTurn` decides what the next message must do; the model
  returns strict JSON (`message`, `next_step`, `assessment`, `misconception`, `safety_concern`);
  zod validates it; `applyTurn` computes the next stage. Model suggestions outside the plan are
  ignored.
- **The lesson always ends.** There are 5 analytical questions, up to 2 hints per question and
  up to 2 "not ready" answers, and the summary is forced before the turn cap. **Complete** is
  allowed only from `READY_TO_COMPLETE`, enforced atomically.
- **Failures are safe.** Invalid output is retried once; after that the server returns a 503
  with nothing stored and the client can retry idempotently. Unsafe output or a leaked system
  prompt is replaced with a neutral re-ask.
- **Safety:**
  - Input and output are moderated; flagged messages are stored for teacher review.
  - Self-harm gets a signposting reply.
  - Untrusted text is fenced; the turn directive comes after the student's message.
  - Teacher guidance is hidden from students.
- **Cost control:**
  - 12-message context and 450 output tokens.
  - 25 s timeout.
  - Caps: 40 turns per assignment, 150 model calls per student per day, 30 audio minutes per
    student per day.
  - Every call is logged in `ai_usage`.

## 6. Database

- Migrations are hand-reviewed SQL (`migrations/`) with a runner that uses an advisory lock and
  automatically baselines databases originally created with `db:push`.
  - **Tested** against a simulated demo database (original schema, text booleans, naive
    timestamps, orphaned rows): data preserved, types converted, stages backfilled.
  - Fresh databases and re-runs are also tested, and the schema matches the migrations.
- **Changes (all non-destructive):**
  - `timestamptz` everywhere; boolean `notification_sent`.
  - Tutor state columns on `student_progress`.
  - Message metadata (stage, source, assessment, misconception, flag, idempotency key).
  - `assignment_students` for selected audiences; `ai_usage`.
  - Soft archiving and due dates.
  - Indexes chosen from real query patterns.
- **Integrity:** transactions for multi-row writes, and atomic `UPDATE … RETURNING` for session
  start, turn lock, completion and notification claims. Deleting a teacher archives their
  assignments instead of cascading away students' work.

## 7. Testing (results on the final commit)

| Suite | Result |
|---|---|
| `npm run check` (strict TypeScript) | pass |
| `npm run lint` (ESLint) | pass |
| `npm run format:check` (Prettier) | pass |
| `npm test`: 85 tests in 9 files, run against real PostgreSQL 16 | **85 passed** |
| `npm run test:e2e`: Playwright desktop + mobile, with axe WCAG 2.2 A/AA scans (no serious/critical violations allowed) | **6 passed** |
| `npm run build` | pass |
| `npm audit --omit=dev` | 0 vulnerabilities |

What the tests cover:

- **Authorization:** student A vs student B, teacher A vs teacher B, cross-school access,
  selected audiences, scheduled/archived visibility, role separation, mass assignment, malformed
  ids.
- **Tutoring:** the full flow, hints, readiness, idempotent retries, concurrent turns, AI
  outage, malformed output, unsafe input, prompt leaks, validation, review cap, heartbeat time.
- **Auth:** cookies, CSRF, expired and forged sessions, timing-safe login, Google state/PKCE
  tampering.
- **Platform:** analytics maths, pagination, push SSRF, uploads (spoofed type, oversized,
  failed or empty transcription), rate limits, security headers, privacy export/delete.
- **E2E:** teacher creates an assignment → student completes it (including a mid-session
  refresh) → teacher sees progress and the transcript; sign-in redirect and return; role
  redirect; network loss with retry and no duplicate; phone layout with no horizontal overflow.

Also checked manually in headless Chromium: voice with the recorder/Whisper fallback (fake
microphone), the microphone-denied recovery screen, dark mode, mobile layouts, and dev mode
with HMR.

**Bugs this review found and fixed:**

- The service worker's first install reloaded the page mid-request.
- The voice mode got stuck on "unsupported" before the session loaded.
- The chat stopped following new messages after rapid replies.
- The mobile logo gradient was invisible.
- The composer showed a double focus ring.
- `/teacher` itself didn't match its route.
- Signed-out visitors triggered console 401 noise.

## 8. Deployment

Use the Docker multi-stage image: non-root, production dependencies only, with a `HEALTHCHECK`.
Run `node dist/migrate.js` as a release step (or set `RUN_MIGRATIONS=true`). The service exposes
`/health` (liveness) and `/ready` (database check), and shuts down gracefully. CI runs on every
pull request. Full guide: [DEPLOYMENT.md](DEPLOYMENT.md).

## 9. Environment variables

All variables are documented in [`.env.example`](../.env.example) and validated at startup.

| Needed | Variables |
|---|---|
| Always | `DATABASE_URL` |
| Production | `NODE_ENV=production`, `APP_URL`, `OPENAI_API_KEY`, `TRUST_PROXY` (number of proxies; `0` if none) |
| AI tuning | `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_MODERATION`, `AI_*` limits, `TRANSCRIPTION_ENABLED`, `MAX_AUDIO_*` |
| Push (optional) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Google (optional) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SESSION_SECRET` |
| Other | `PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `COOKIE_SECURE`, `SESSION_TTL_DAYS`, `DATABASE_POOL_MAX`, `RUN_MIGRATIONS` |

## 10. Remaining risks and recommended next steps

| Risk | Recommendation |
|---|---|
| **The demo's database credential is in git history** (`4b79ac7`) | Rotate the password now; purge history if the repository was ever shared |
| Teacher accounts are not verified (student access is now controlled by class join codes) | Add school SSO or admin approval of teachers before scaling beyond pilots |
| Password-reset emails need an email provider | Set `RESEND_API_KEY` + `EMAIL_FROM`; without them teachers create reset links for students, and teachers need an admin to reset theirs |
| No admin/support role | Needed to run data export/deletion (service is ready) and to handle safeguarding escalation |
| The real OpenAI tutor hasn't been run in this environment (tests use the mock) | Run a staging session with `AI_PROVIDER=openai`, review tone, check the JSON adherence rate, tune the prompts |
| Voice was tested only with a fake microphone in headless Chromium | Test on real devices: iOS Safari, Android Chrome, Chromebooks, Firefox (recorder fallback) |
| Push delivery wasn't tested end to end (needs VAPID keys and real browsers) | Test subscription → notification → click on Android and desktop; iOS needs Home-Screen install |
| Google OAuth was tested only up to the Google redirect | Run the full flow with real credentials in staging |
| Rate limits live in each process by default | Set `RATE_LIMIT_STORE=postgres` when running several instances (automatic on Vercel) |
| Teacher overview loads progress for up to 200 active assignments in memory | Fine for schools with hundreds of students; move to SQL aggregates if much larger |
| Moderation fails open when OpenAI moderation is down | Decide the safeguarding policy (fail-closed is a one-line change) |
| No error-tracking service | Add Sentry (or similar) hooks in the error handler and the error boundary if wanted |
| Legal/privacy review not done | See the "Needs legal/privacy review" section of [SECURITY.md](SECURITY.md) |

## 11. External and manual configuration you need to do

1. **Rotate** the Neon database password exposed in the demo archive.
2. **Production database:** create it (with TLS and backups) and set `DATABASE_URL`.
3. **Domain, DNS and TLS:** point the domain at your host and set `APP_URL=https://…`.
4. **OpenAI:** create a project key and set a monthly budget cap and usage alerts in the OpenAI
   dashboard. Review data-retention settings for student content.
5. **VAPID** (optional): `npx web-push generate-vapid-keys`, then set the three `VAPID_*`
   variables.
6. **Google OAuth** (optional): create an OAuth client with the authorized redirect URI
   `https://<domain>/api/auth/google/callback`, and set `GOOGLE_*` plus a random
   `SESSION_SECRET` (32+ characters).
7. **Hosting:** set up the deploy pipeline from `main` and configure health checks (`/health`,
   `/ready`).
8. **Branch protection:** require CI to pass before merging.
9. **Contacts:** a security contact address, a privacy notice, and school agreements.

## 12. Commands

```bash
# install
npm ci

# develop (loads .env; AI_PROVIDER=mock works offline)
cp .env.example .env && npm run db:migrate && npm run dev

# quality
npm run check && npm run lint && npm run format:check

# tests (needs Postgres)
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/learnify_test npm test
npm run build && E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/learnify_e2e npm run test:e2e

# build
npm run build

# migrate (production build)
NODE_ENV=production DATABASE_URL=… node dist/migrate.js

# start production
NODE_ENV=production APP_URL=… DATABASE_URL=… OPENAI_API_KEY=… npm start

# container
docker build -t learnify . && docker run --env-file .env.production -p 5000:5000 learnify
```

## 13. Production readiness: honest status

**Verified in this environment:**

- Clean install, strict typecheck, lint, formatting and the production build.
- The production server starts with production dependencies only.
- All automated tests pass against real PostgreSQL.
- The E2E critical path passes on desktop and mobile viewports with no serious or critical
  accessibility violations.
- Migrations are safe on a simulated demo database.
- There are no known vulnerable production dependencies.

**Not verified here (needs your environment):**

- The real OpenAI tutor quality and cost.
- Voice on real devices and browsers.
- Push delivery.
- Google OAuth end to end.
- The Docker image build: there's no Docker daemon here; CI builds it.
- Deployment on your chosen host.
- Load beyond small-school scale.

**Before launch:** complete the credential rotation, the staging checks above and the
legal/privacy review. With those done, the application is in a sound state to pilot with real
schools. For wider rollout, prioritise teacher verification (school SSO) and an admin role.
