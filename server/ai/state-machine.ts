import { PRACTICE_QUESTIONS, statusForStage, type ProgressStatus, type TutorStage } from "@shared/tutor";
import type { TutorOutput } from "./schemas";

/**
 * Server-side tutoring state machine.
 *
 *   NOT_STARTED ─start→ GREETING ─reply→ READINESS_CHECK ─ready→ KNOWLEDGE_CHECK
 *        → GUIDED_PRACTICE (PRACTICE_QUESTIONS analytical questions, hints allowed)
 *        → SUMMARY (one message) → READY_TO_COMPLETE ─complete→ COMPLETED
 *
 * The persisted `stage` is the stage of the question the tutor last asked (i.e. what the
 * student is currently answering). `planTurn` decides what the next tutor message must do;
 * `applyTurn` folds the validated model output into the next state. Both are pure.
 */

export const MAX_READINESS_RETRIES = 3;
/** Off-task replies (small talk, "can you hear me") tolerated before the prior-knowledge step moves on. */
export const MAX_OFF_TASK_TURNS = 3;
export const MAX_HINTS_PER_QUESTION = 2;
export const MAX_REVIEW_TURNS = 3;

export interface TutorState {
  stage: TutorStage;
  stageTurns: number;
  practiceCompleted: number;
  /** Student messages sent so far in this assignment. */
  messageCount: number;
}

export type TurnKind = "readiness" | "knowledge" | "practice" | "summary" | "review";

export interface TurnPlan {
  kind: TurnKind;
  from: TutorStage;
  /** Practice question the student is currently answering (1-based), when in practice. */
  currentQuestion: number | null;
  /** Practice question to ask next if advancing. */
  nextQuestion: number | null;
  totalQuestions: number;
  allowHint: boolean;
  allowNotReady: boolean;
  /** True when the summary is forced early because the session hit its turn budget. */
  forcedSummary: boolean;
  /** Whether an off-task reply keeps the student on the same step (instead of moving on). */
  allowOffTask: boolean;
  /** The summary already given (review turns), so the tutor can repeat it accurately. */
  summaryText?: string | null;
}

export type PlanResult = { ok: true; plan: TurnPlan } | { ok: false; reason: "completed" | "session_finished" | "turn_limit" };

export function planTurn(state: TutorState, maxTurns: number, totalQuestions = PRACTICE_QUESTIONS): PlanResult {
  const base = {
    from: state.stage,
    currentQuestion: null,
    nextQuestion: null,
    totalQuestions,
    allowHint: false,
    allowNotReady: false,
    forcedSummary: false,
    allowOffTask: false,
  };

  if (state.stage === "COMPLETED") return { ok: false, reason: "completed" };
  if (state.messageCount >= maxTurns) return { ok: false, reason: "turn_limit" };

  switch (state.stage) {
    case "NOT_STARTED":
    case "GREETING":
      return { ok: true, plan: { ...base, kind: "readiness" } };
    case "READINESS_CHECK":
      return {
        ok: true,
        plan: {
          ...base,
          kind: "knowledge",
          allowNotReady: state.stageTurns < MAX_READINESS_RETRIES,
          allowOffTask: state.stageTurns < MAX_READINESS_RETRIES,
        },
      };
    case "KNOWLEDGE_CHECK":
      return { ok: true, plan: { ...base, kind: "practice", nextQuestion: 1, allowOffTask: state.stageTurns < MAX_OFF_TASK_TURNS } };
    case "GUIDED_PRACTICE": {
      const current = Math.min(state.practiceCompleted + 1, totalQuestions);
      // Leave room for the summary before the per-assignment turn cap.
      const forced = state.messageCount + 1 >= maxTurns - 1;
      const last = current >= totalQuestions;
      return {
        ok: true,
        plan: {
          ...base,
          kind: last || forced ? "summary" : "practice",
          currentQuestion: current,
          nextQuestion: last || forced ? null : current + 1,
          allowHint: !forced && state.stageTurns < MAX_HINTS_PER_QUESTION,
          forcedSummary: forced && !last,
          // Near the turn budget the session must wrap up, whatever the student says.
          allowOffTask: !forced,
        },
      };
    }
    case "SUMMARY":
    case "READY_TO_COMPLETE":
      if (state.stageTurns >= MAX_REVIEW_TURNS) return { ok: false, reason: "session_finished" };
      return { ok: true, plan: { ...base, kind: "review" } };
  }
}

