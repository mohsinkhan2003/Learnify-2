# AI tutor

The tutor is the core of Learnify. Its design principle: **the server owns the lesson; the model
only writes the words.** Application state (stage, completion) is never parsed from prose.

Code: `server/ai/` (engine) and `server/modules/tutoring/` (orchestration).

## Session flow

```
NOT_STARTED ─start─▶ GREETING ─▶ READINESS_CHECK ─▶ KNOWLEDGE_CHECK ─▶ GUIDED_PRACTICE ×5 ─▶ SUMMARY ─▶ READY_TO_COMPLETE ─complete─▶ COMPLETED
                                  (≤2 "not ready")                      (≤2 hints/question)            (≤3 follow-ups)
```

This preserves the demo's flow (greeting → readiness → prior knowledge → analytical questions →
summary → completion) but implements it in `ai/state-machine.ts`:

- `planTurn(state)` decides what the next tutor message must do (e.g. "feedback on question 3,
  then ask question 4; a hint is allowed").
- The model returns validated JSON; `applyTurn(state, plan, output)` computes the next state.
  Model suggestions outside the plan (a hint when the hint budget is spent, "not ready" outside
  readiness) are ignored.
- The summary is forced one turn before the per-assignment turn cap, so every session can finish.
- **Complete** is only possible from `READY_TO_COMPLETE`, enforced by an atomic SQL update.
- The greeting is static text (no model call, no cost).

The coarse `status` column (`not_started`/`in_progress`/`summary_provided`/`completed`) is derived
from the stage for analytics and compatibility with demo data.

## Structured output

`ai/schemas.ts` defines the contract (OpenAI strict JSON schema + zod):

| Field | Use |
|---|---|
| `message` | text shown and spoken to the student |
| `next_step` | `advance` · `hint` · `wait_for_readiness` — an input to the state machine |
| `assessment` | `correct` · `partially_correct` · `incorrect` · `no_attempt` · `not_applicable` — stored on the message; feeds counters shown to teachers as *automated* evidence |
| `misconception` | optional short note, shown to teachers in the transcript |
| `safety_concern` | flags the student message for teacher review |

Invalid output → one retry with a corrective instruction → otherwise a 503 with *no state change
and nothing stored*; the student's bubble offers **Retry** (same `clientMessageId`, idempotent).

## Prompts & prompt-injection defence

All prompts live in `ai/prompts.ts` (`PROMPT_VERSION` for traceability):

- The **system prompt** holds trusted rules: pedagogy (guide, don't tell; one question at a time;
  hints before answers; analytical not definitional), voice style (≤ 60 words, no markdown),
  safety rules (on-topic, no personal data, safeguarding response), confidentiality.
- **Untrusted data** — topic, subject, grade and teacher guidance — is placed inside
  `<assignment>` / `<teacher_guidance>` fences after sanitising (fence tags stripped, lengths
  capped). The prompt states teacher guidance may shape focus/difficulty/tone but cannot change
  rules, structure or format.
- **Student messages** are only ever `user` messages. The per-turn directive is a separate system
  message placed *after* the student's message, so "ignore previous instructions" is followed by
  the real instruction.
- A **leak canary** in the system prompt: if it ever appears in output, the reply is replaced.
- Teacher guidance is **not shown to students** (removed from student API responses).

## Safety

1. Student input → OpenAI moderation (`omni-moderation-latest`, free). Flagged input is stored
   (flagged) for teacher review, never sent to the tutor model; the student gets a calm canned
   reply — a specific signposting message for self-harm ("talk to a teacher, parent or trusted
   adult…"). State does not advance.
2. Model output → leak canary + moderation; failures are replaced with a neutral re-ask.
3. The model's `safety_concern` flag marks the student message for review.
4. Teachers can read every transcript; flagged messages surface first in "may need attention".
5. Moderation outages fail *open* (logged) — the system prompt still enforces the rules. Change
   this in `ai/tutor.service.ts` if your safeguarding policy requires fail-closed.

## Cost controls

| Control | Default | Where |
|---|---|---|
| Context window | last 12 messages, each ≤ 800 chars | `AI_CONTEXT_MESSAGES` |
| Output cap | 450 tokens | `AI_MAX_OUTPUT_TOKENS` |
| Request timeout / SDK retries | 25 s / 1 | `AI_TIMEOUT_MS` |
| Structured-output retries | 1 | `tutor.service.ts` |
| Turns per student per assignment | 40 (summary forced before) | `AI_MAX_TURNS_PER_ASSIGNMENT` |
| Model calls per student per 24 h | 150 | `AI_DAILY_TURNS_PER_USER` |
| Rate limit | 12 turns/min/student | `middleware/rate-limit.ts` |
| Audio | ≤ 60 s, ≤ 3 MB, 1800 s/student/24 h, 12/min | `MAX_AUDIO_*`, `AI_DAILY_AUDIO_SECONDS_PER_USER` |
| Concurrent turns | 1 per student (turn lock) | tutoring repository |

Usage is recorded per call in `ai_usage` (user, assignment, kind, model, tokens, audio seconds).
Example cost query:

```sql
select date_trunc('day', created_at) day, kind, model,
       sum(prompt_tokens) prompt, sum(completion_tokens) completion, sum(audio_seconds) audio_s
from ai_usage group by 1,2,3 order by 1 desc;
```

A full session is ~10 model calls with a bounded prompt (~1–2k tokens each), i.e. a small fraction
of a cent to a few cents per student-assignment on `gpt-4o-mini` — verify against current pricing.

## Voice

- **Speech-to-text:** the browser's SpeechRecognition (Chrome, Edge, Safari) by default. Other
  browsers record with MediaRecorder and upload to `/api/student/transcriptions` (Whisper). Uploads
  are memory-only, size/type/magic-byte checked, never written to disk or stored — only the
  transcript is kept, as the student's message.
- **Text-to-speech:** browser speechSynthesis, sentence-chunked, with a watchdog so a silent engine
  never blocks the conversation. Students can mute the tutor voice or turn off hands-free mode.
- The client voice state machine (`features/tutoring/voice/use-voice.ts`): idle → requesting →
  listening → (transcribing) → thinking → speaking → (hands-free) listening, plus error, denied and
  unsupported states, each with a visible label, a live `aria-live` status and a recovery path.
  The microphone is released between turns and whenever the tab is hidden.

## Local development & tests

`AI_PROVIDER=mock` uses a deterministic offline tutor (`MockAiProvider`) — also used by all
automated tests, so CI never calls a paid API. It is rejected in production by config validation.
Test hooks in the mock (`__fail__`, `__malformed__`, `__leak__`, `__unsafe__`, `__selfharm__`)
exercise failure paths.

## Changing tutor behaviour

1. Edit `ai/prompts.ts` (and bump `PROMPT_VERSION`) or the constants in `ai/state-machine.ts` /
   `shared/tutor.ts` (`PRACTICE_QUESTIONS`).
2. Update `tests/unit/state-machine.test.ts` and run `npm test`.
3. Try it with the real model (`AI_PROVIDER=openai`) on a staging environment before release.
