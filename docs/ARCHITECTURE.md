# Architecture

Learnify is a single deployable Node service: an Express API that also serves the built React
SPA. PostgreSQL is the only stateful dependency. OpenAI is called server-side only.

```
Browser (React SPA, PWA)
   │  same-origin HTTPS, httpOnly session cookie
   ▼
Express (server/app.ts)
   request id + structured logs → helmet/CSP → rate limits → session → CSRF (Origin) → routes
   ├── /api/auth/*        auth/            passwords, sessions, Google OAuth
   ├── /api/teacher/*     modules/assignments + modules/analytics   (role: teacher)
   ├── /api/student/*     modules/tutoring  → ai/ (tutor engine)     (role: student)
   ├── /api/push/*        notifications/
   ├── /health /ready     liveness / readiness
   └── static SPA         dist/public (immutable hashed assets)
   │
   ├── PostgreSQL (Drizzle, node-postgres pool)
   └── OpenAI (chat completions w/ JSON schema, moderation, transcription)
Background (in-process, multi-instance safe): due-notification sender (60s), expired-session cleanup (1h)
```

## Backend

Layering per feature: **route** (validation with zod, HTTP concerns) → **service** (business
rules, transactions) → **repository** (queries). Cross-cutting pieces live in `lib/` (errors,
logger, http helpers), `middleware/` and `policies/`.

| Concern | Where | Notes |
|---|---|---|
| Config | `config/env.ts` | zod-validated, fail-fast, typed `config` object |
| Errors | `lib/errors.ts`, `middleware/error-handler.ts` | `AppError(status, code, message)` → `{ error: { code, message, details?, requestId } }`; 500s are logged, never leaked |
| Logging | `lib/logger.ts`, `middleware/request-context.ts` | pino JSON; request id (honours valid `X-Request-Id`); path only (no query strings); redaction of cookies/tokens/passwords |
| Auth | `auth/` | see [SECURITY.md](SECURITY.md) |
| Authorization | `policies/assignment-access.ts` | the only place assignment access rules exist (in-memory + SQL twin) |
| Tutor engine | `ai/` | see [AI_TUTOR.md](AI_TUTOR.md) |
| Analytics | `modules/analytics/` | metrics and insights computed from stored data by one code path |
| Push | `notifications/` | claim-once delivery, endpoint allowlist |
| Privacy ops | `modules/privacy/` | export / delete / retention (not yet routed) |

### API surface

| Method & path | Role | Purpose |
|---|---|---|
| `GET /api/auth/session` | any | `{ user \| null }` probe for the SPA |
| `POST /api/auth/signup` · `login` · `logout` · `GET me` | – | email/password auth |
| `GET /api/auth/google/start` · `callback` · `pending`, `POST google/complete` | – | Google OAuth (when configured) |
| `GET /api/teacher/overview` | teacher | KPIs, attention list, recent assignments |
| `GET/POST /api/teacher/assignments` | teacher | paginated list with stats / create |
| `GET /api/teacher/assignments/:id` | teacher | stats, per-student progress + insights, not-started list |
| `POST /api/teacher/assignments/:id/archive` · `unarchive` | teacher | soft archive |
| `GET /api/teacher/assignments/:id/students/:studentId/messages` | teacher | transcript |
| `PATCH /api/teacher/assignments/:id` | teacher | edit topic/subject/grade/guidance/due date; release time only while scheduled |
| `GET/POST /api/teacher/classes`, `GET/PATCH /:id`, `POST /:id/code` | teacher | classes, join codes (regenerate), rename/archive |
| `DELETE /api/teacher/classes/:id/members/:studentId`, `POST …/reset-link` | teacher | remove a student / one-time password reset link |
| `GET /api/teacher/students` | teacher | students in the teacher's classes with activity |
| `GET /api/student/classes`, `POST /api/student/classes/join` | student | my classes / join with a code |
| `POST /api/auth/password/forgot` · `reset` | – | email reset link (when email is configured) / set new password |
| `GET /api/student/assignments` · `/:id` | student | visible assignments / tutor session |
| `POST /api/student/assignments/:id/session` · `messages` · `heartbeat` · `complete` | student | tutoring |
| `POST /api/student/transcriptions` | student | audio → text fallback |
| `GET /api/push/public-key`, `POST/DELETE /api/push/subscriptions` | any / signed-in | web push |

### Data model

```
users ─┬─< sessions                (token = SHA-256 hash)
       ├─< assignments (teacher_id) ──< assignment_students >── users (students, audience=selected)
       ├─< student_progress >── assignments      (1 row per student × assignment, tutor state)
       ├─< chat_messages (user_id)                (assignment_id varchar, legacy-compatible)
       ├─< ai_usage                               (cost tracking)
       └─< user_push_subscriptions >── push_subscriptions
```

Key decisions:

- **timestamptz everywhere**; clients format in the viewer's zone. Release times are entered as
  local wall time and converted to UTC in the browser.
- **Soft archive** (`assignments.archived_at`) instead of deletes; deleting a teacher archives
  their assignments rather than cascading away students' work.
