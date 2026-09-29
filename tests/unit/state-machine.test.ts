import { describe, expect, it } from "vitest";
import {
  applyTurn,
  MAX_HINTS_PER_QUESTION,
  MAX_OFF_TASK_TURNS,
  MAX_READINESS_RETRIES,
  MAX_REVIEW_TURNS,
  planTurn,
  type TutorState,
} from "../../server/ai/state-machine";
import type { TutorOutput } from "../../server/ai/schemas";

const MAX = 40;
const N = 5;
const out = (o: Partial<TutorOutput> = {}): TutorOutput => ({
  message: "ok",
  next_step: "advance",
  assessment: "correct",
  misconception: null,
  safety_concern: false,
  on_task: true,
  summary: null,
  ...o,
});
const state = (s: Partial<TutorState>): TutorState => ({ stage: "GREETING", stageTurns: 0, practiceCompleted: 0, messageCount: 0, ...s });

function step(s: TutorState, o: TutorOutput = out()) {
  const p = planTurn(s, MAX, N);
  if (!p.ok) throw new Error(p.reason);
  const r = applyTurn(s, p.plan, o);
  return {
    plan: p.plan,
    r,
    next: state({ stage: r.stage, stageTurns: r.stageTurns, practiceCompleted: r.practiceCompleted, messageCount: s.messageCount + 1 }),
  };
}

