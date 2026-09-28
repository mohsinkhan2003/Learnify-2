import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
const { buildSystemPrompt, isSummaryMessage, SUMMARY_STAGE } = await import("./tutor");

const assignment = {
  id: "00000000-0000-0000-0000-000000000000",
  teacherId: null,
  studentId: null,
  topic: "Photosynthesis",
  grade: "10th",
  subject: "Biology",
  teacherName: "T",
  teacherSchool: "S",
  instructions: "Focus on the light-dependent reactions.",
  notificationTime: new Date(),
  notificationSent: "false",
  createdAt: new Date(),
};

describe("buildSystemPrompt", () => {
  it("includes the topic, subject and teacher instructions", () => {
    const prompt = buildSystemPrompt(assignment, 0);
    expect(prompt).toContain('"Photosynthesis"');
    expect(prompt).toContain("GCSE/AQA Biology");
    expect(prompt).toContain("Focus on the light-dependent reactions.");
  });

  it("tracks the stage from the AI message count and caps it at the summary stage", () => {
    expect(buildSystemPrompt(assignment, 0)).toContain("currently at Stage 1");
    expect(buildSystemPrompt(assignment, 3)).toContain("currently at Stage 4");
    expect(buildSystemPrompt(assignment, 20)).toContain(`currently at Stage ${SUMMARY_STAGE}`);
  });
});

describe("isSummaryMessage", () => {
  it("ignores encouraging phrases before the summary stage", () => {
    expect(isSummaryMessage("Great job! Overall, well done.", 2)).toBe(false);
    expect(isSummaryMessage("Here's a summary of what we covered", 3)).toBe(false);
  });

  it("detects the summary at the final stage", () => {
    expect(isSummaryMessage("Excellent work! Here's a summary of what we covered: ...", SUMMARY_STAGE - 1)).toBe(true);
    expect(isSummaryMessage("In conclusion, plants convert light to energy.", SUMMARY_STAGE + 2)).toBe(true);
  });

  it("does not flag a non-summary reply at the final stage", () => {
    expect(isSummaryMessage("Could you explain that a bit more?", SUMMARY_STAGE - 1)).toBe(false);
  });
});