- **Assignment visibility** = released (`notification_time ≤ now`) ∧ not archived ∧ in audience
  (members of the assignment's class, or selected recipients who are also still class members).
  Legacy assignments created before classes existed keep the old school-name audience so existing
  data isn't lost; legacy demo rows without a school stay visible.
- **Classes:** `classes` (owned by one teacher, unique 8-character join code from an unambiguous
  alphabet, shown as `XXXX-XXXX`, soft-archived) and `class_members`. Regenerating a code or
  archiving a class stops new joins; removing a member revokes access immediately.
- **Password reset:** `password_reset_tokens` stores SHA-256 hashes of single-use, one-hour
  tokens. Using one sets the password and revokes all of the user's sessions.
- `chat_messages.assignment_id` stays `varchar` without FK: demo data contains orphaned rows and
  converting would need destructive cleanup. Access always goes through the assignment first.
- Indexes follow actual queries: teacher lists (`teacher_id, created_at`), student visibility
  (`teacher_school, notification_time`), due notifications (partial on `notification_sent=false`),
  conversations (`assignment_id, user_id, timestamp`), usage limits (`user_id, created_at`).

### Transactions & concurrency

| Operation | Mechanism |
|---|---|
| Create assignment + recipients | single transaction |
| Start session (greeting) | `UPDATE … WHERE tutor_stage='NOT_STARTED' RETURNING` inside a transaction → exactly one greeting |
| Tutor turn | atomic turn lock (`turn_locked_at`, 90 s expiry) → AI call outside any transaction → one transaction writes both messages + progress; `client_message_id` unique index makes retries idempotent |
| Complete | `UPDATE … WHERE tutor_stage='READY_TO_COMPLETE'` (idempotent, cannot skip the tutor) |
| Heartbeat time | single atomic `UPDATE` (no read-modify-write) |
| Notifications | `UPDATE … SET notification_sent=true WHERE notification_sent=false RETURNING` claim |
| Migrations | Postgres advisory lock |

## Analytics definitions

These are computed in `modules/analytics/` and shown identically everywhere.

| Metric | Definition |
|---|---|
| Eligible students | students in the audience: the class's members (audience *class*), the selected recipients, or — for legacy assignments — everyone at the teacher's school; never fewer than students who started |
| Started | progress status ≠ `not_started` (a session was opened) |
| Completed | status `completed` (student handed in after the tutor's summary) |
| Completion rate | completed ÷ eligible; overview sums over active (released, not archived) assignments |
| Active time | seconds credited by heartbeats every 30 s **while the tab is visible**; a gap > 90 s (hidden tab, sleep, disconnect) credits nothing; max 60 s per beat; multiple tabs cannot double count; stops after completion |
| Messages | student messages sent to the tutor (greeting and tutor replies excluded) |
| Practice progress | analytical questions completed (0–5), from the state machine |

"May need attention" signals (each shows its evidence; wording is always "may need attention"):
hints on ≥ 3 questions · ≥ 3 answers assessed incorrect by the tutor (labelled as automated) ·
any message held by the safety filter · started but inactive ≥ 3 days · active time above
max(2 × class median, 20 min) (fallback 45 min with < 3 samples). "Not started N days after
release" appears in the not-started list after 3 days.

## Frontend

- **Routing** (`app/App.tsx`): route-level code splitting; `/teacher/*` and `/student/*` behind
  `RequireRole` (UX only — the server enforces access). Legacy `/dashboard` and `/chat/:id` redirect.
- **Server state** lives in TanStack Query with central keys (`lib/query.ts`). A 401 anywhere
  resets the session query so guards redirect to sign-in. Retries only for network/5xx.
- **API client** (`lib/api.ts`): same-origin fetch with cookies, `ApiError` from the envelope,
  field errors for forms.
- **Local state** is limited to UI state, the in-flight tutor message and per-device preferences
  (theme, voice settings, dismissed tips, assignment drafts).
- **Tutoring** (`features/tutoring/`): `useTutorSession` (server state, idempotent send/retry,
  heartbeats), `useVoice` (voice state machine), `MessageList` (smart autoscroll), `Composer`.

### Design system

Tokens are CSS variables in `client/src/index.css` (HSL triplets, light + `.dark`), mapped in
`tailwind.config.ts`: background/surface/muted, primary (indigo) with soft/strong steps, accent
(violet), success/warning/info/destructive with soft variants, radius, layered shadows, and a
restrained `glass` surface (navigation, tutor dock, floating controls) with solid fallbacks for
`prefers-reduced-transparency` and browsers without backdrop-filter. Typography uses Inter
(self-hosted via @fontsource) with a fixed scale: `text-display`, `text-page-title`,
`text-section-title`, `text-card-title`, `text-body`, `text-label`, `text-helper`, `text-metric`,
`text-eyebrow`. Status is always icon + label (never colour alone); numbers in tables use
tabular figures. `prefers-reduced-motion` disables animation globally.

Shared components: `PageHeader`, `EmptyState`, `ErrorState`, skeletons, `StatTile`, `Meter`,
`StatusBadge`, `AssignmentCard`, `InsightList`, `TranscriptSheet`, `VoiceButton`, `MessageList`,
`Composer`.

### PWA

Manifest with SVG, PNG and maskable icons. Service worker: API never cached; navigations
network-first with offline shell fallback; hashed `/assets` cache-first; new versions wait until
the user clicks **Update** (no forced reloads, no stale builds). Push notifications use generic
text (lock-screen safe) and only open same-origin URLs.
