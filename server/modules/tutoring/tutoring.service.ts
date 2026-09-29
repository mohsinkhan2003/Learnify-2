import type { Assignment, User } from "@shared/schema";
import type { SendMessageInput, StudentAssignmentListItem, TutorSessionDto, TutorTurnResult } from "@shared/api";
import type { TutorStage } from "@shared/tutor";
import { config } from "../../config/env";
import { db } from "../../db";
import { AppError, conflict, isUniqueViolation, notFound, tooManyRequests } from "../../lib/errors";
import { canStudentAccessAssignment } from "../../policies/assignment-access";
import { assignmentsRepository } from "../assignments/assignments.repository";
import { classesRepository } from "../classes/classes.repository";
import { toStudentAssignmentDto } from "../assignments/assignments.dto";
import { greetingMessage } from "../../ai/prompts";
import { applyTurn, planTurn } from "../../ai/state-machine";
import { runTutorTurn } from "../../ai/tutor.service";
import { chatCallsLast24h } from "../../ai/usage";
import { tutoringRepository } from "./tutoring.repository";
import { toChatMessageDto, toProgressDto } from "./tutoring.dto";

export const MAX_MESSAGE_LENGTH = 2000;

/** Loads an assignment the student may access. Anything else is a 404 (no existence leak). */
export async function loadStudentAssignment(student: User, id: string): Promise<Assignment> {
  const assignment = await assignmentsRepository.findById(id);
  if (!assignment) throw notFound("Assignment not found", "ASSIGNMENT_NOT_FOUND");
  const [isRecipient, isClassMember] = await Promise.all([
    assignment.audience === "selected" ? assignmentsRepository.isRecipient(id, student.id) : false,
    assignment.classId ? classesRepository.isMember(assignment.classId, student.id) : false,
  ]);
  if (!canStudentAccessAssignment(student, assignment, { isRecipient, isClassMember })) {
    throw notFound("Assignment not found", "ASSIGNMENT_NOT_FOUND");
  }
  return assignment;
}

async function startSession(student: User, assignment: Assignment): Promise<void> {
  await tutoringRepository.ensureProgress(assignment.id, student.id);
  await db.transaction(async (tx) => {
    const won = await tutoringRepository.beginSession(assignment.id, student.id, tx);
    if (won) {
      await tutoringRepository.insertMessage(
        { assignmentId: assignment.id, userId: student.id, role: "ai", content: greetingMessage(student.name), stage: "GREETING" },
        tx,
      );
    }
  });
}

const refusal = {
  completed: () => conflict("You've already completed this assignment.", "ASSIGNMENT_COMPLETED"),
  session_finished: () => conflict("You've finished this session — press Complete to hand it in.", "SESSION_FINISHED"),
  turn_limit: () =>
    new AppError(
      429,
      "TURN_LIMIT",
      "You've reached the message limit for this assignment. Please press Complete or ask your teacher for help.",
    ),
};

