# Learnify — Production Audit

**Scope:** the complete application as delivered in `Learnify (2).zip → Learnify.zip`, a Replit-built
demo (commit `4b79ac7`, archive preserved in git history). This document records what was found
*before* any production work. It is kept as a baseline; the final state is described in
`PRODUCTION_READINESS_REPORT.md`.

Legend: 🔴 blocker · 🟠 high · 🟡 medium · ⚪ low. "(fixed in `208dadd`)" marks items the first
hardening pass already addressed.

---

## 1. Repository & build

| # | Finding | Sev |
|---|---|---|
| R1 | Git tracked only a zip-inside-a-zip. No diffs, no reviews, no CI possible. (fixed in `ace3485`) | 🔴 |
| R2 | The archive contained `.env` with a live `DATABASE_URL` (Neon credentials). It stays in git history at `4b79ac7`. **Rotate the password; consider purging history.** | 🔴 |
| R3 | `npm run build` failed: pages imported images from `attached_assets/` that were not in the archive. (fixed) | 🔴 |
| R4 | `npm run check` failed with 15 TypeScript errors (missing SpeechRecognition types, `ChatMessage` misuse, a non-existent `sender` field). (fixed) | 🟠 |
| R5 | Production bundle statically imported `vite` (a devDependency), so `npm ci --omit=dev && npm start` crashed. (fixed) | 🔴 |
| R6 | The archive included Replit agent state (`.local/`), screenshots and a `.git` directory. | ⚪ |
| R7 | `npm audit`: 17 vulnerabilities (12 high) in transitive deps (`ws`, `qs`, `yaml`, …). | 🟠 |
| R8 | About 15 unused dependencies: passport, express-session, memorystore, connect-pg-simple, @google/genai, sharp, multer (dead route only), ws, … | ⚪ |

## 2. Architecture (as found)

```
client/ (React 18 + Vite + Wouter + TanStack Query + shadcn/ui)
  pages/  home, login, signup, dashboard(role switch), teacher-dashboard, student-home,
          student-chat (826 lines), debug-auth (unrouted)
  hooks/  use-voice-conversation (531), use-homework-notifications (321, polling + sounds),
          use-progress-tracking (190)
server/ (Express 4)
  index.ts        CORS *, request logger that logs full JSON responses, error handler that re-throws
  routes.ts       1,331 lines: every endpoint, prompts, AI calls, push, background job
  auth.ts         bcrypt + random session tokens (stored in plaintext)
  auth-routes.ts  signup/login/google/me/logout, logs request bodies (passwords) and headers
  storage.ts      Drizzle queries
  db.ts           neon-http driver (Neon-only)
shared/schema.ts  Drizzle schema + zod insert schemas
```

**State management:** TanStack Query with `staleTime: 0`, `refetchOnMount: 'always'` and a 5s
progress poll. The auth token lived in `localStorage` and was read by hand in about 10 places.

**Deployment assumptions:** Replit only. `reusePort`, Replit Vite plugins always loaded, secrets
"in Secrets", port 5000, no health check that avoided heavy queries, no migrations (`db:push`).

## 3. Existing functionality (must be preserved)

**Teacher:** email/password signup (name, school, subject). Create an assignment with topic, grade,
subject, free-text AI instructions and a notification time. View assignment cards. Per-assignment
analytics: completion rate, average time, average messages, status pie chart, time-per-student bar
chart, and a "struggling students" list (the heuristic was low messages or low time).

**Student:** signup (name, school). Home lists assignments from their school with a status badge
(Available / In progress / Completed) and a 3-message conversation preview. The tutor page is
voice-first: Start → server greeting → browser SpeechRecognition (continuous, 2s silence ends
a turn) → `/api/chat` → speechSynthesis (male/female voice, rate 0.9) → auto-resume listening. A
text transcript is shown. The Complete button unlocks on "summary" or on ≥3 min and ≥15 messages.

**Tutor flow:** a 9-stage script in the system prompt (greeting → readiness → prior knowledge → 5
analytical questions → summary). The stage came from counting AI messages.

**Notifications:** VAPID web push to *all* subscriptions when an assignment's notification time
arrives, via a 60s interval job. There was also a client-side poller that played sounds and showed
local notifications.