describe("tutor state machine", () => {
  it("follows greeting → readiness → knowledge → practice → summary", () => {
    let s = state({});
    const stages: string[] = [];
    for (let i = 0; i < 3 + N; i++) {
      const { r, next } = step(s, out({ summary: "We covered the key ideas, a real-world link and your reasoning." }));
      stages.push(r.messageStage);
      s = next;
    }
    expect(stages).toEqual([
      "READINESS_CHECK",
      "KNOWLEDGE_CHECK",
      "GUIDED_PRACTICE",
      "GUIDED_PRACTICE",
      "GUIDED_PRACTICE",
      "GUIDED_PRACTICE",
      "GUIDED_PRACTICE",
      "SUMMARY",
    ]);
    expect(s.stage).toBe("READY_TO_COMPLETE");
    expect(s.practiceCompleted).toBe(N);
  });

  it("stores the summary text and maps to summary_provided", () => {
    const { r } = step(
      state({ stage: "GUIDED_PRACTICE", practiceCompleted: N - 1 }),
      out({ message: "Nice work.", summary: "Plants make food." }),
    );
    expect(r).toMatchObject({ stage: "READY_TO_COMPLETE", status: "summary_provided", summary: "Plants make food." });
    // The stored message is the feedback, then the summary, then what to do next.
    expect(r.message).toBe(
      "Nice work. Here's a summary of what we covered: Plants make food. When you're ready, press Complete to hand in your homework.",
    );
  });

  it("ignores hint requests when hints are exhausted", () => {
    const s = state({ stage: "GUIDED_PRACTICE", stageTurns: MAX_HINTS_PER_QUESTION });
    const { r } = step(s, out({ next_step: "hint" }));
    expect(r.appliedStep).toBe("advance");
    expect(r.practiceCompleted).toBe(1);
  });

  it("applies hints within budget without advancing", () => {
    const { r } = step(state({ stage: "GUIDED_PRACTICE", practiceCompleted: 2 }), out({ next_step: "hint", assessment: "incorrect" }));
    expect(r).toMatchObject({ stage: "GUIDED_PRACTICE", practiceCompleted: 2, stageTurns: 1, hintDelta: 1, incorrectDelta: 1 });
  });

  it("bounds readiness retries", () => {
    const retry = step(state({ stage: "READINESS_CHECK" }), out({ next_step: "wait_for_readiness" }));
    expect(retry.r.stage).toBe("READINESS_CHECK");
    const forced = step(state({ stage: "READINESS_CHECK", stageTurns: MAX_READINESS_RETRIES }), out({ next_step: "wait_for_readiness" }));
    expect(forced.r.stage).toBe("KNOWLEDGE_CHECK");
  });

  it("ignores wait_for_readiness outside the readiness stage", () => {
    const { r } = step(state({ stage: "KNOWLEDGE_CHECK" }), out({ next_step: "wait_for_readiness" }));
    expect(r.stage).toBe("GUIDED_PRACTICE");
  });

  it("forces a summary before the per-assignment turn cap", () => {
    const p = planTurn(state({ stage: "GUIDED_PRACTICE", practiceCompleted: 1, messageCount: MAX - 2 }), MAX, N);
    expect(p.ok && p.plan).toMatchObject({ kind: "summary", forcedSummary: true, allowHint: false });
    expect(planTurn(state({ stage: "GUIDED_PRACTICE", messageCount: MAX }), MAX, N)).toEqual({ ok: false, reason: "turn_limit" });
  });

  it("allows bounded review after the summary and refuses after completion", () => {
    expect(planTurn(state({ stage: "READY_TO_COMPLETE", stageTurns: MAX_REVIEW_TURNS - 1 }), MAX, N).ok).toBe(true);
    expect(planTurn(state({ stage: "READY_TO_COMPLETE", stageTurns: MAX_REVIEW_TURNS }), MAX, N)).toEqual({
      ok: false,
      reason: "session_finished",
    });
    expect(planTurn(state({ stage: "COMPLETED" }), MAX, N)).toEqual({ ok: false, reason: "completed" });
  });

  it("only counts correctness for practice answers", () => {
    expect(step(state({ stage: "GREETING" }), out({ assessment: "incorrect" })).r.incorrectDelta).toBe(0);
    expect(step(state({ stage: "KNOWLEDGE_CHECK" }), out({ assessment: "incorrect" })).r.incorrectDelta).toBe(0);
    expect(step(state({ stage: "GUIDED_PRACTICE" }), out({ assessment: "incorrect" })).r.incorrectDelta).toBe(1);
  });

  describe("off-task replies (greetings, 'can you hear me')", () => {
    it("keep the student on the same practice question without using the hint budget", () => {
      const before = state({ stage: "GUIDED_PRACTICE", practiceCompleted: 2, stageTurns: 1 });
      const { r } = step(before, out({ on_task: false, assessment: "not_applicable" }));
      expect(r).toMatchObject({
        stage: "GUIDED_PRACTICE",
        practiceCompleted: 2,
        stageTurns: 1,
        hintDelta: 0,
        correctDelta: 0,
        appliedStep: "stay",
      });
    });

    it("do not produce the summary on the last question", () => {
      const { r } = step(state({ stage: "GUIDED_PRACTICE", practiceCompleted: N - 1 }), out({ on_task: false, summary: null }));
      expect(r).toMatchObject({ stage: "GUIDED_PRACTICE", summary: null, appliedStep: "stay" });
    });

    it("keep asking whether the student is ready, within the retry budget", () => {
      const { r } = step(state({ stage: "READINESS_CHECK" }), out({ on_task: false, assessment: "not_applicable" }));
      expect(r).toMatchObject({ stage: "READINESS_CHECK", stageTurns: 1 });
    });

    it("keep asking what the student knows, then move on after the off-task budget", () => {
      const { r } = step(state({ stage: "KNOWLEDGE_CHECK" }), out({ on_task: false }));
      expect(r).toMatchObject({ stage: "KNOWLEDGE_CHECK", stageTurns: 1 });
      const later = step(state({ stage: "KNOWLEDGE_CHECK", stageTurns: MAX_OFF_TASK_TURNS }), out({ on_task: false }));
      expect(later.r.stage).toBe("GUIDED_PRACTICE");
    });

    it("are ignored when the session must wrap up at the turn budget", () => {
      const s = state({ stage: "GUIDED_PRACTICE", practiceCompleted: 1, messageCount: MAX - 2 });
      const { plan, r } = step(s, out({ on_task: false, summary: "Wrap-up summary of the key ideas covered so far." }));
      expect(plan).toMatchObject({ kind: "summary", allowOffTask: false });
      expect(r.stage).toBe("READY_TO_COMPLETE");
    });
  });
});
