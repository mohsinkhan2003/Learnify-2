# Security, privacy & student safety

Learnify handles data about students, who may be children. This document describes the
protections in place and the decisions that still need an owner. It makes **no legal compliance
claims** — see "Needs legal/privacy review" at the end.

## Authentication

- **Passwords:** bcrypt (cost 12), 8–128 chars. Login compares against a real dummy hash when the
  account doesn't exist, so response time doesn't reveal which emails are registered. Errors are
  generic ("That email and password don't match an account.").
- **Sessions:** 32 random bytes, delivered only in an **httpOnly, SameSite=Lax** cookie
  (`__Host-` prefixed and **Secure** in production). Only the SHA-256 of the token is stored.
  7-day expiry (`SESSION_TTL_DAYS`); expired sessions are rejected and purged hourly; logout
  deletes the session server-side. No token is ever readable by JavaScript or stored in
  `localStorage`.
- **Google OAuth (optional):** authorization code flow with **PKCE** and a random **state**
  bound to the browser in an HMAC-signed, 10-minute httpOnly cookie; fixed redirect URI from
  config; only Google-verified emails are accepted; existing accounts with the same verified
  email are linked; new users complete role/school selection via a signed 15-minute cookie. Only
  fixed relative redirects are used (no open redirect).
- **Rate limits:** login (10 / 15 min per IP+email, 50 per IP), signup (20 / h per IP), OAuth,
  tutor turns (12 / min / user), transcription (12 / min / user), push (30 / h / user),
  analytics (60 / min / user), global API ceiling (300 / min / IP). State is in-process — use a
  shared store (e.g. Redis) when running several instances.

## Authorization

- Every `/api/teacher/*` route requires role *teacher*, every `/api/student/*` route role
  *student* (`middleware/auth.ts`). Role checks are not scattered in handlers.
- Resource access is decided in **one place**, `policies/assignment-access.ts`:
  teachers only manage assignments they created; students only see released, non-archived
  assignments in their audience: classes they joined with a teacher's code, or the selected
  recipient list (recipients must also still be class members). The SQL filter
  used for lists is the twin of the in-memory policy and both are unit tested.
- Other people's resources return **404** (no existence oracle). IDs are validated as UUIDs (400).
- Students can only act on their own progress: the student id always comes from the session —
  no endpoint accepts a student id for writes. Ownership fields (`teacherId`, `teacherSchool`)
  always come from the session (mass-assignment test).
- Teachers can only assign to their own, non-archived classes, and recipients must be members of
  that class (server-validated). Student membership only comes from a join code, so typing a
  school name no longer grants access to anything.
- **Password reset:** tokens are 32 random bytes, stored as SHA-256 hashes, single-use, valid for
  one hour; issuing a new one invalidates older ones; a reset revokes every session. "Forgot
  password" always answers the same way (no account enumeration) and is rate limited per IP+email.
  Teachers can create a reset link only for students in their own classes.
- Integration tests cover student A vs B, teacher A vs B, cross-school, selected audiences,
  scheduled/archived visibility and role separation (`tests/integration/authorization.test.ts`).

## Request security