export interface TurnOutcome {
  stage: TutorStage;
  status: ProgressStatus;
  stageTurns: number;
  practiceCompleted: number;
  hintDelta: number;
  correctDelta: number;
  incorrectDelta: number;
  /** Stage label stored on the tutor's message. */
  messageStage: TutorStage;
  summary: string | null;
  /** The tutor message to store and show (the summary turn appends the summary). */
  message: string;
  /** What the server actually did (model suggestions outside the plan are ignored). */
  appliedStep: TutorOutput["next_step"] | "stay";
}

/** Composes the summary turn's message: feedback, then the summary, then the next action. */
export function summaryMessage(feedback: string, summary: string): string {
  return `${feedback.trim()} Here's a summary of what we covered: ${summary.trim()} When you're ready, press Complete to hand in your homework.`;
}

export function applyTurn(state: TutorState, plan: TurnPlan, output: TutorOutput): TurnOutcome {
  const wantsHint = output.next_step === "hint" && plan.allowHint;
  // Progress only moves when the student actually answered (not for "hi" or "can you hear me").
  const offTask = !output.on_task && plan.allowOffTask;
  const graded = plan.kind === "practice" || plan.kind === "summary";
  const answering = graded && plan.from === "GUIDED_PRACTICE" && !offTask;
  const correctDelta = answering && (output.assessment === "correct" || output.assessment === "partially_correct") ? 1 : 0;
  const incorrectDelta = answering && output.assessment === "incorrect" ? 1 : 0;

  const outcome = (stage: TutorStage, rest: Partial<TurnOutcome>): TurnOutcome => ({
    stage,
    status: statusForStage(stage),
    stageTurns: 0,
    practiceCompleted: state.practiceCompleted,
    hintDelta: 0,
    correctDelta,
    incorrectDelta,
    messageStage: stage,
    summary: null,
    message: output.message,
    appliedStep: "advance",
    ...rest,
  });
  const stay = (stage: TutorStage, stageTurns: number) => outcome(stage, { stageTurns, appliedStep: "stay" });

  switch (plan.kind) {
    case "readiness":
      return outcome("READINESS_CHECK", {});

    case "knowledge":
      if (plan.allowNotReady && (output.next_step === "wait_for_readiness" || !output.on_task)) {
        return outcome("READINESS_CHECK", { stageTurns: state.stageTurns + 1, appliedStep: "wait_for_readiness" });
      }
      return outcome("KNOWLEDGE_CHECK", {});

    case "practice":
      if (plan.from === "KNOWLEDGE_CHECK") {
        if (offTask) return stay("KNOWLEDGE_CHECK", state.stageTurns + 1);
        return outcome("GUIDED_PRACTICE", { practiceCompleted: 0 });
      }
      // Same question; the hint budget is untouched by small talk.
      if (offTask) return stay("GUIDED_PRACTICE", state.stageTurns);
      if (wantsHint) {
        return outcome("GUIDED_PRACTICE", { stageTurns: state.stageTurns + 1, hintDelta: 1, appliedStep: "hint" });
      }
      return outcome("GUIDED_PRACTICE", { practiceCompleted: plan.currentQuestion ?? state.practiceCompleted + 1 });

    case "summary": {
      if (offTask) return stay("GUIDED_PRACTICE", state.stageTurns);
      if (wantsHint) {
        return outcome("GUIDED_PRACTICE", { stageTurns: state.stageTurns + 1, hintDelta: 1, appliedStep: "hint" });
      }
      // tutor.service guarantees a summary on this path (it re-asks the model otherwise).
      const summary = output.summary?.trim() || output.message;
      return outcome("READY_TO_COMPLETE", {
        practiceCompleted: plan.forcedSummary ? state.practiceCompleted : plan.totalQuestions,
        messageStage: "SUMMARY",
        summary,
        message: output.summary?.trim() ? summaryMessage(output.message, summary) : output.message,
      });
    }

    case "review":
      return outcome("READY_TO_COMPLETE", { stageTurns: state.stageTurns + 1 });
  }
}