export const tutoringService = {
  async listForStudent(student: User): Promise<StudentAssignmentListItem[]> {
    const rows = await assignmentsRepository.listVisibleForStudent(student);
    const names = await assignmentsRepository.classNames(rows.map((r) => r.assignment));
    return rows.map(({ assignment, progress }) => ({
      ...toStudentAssignmentDto(assignment, assignment.classId ? (names.get(assignment.classId) ?? null) : null),
      progress: progress ? toProgressDto(progress) : null,
    }));
  },

  async getSession(student: User, assignmentId: string): Promise<TutorSessionDto> {
    const assignment = await loadStudentAssignment(student, assignmentId);
    const [progress, messages] = await Promise.all([
      tutoringRepository.getProgress(assignment.id, student.id),
      tutoringRepository.listConversation(assignment.id, student.id),
    ]);
    return {
      assignment: toStudentAssignmentDto(assignment),
      progress: toProgressDto(progress),
      messages: messages.map(toChatMessageDto),
      limits: {
        maxMessageLength: MAX_MESSAGE_LENGTH,
        maxAudioSeconds: config.ai.maxAudioSeconds,
        transcriptionEnabled: config.ai.transcriptionEnabled,
      },
    };
  },

  async start(student: User, assignmentId: string): Promise<TutorSessionDto> {
    const assignment = await loadStudentAssignment(student, assignmentId);
    await startSession(student, assignment);
    return this.getSession(student, assignmentId);
  },

  async sendMessage(student: User, assignmentId: string, input: SendMessageInput): Promise<TutorTurnResult> {
    const assignment = await loadStudentAssignment(student, assignmentId);

    // Idempotent retries: the same clientMessageId returns the already-stored exchange.
    const replay = async (): Promise<TutorTurnResult | null> => {
      const existing = await tutoringRepository.findByClientMessageId(student.id, input.clientMessageId);
      if (!existing || existing.assignmentId !== assignment.id) return null;
      const reply = await tutoringRepository.findReplyAfter(existing);
      const progress = await tutoringRepository.getProgress(assignment.id, student.id);
      if (!reply) throw conflict("Your previous message is still being answered.", "TURN_IN_PROGRESS");
      return { studentMessage: toChatMessageDto(existing), tutorMessage: toChatMessageDto(reply), progress: toProgressDto(progress) };
    };
    const previous = await replay();
    if (previous) return previous;

    const current = await tutoringRepository.getProgress(assignment.id, student.id);
    if (!current || current.tutorStage === "NOT_STARTED") await startSession(student, assignment);

    if ((await chatCallsLast24h(student.id)) >= config.ai.dailyTurnsPerUser) {
      throw tooManyRequests("You've reached today's tutoring limit. Please come back tomorrow.", "DAILY_LIMIT");
    }

    const locked = await tutoringRepository.claimTurnLock(assignment.id, student.id);
    if (!locked) throw conflict("The tutor is still answering your last message.", "TURN_IN_PROGRESS");

    let committed = false;
    try {
      const state = {
        stage: locked.tutorStage as TutorStage,
        stageTurns: locked.stageTurns,
        practiceCompleted: locked.practiceCompleted,
        messageCount: locked.messageCount,
      };
      const planned = planTurn(state, config.ai.maxTurnsPerAssignment);
      if (!planned.ok) throw refusal[planned.reason]();
      const plan = { ...planned.plan, summaryText: locked.summary };

      const history = await tutoringRepository.listConversation(assignment.id, student.id, config.ai.contextMessages);
      const result = await runTutorTurn({ userId: student.id, assignment, history, studentMessage: input.content, plan });

      // Explicit timestamps keep student → tutor ordering stable within one transaction.
      const studentAt = new Date();
      const tutorAt = new Date(studentAt.getTime() + 1);

      const saved = await db.transaction(async (tx) => {
        const safetyConcern = result.kind === "ok" ? result.output.safety_concern : result.kind === "input_flagged";
        const studentMessage = await tutoringRepository.insertMessage(
          {
            assignmentId: assignment.id,
            userId: student.id,
            role: "student",
            content: input.content,
            stage: state.stage,
            source: input.source,
            clientMessageId: input.clientMessageId,
            flagged: safetyConcern,
            timestamp: studentAt,
          },
          tx,
        );

        if (result.kind === "ok") {
          const outcome = applyTurn(state, plan, result.output);
          const tutorMessage = await tutoringRepository.insertMessage(
            {
              assignmentId: assignment.id,
              userId: student.id,
              role: "ai",
              content: outcome.message,
              stage: outcome.messageStage,
              assessment: result.output.assessment,
              misconception: result.output.misconception,
              timestamp: tutorAt,
            },
            tx,
          );
          const progress = await tutoringRepository.updateProgress(
            assignment.id,
            student.id,
            {
              tutorStage: outcome.stage,
              status: outcome.status,
              stageTurns: outcome.stageTurns,
              practiceCompleted: outcome.practiceCompleted,
              hintCount: locked.hintCount + outcome.hintDelta,
              correctCount: locked.correctCount + outcome.correctDelta,
              incorrectCount: locked.incorrectCount + outcome.incorrectDelta,
              flaggedCount: locked.flaggedCount + (safetyConcern ? 1 : 0),
              messageCount: locked.messageCount + 1,
              summary: outcome.summary ?? locked.summary,
              lastActiveAt: tutorAt,
              turnLockedAt: null,
            },
            tx,
          );
          return { studentMessage, tutorMessage, progress };
        }

        // Safety fallback: canned reply, state unchanged (the student re-answers the same question).
        const tutorMessage = await tutoringRepository.insertMessage(
          { assignmentId: assignment.id, userId: student.id, role: "ai", content: result.reply, stage: state.stage, timestamp: tutorAt },
          tx,
        );
        const progress = await tutoringRepository.updateProgress(
          assignment.id,
          student.id,
          {
            messageCount: locked.messageCount + 1,
            flaggedCount: locked.flaggedCount + (safetyConcern ? 1 : 0),
            lastActiveAt: tutorAt,
            turnLockedAt: null,
          },
          tx,
        );
        return { studentMessage, tutorMessage, progress };
      });
      committed = true;

      return {
        studentMessage: toChatMessageDto(saved.studentMessage),
        tutorMessage: toChatMessageDto(saved.tutorMessage),
        progress: toProgressDto(saved.progress),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await replay();
        if (again) return again;
      }
      throw error;
    } finally {
      if (!committed) await tutoringRepository.releaseTurnLock(assignment.id, student.id);
    }
  },

  async heartbeat(student: User, assignmentId: string) {
    const assignment = await loadStudentAssignment(student, assignmentId);
    const progress = await tutoringRepository.heartbeat(assignment.id, student.id);
    return { totalTimeSeconds: progress?.totalTimeSpent ?? null };
  },

  async complete(student: User, assignmentId: string) {
    const assignment = await loadStudentAssignment(student, assignmentId);
    const done = await tutoringRepository.complete(assignment.id, student.id);
    if (done) return toProgressDto(done);

    const current = await tutoringRepository.getProgress(assignment.id, student.id);
    if (current?.tutorStage === "COMPLETED") return toProgressDto(current); // idempotent
    throw conflict("Finish the session with your tutor before completing.", "NOT_READY_TO_COMPLETE");
  },
};