**PWA:** manifest, service worker (cache-first for everything), install prompt.

## 4. Critical defects found

| # | Defect | Impact | Sev |
|---|---|---|---|
| D1 | `storage.getChatMessages` filtered on `message.sender`, which does not exist, so it **always returned `[]`**. | The tutor never saw conversation history. Every reply was generated as if at stage 1, and teachers and students saw empty transcripts. | 🔴 |
| D2 | Opening the chat page POSTed `/api/progress` `{status:'not_started', totalTimeSpent:0}` and the upsert overwrote existing values. | Re-opening an assignment **reset completed work** and time spent. | 🔴 |
| D3 | `getAssignments()` fetched the 10 newest rows globally, then filtered by teacher or school in JS. | Teachers and students silently lost assignments once others created more. | 🔴 |
| D4 | Summary detection by substring (`"overall"`, `"great job"`, `"well done"`…). | Completion unlocked mid-session on ordinary praise. | 🟠 |
| D5 | Teacher "AI instructions" were stored but never sent to the model. | A headline feature did nothing. | 🟠 |
| D6 | Time tracking: the client PATCHed an absolute `totalTimeSpent` measured from page load. | A refresh replaced the accumulated time with the new session's shorter duration; hidden tabs counted as learning time. | 🟠 |
| D7 | Message count was incremented by a separate client call (read-modify-write). | Counts could be lost; clients could inflate them. | 🟡 |
| D8 | Service worker served `/` cache-first. | Users stayed on a stale build after deploys. | 🟠 |
| D9 | The Express error handler re-threw after responding. | Any error crashed the process. | 🔴 |
| D10 | Push notification URL `/student/:id` did not exist in the router. | Notification taps went to 404. | ⚪ |

## 5. Security

| # | Finding | Sev |
|---|---|---|
| S1 | `POST /api/push/send` was unauthenticated: anyone could push arbitrary text to every subscribed device. | 🔴 |
| S2 | `GET /api/assignments/:id`, `POST /api/push/subscribe` and `PATCH /api/assignments/:id` had no auth or ownership check (IDOR). | 🔴 |
| S3 | Teachers could read or modify any student's progress. Students could set their own status to `summary_provided`/`completed` directly. | 🟠 |
| S4 | Passwords, full request headers and session tokens were written to logs. The response logger printed JSON bodies, including tokens. | 🔴 |
| S5 | Session tokens were stored in plaintext in the DB and kept in `localStorage` (XSS-exfiltratable). | 🟠 |
| S6 | CORS `*`, no security headers, no body size limit, no rate limiting on login, signup or AI. | 🟠 |
| S7 | Weak signup validation (any password length, no email format check); emails were case-sensitive. | 🟡 |
| S8 | Google OAuth: no `state` parameter, role taken from the request body, Google-verified email not required. | 🟠 |
| S9 | Internal error messages and stacks were returned to clients (`error.message`, `details: error.stack`). | 🟡 |
| S10 | `multer` memory upload with **no size limit** on the (dead) `/api/chat/process-audio` route. | 🟠 |
| S11 | Prompt injection: topic and instructions were interpolated raw into the system prompt, with no separation of trusted and untrusted text and no output checks. | 🟠 |
| S12 | Push notifications went to every subscriber regardless of school, which leaks assignment topics across schools. | 🟡 |
| S13 | Tutor avatar was a watermarked Alamy stock photo (licensing). | ⚪ |

## 6. Database

- No migrations; schema managed by `drizzle-kit push`. There is no way to evolve production safely. 🔴
- `timestamp` **without time zone** everywhere; correctness depends on server TZ. 🟡
- `assignments.notification_sent` is a `text` `'true'/'false'`. ⚪
- `chat_messages.assignment_id` is `varchar` with **no FK** to `assignments` (orphans exist after
  the old cleanup script). There was no index on `(assignment_id, user_id)`. 🟡
- `assignments.student_id` is legacy and unused by the product. ⚪
- There is no tutoring state beyond coarse `status`, no AI usage table, and no audit of flagged
  content. 🟠
