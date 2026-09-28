/**
 * Tutoring lifecycle shared by server and client.
 *
 * The server owns all transitions (server/ai/state-machine.ts). The client only
 * renders these values.
 */

export const TUTOR_STAGES = [
  "NOT_STARTED",
  "GREETING",
  "READINESS_CHECK",
  "KNOWLEDGE_CHECK",
  "GUIDED_PRACTICE",
  "SUMMARY",
  "READY_TO_COMPLETE",
  "COMPLETED",
] as const;
export type TutorStage = (typeof TUTOR_STAGES)[number];

/** Coarse status kept for analytics and backwards compatibility with the demo's data. */
export const PROGRESS_STATUSES = ["not_started", "in_progress", "summary_provided", "completed"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

/** Number of guided-practice (analytical) questions in a session. */
export const PRACTICE_QUESTIONS = 5;

export const ANSWER_ASSESSMENTS = ["correct", "partially_correct", "incorrect", "no_attempt", "not_applicable"] as const;
export type AnswerAssessment = (typeof ANSWER_ASSESSMENTS)[number];

export function statusForStage(stage: TutorStage): ProgressStatus {
  switch (stage) {
    case "NOT_STARTED":
      return "not_started";
    case "READY_TO_COMPLETE":
    case "SUMMARY":
      return "summary_provided";
    case "COMPLETED":
      return "completed";
    default:
      return "in_progress";
  }
}

export interface StageStep {
  key: "warmup" | "knowledge" | "practice" | "summary" | "complete";
  label: string;
}

/** Student-facing milestones (the fine-grained stages are grouped for clarity). */
export const STAGE_STEPS: StageStep[] = [
  { key: "warmup", label: "Warm-up" },
  { key: "knowledge", label: "What you know" },
  { key: "practice", label: "Practice" },
  { key: "summary", label: "Summary" },
  { key: "complete", label: "Complete" },
];

export function stepIndexForStage(stage: TutorStage): number {
  switch (stage) {
    case "NOT_STARTED":
    case "GREETING":
    case "READINESS_CHECK":
      return 0;
    case "KNOWLEDGE_CHECK":
      return 1;
    case "GUIDED_PRACTICE":
      return 2;
    case "SUMMARY":
    case "READY_TO_COMPLETE":
      return 3;
    case "COMPLETED":
      return 4;
  }
}