- **CSRF:** SameSite=Lax cookies **plus** an Origin/Referer check on every state-changing request
  (must equal this server's origin or an entry in `APP_URL`/`CORS_ORIGINS`).
- **CORS:** off by default (same-origin app); explicit allowlist when configured.
- **Headers (helmet):** CSP (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`,
  `object-src 'none'`), HSTS in production, `X-Content-Type-Options`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` (microphone self only; camera,
  geolocation, payment off), `X-Powered-By` removed.
- **Input validation:** zod schemas on every body, param and query; 64 KB JSON limit; message
  length 2000; malformed JSON → 400.
- **SQL:** Drizzle parameterised queries only; LIKE search input is escaped.
- **XSS:** React escaping; no `dangerouslySetInnerHTML`; CSP as a second layer.
- **Uploads (audio):** memory-only multer, 3 MB cap, one file, MIME allowlist **and** magic-byte
  sniffing (declared type and filename are ignored), duration check, never written to disk.
- **SSRF:** push subscription endpoints must be HTTPS on known browser push services.
- **Errors:** a uniform envelope with a request id; stack traces, SQL and internal messages are
  logged, never returned.
- **Logging:** structured pino logs with request id, route, status, duration and user id. Request
  bodies, query strings (OAuth codes), cookies, tokens and passwords are never logged; defensive
  redaction is configured anyway. Student conversation text is not logged.

## Secrets

- All secrets come from environment variables; `.env*` is git-ignored; `.env.example` has no
  real values.
- **Action required:** the original demo archive (commit `4b79ac7` in git history) contains a
  `.env` with a live Neon `DATABASE_URL`. Rotate that database password. Consider rewriting
  history (e.g. `git filter-repo`) if the repository was ever shared.
- The OpenAI key is server-side only.

## Privacy: what is stored and why

| Data | Why | Retention (current) |
|---|---|---|
| Account: name, email, school, role, subject (teachers), bcrypt hash, Google id/avatar if used | sign-in, school matching, display to teachers | until the account is deleted |
| Sessions (token hash, expiry) | sign-in | deleted at expiry (≤ 7 days) or logout |
| Assignments (topic, guidance, dates, audience) | the homework itself | kept; archived rather than deleted |
| Conversation text (student + tutor), stage, automated assessment, flags | the learning session, teacher review, safeguarding evidence | until deleted (retention policy to be decided) |
| Progress (stage, counts, active time, timestamps) | analytics shown to teachers | until deleted |
| AI usage rows (token counts, audio seconds — no content) | cost tracking, fair-use limits | kept (no personal content) |
| Push subscription (endpoint + keys) linked to the user | new-homework notifications | removed on unsubscribe or when the push service reports it gone |

**Not stored:** raw audio (transcribed in memory, then discarded), IP addresses beyond transient
rate-limit counters, analytics/tracking cookies (there are none).

Third parties: **OpenAI** receives assignment context and the student's messages (and audio for
the fallback transcription path); browser speech recognition in Chrome/Edge sends audio to the
browser vendor's service. Both need to be covered in the privacy notice and school agreements.

Prepared operations (`server/modules/privacy/privacy.service.ts`, tested, not yet routed):
`exportStudentData` (access/portability), `deleteUser` (erasure; a deleted teacher's assignments
are archived, not destroyed), `purgeConversationsOlderThan(days)` (retention). Wire these to an
authorised admin/support workflow once roles and policy are agreed.

## Student safety

- Tutor rules: on-topic only, no personal data requests, no unsafe content, safeguarding
  response with signposting to a trusted adult.
- Moderation on student input and tutor output; prompt-injection defences and leak canary
  ([AI_TUTOR.md](AI_TUTOR.md)).
- Flagged messages are kept for teacher review and surface first in "may need attention".
- Teachers see every conversation of their students. Automated assessments are labelled as such.
- Insights use neutral, evidence-backed wording ("may need attention"), never labels.

## Needs legal / privacy review (not decided by engineering)

- Lawful basis, consent and age requirements for the markets served (e.g. UK GDPR / Children's
  Code, COPPA/FERPA in the US) and parental consent flows if required.
- Data processing agreements with schools and sub-processors (OpenAI, hosting, database).
- OpenAI data-retention settings (e.g. zero-data-retention eligibility) for student content.
- Conversation retention period and deletion SLA; who may request deletion/export.
- Safeguarding escalation: whether flagged messages should notify a designated safeguarding lead,
  and whether moderation should fail closed.
- Class membership is controlled by join codes. Teachers themselves are not verified (anyone can
  sign up as a teacher and create a class); schools that need that should add school SSO or an
  admin approval step.

## Reporting a vulnerability

Email the maintainers privately (set a `security@` address before launch). Please do not open
public issues for security problems.