- `user_push_subscriptions` link table existed but was never written. ⚪
- There were no transactions anywhere (the neon-http driver cannot do interactive transactions). 🟡

## 7. AI

- The state machine lived entirely in the prompt and the stage was derived from a message count. Application state was
  parsed from prose. 🔴
- There was no limit on context; the full history was sent every turn (unbounded cost). 🟠
- No per-user or daily limits, no timeout or retry policy, no usage tracking. 🟠
- No moderation of student input or model output; minors are the audience. 🟠
- The prompt was duplicated in two routes. ⚪
- `whisper-1` code existed but was unused; STT relied only on the browser's `webkitSpeechRecognition`
  (Chrome/Edge/Safari). There was no fallback for Firefox, and audio goes to the browser vendor. 🟡

## 8. UX & accessibility

- Visual design reads as a demo: inconsistent sizes, emoji-heavy copy, a fixed floating profile
  chip, gradients everywhere, no navigation structure. 🟡
- Voice states were indistinguishable ("is it listening?"). Errors appeared as destructive toasts;
  microphone denial had no recovery guidance. 🟠
- The Complete button logic was client-side only, and a 5s poll drove it. 🟡
- Very large `console.log` volume in the browser (conversation text, emails). 🟡
- Missing labels on icon buttons, no focus management, colour-only status badges, no
  `prefers-reduced-motion` handling, `user-scalable=no` in the viewport (blocks zoom — WCAG 1.4.4). 🟠
- There were no empty states for teachers and no onboarding. ⚪

## 9. Scalability & operations

- In-process `setInterval` job without a claim step: running 2 instances causes duplicate
  notifications. 🟡
- Health endpoint ran a table scan. There was no readiness probe and no graceful shutdown. 🟡
- Logs were unstructured, with no request IDs. 🟡
- Rate-limit state is per-process (acceptable for one instance; document a shared store for more). ⚪

## 10. Recommended architecture

Keep the stack (React/Vite/TanStack Query/Express/Drizzle/Postgres) and restructure it:

```
server/
  app.ts                 createApp() – middleware, routes, errors (testable without listen)
  index.ts               bootstrap: config, DB check, jobs, graceful shutdown
  config/                validated env
  db/                    pool, drizzle, migrate runner
  lib/                   errors, logger, http helpers
  middleware/            auth (cookie session), csrf (Origin check), rate limits, validation
  auth/                  password, sessions, google oauth, routes
  policies/              central authorization (canViewAssignment, …)
  modules/assignments/   routes · service · repository
  modules/tutoring/      routes · service (turn orchestration, completion, heartbeat)
  modules/analytics/     overview metrics, explainable insights
  ai/                    provider (openai | mock), prompts, schemas, state machine, safety, usage
  notifications/         push service, scheduler with atomic claims
client/src/
  app/ (router, providers, shells) · features/{auth,teacher,student,tutoring,notifications}
  components/{ui (shadcn), common} · lib/api (typed client, error envelope)
```

Key decisions:

- **Sessions:** httpOnly, SameSite=Lax cookies (Secure in production) holding a random token; only
  the SHA-256 hash is stored. CSRF is handled by an Origin/Referer check on unsafe methods plus
  SameSite.
- **Tutor state:** server-side state machine. The model returns validated structured JSON
  (message + assessment signals), and the server alone decides stage transitions and completion.
- **Cost:** bounded context window, output token caps, per-minute/per-day/per-assignment turn limits,
  moderation before generation, usage table.
- **Migrations:** drizzle-kit generated SQL plus a runner that baselines databases created by `db:push`.

## 11. Implementation phases

0 Recovery ✔ · 1 Audit ✔ · 2 Foundation (config, errors, logging, modules) · 3 Security (cookie
sessions, CSRF, RBAC, OAuth state, rate limits, upload limits) · 4 Database (migrations, timestamptz,
state columns, indexes, transactions) · 5 AI tutor engine · 6 Design system · 7 Teacher experience ·
8 Student/tutor experience · 9 Push/PWA · 10 Tests (unit, API, authz, E2E) · 11 Deployment (Docker,
CI, docs) · 12 Final adversarial review and report.
