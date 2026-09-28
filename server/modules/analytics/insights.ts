import type { Insight } from "@shared/api";

/**
 * Explainable "may need attention" signals. Each signal is a simple rule over stored data and
 * carries the evidence behind it, so teachers can judge for themselves. Nothing here labels a
 * student; the UI phrases these as "may need attention".
 *
 * Definitions (also documented in docs/ARCHITECTURE.md → Analytics):
 * - hints:        tutor gave hints on ≥ HINT_THRESHOLD questions in this assignment
 * - incorrect:    tutor assessed ≥ INCORRECT_THRESHOLD answers as incorrect
 * - flagged:      at least one message was blocked by the safety filter
 * - stalled:      started, not completed, and no activity for ≥ STALLED_DAYS days
 * - long_session: active time well above the class median for the assignment
 */
export const HINT_THRESHOLD = 3;
export const INCORRECT_THRESHOLD = 3;
export const STALLED_DAYS = 3;
export const LONG_SESSION_MIN_SECONDS = 20 * 60;
export const LONG_SESSION_FALLBACK_SECONDS = 45 * 60;
export const NOT_STARTED_DAYS = 3;

export interface InsightInput {
  status: string;
  hintCount: number;
  incorrectCount: number;
  flaggedCount: number;
  totalTimeSpent: number;
  lastActiveAt: Date | null;
}

const DAY = 24 * 60 * 60 * 1000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Threshold above which a session counts as unusually long, given started students' times. */
export function longSessionThreshold(startedTimes: number[]): number {
  const m = startedTimes.length >= 3 ? median(startedTimes) : null;
  return m === null ? LONG_SESSION_FALLBACK_SECONDS : Math.max(2 * m, LONG_SESSION_MIN_SECONDS);
}

const minutes = (s: number) => Math.max(1, Math.round(s / 60));

export function computeInsights(row: InsightInput, longThreshold: number, now = new Date()): Insight[] {
  const out: Insight[] = [];
  if (row.status === "not_started") return out;

  if (row.flaggedCount > 0) {
    out.push({
      signal: "flagged",
      evidence: `${row.flaggedCount} message${row.flaggedCount === 1 ? " was" : "s were"} held by the safety filter — please review the conversation`,
    });
  }
  if (row.hintCount >= HINT_THRESHOLD) {
    out.push({ signal: "hints", evidence: `Needed hints on ${row.hintCount} questions` });
  }
  if (row.incorrectCount >= INCORRECT_THRESHOLD) {
    out.push({ signal: "incorrect", evidence: `The tutor assessed ${row.incorrectCount} answers as incorrect` });
  }
  if (row.status !== "completed" && row.lastActiveAt && now.getTime() - row.lastActiveAt.getTime() >= STALLED_DAYS * DAY) {
    const days = Math.floor((now.getTime() - row.lastActiveAt.getTime()) / DAY);
    out.push({ signal: "stalled", evidence: `Started but no activity for ${days} days` });
  }
  if (row.totalTimeSpent > longThreshold) {
    out.push({
      signal: "long_session",
      evidence: `Spent ${minutes(row.totalTimeSpent)} min, well above the class typical time`,
    });
  }
  return out;
}

export function notStartedInsight(releaseAt: Date, now = new Date()): Insight | null {
  const days = Math.floor((now.getTime() - releaseAt.getTime()) / DAY);
  return days >= NOT_STARTED_DAYS ? { signal: "not_started", evidence: `Not started ${days} days after release` } : null;
}
