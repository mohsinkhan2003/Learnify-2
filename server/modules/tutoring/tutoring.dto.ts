import type { ChatMessage, StudentProgress } from "@shared/schema";
import type { ChatMessageDto, StudentProgressDto } from "@shared/api";
import { PRACTICE_QUESTIONS, type AnswerAssessment, type ProgressStatus, type TutorStage } from "@shared/tutor";
import { toIso } from "../../lib/http";

export function toChatMessageDto(m: ChatMessage): ChatMessageDto {
  return {
    id: m.id,
    role: m.role === "ai" ? "ai" : "student",
    content: m.content,
    stage: (m.stage as TutorStage | null) ?? null,
    source: m.source === "voice" ? "voice" : m.source === "text" ? "text" : null,
    assessment: (m.assessment as AnswerAssessment | null) ?? null,
    misconception: m.misconception,
    flagged: m.flagged,
    createdAt: m.timestamp.toISOString(),
  };
}

export function toProgressDto(p: StudentProgress | undefined | null): StudentProgressDto {
  if (!p) {
    return {
      status: "not_started",
      tutorStage: "NOT_STARTED",
      practiceCompleted: 0,
      practiceTotal: PRACTICE_QUESTIONS,
      totalTimeSeconds: 0,
      messageCount: 0,
      canComplete: false,
      completedAt: null,
      summary: null,
    };
  }
  return {
    status: p.status as ProgressStatus,
    tutorStage: p.tutorStage as TutorStage,
    practiceCompleted: Math.min(p.practiceCompleted, PRACTICE_QUESTIONS),
    practiceTotal: PRACTICE_QUESTIONS,
    totalTimeSeconds: p.totalTimeSpent,
    messageCount: p.messageCount,
    canComplete: p.tutorStage === "READY_TO_COMPLETE",
    completedAt: toIso(p.completedAt),
    summary: p.summary,
  };
}
