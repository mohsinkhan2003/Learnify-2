import type { User, Assignment } from "@shared/schema";
import type { CreateAssignmentInput, TeacherAssignmentDetail } from "@shared/api";
import { db } from "../../db";
import { badRequest, notFound } from "../../lib/errors";
import { canManageAssignment } from "../../policies/assignment-access";
import { analyticsService } from "../analytics/analytics.service";
import { notStartedInsight } from "../analytics/insights";
import { notifyAssignmentReleased } from "../../notifications/push.service";
import { assignmentsRepository } from "./assignments.repository";
import { toAssignmentDto } from "./assignments.dto";
import { logger } from "../../lib/logger";

const NOT_STARTED_LIST_LIMIT = 100;

/** Loads an assignment the teacher owns. Others' assignments return 404 (no existence leak). */
export async function loadOwnedAssignment(teacher: User, id: string): Promise<Assignment> {
  const assignment = await assignmentsRepository.findById(id);
  if (!assignment || !canManageAssignment(teacher, assignment)) throw notFound("Assignment not found", "ASSIGNMENT_NOT_FOUND");
  return assignment;
}

export const assignmentsService = {
  async create(teacher: User, input: CreateAssignmentInput) {
    const releaseAt = new Date(input.releaseAt);
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && dueAt <= releaseAt) throw badRequest("The due date must be after the release time", undefined, "INVALID_DUE_DATE");

    let recipients: string[] = [];
    if (input.audience === "selected") {
      const requested = [...new Set(input.studentIds ?? [])];
      recipients = await assignmentsRepository.filterStudentIdsAtSchool(teacher.school, requested);
      // Every selected id must be a student at the teacher's school — never trust the client's list.
      if (recipients.length === 0 || recipients.length !== requested.length) {
        throw badRequest("Please choose students from your school", undefined, "INVALID_RECIPIENTS");
      }
    }

    const assignment = await db.transaction(async (tx) => {
      const created = await assignmentsRepository.create(
        {
          teacherId: teacher.id,
          teacherName: teacher.name,
          teacherSchool: teacher.school,
          topic: input.topic,
          subject: input.subject,
          grade: input.grade,
          instructions: input.instructions,
          notificationTime: releaseAt,
          dueAt,
          audience: input.audience,
        },
        tx,
      );
      await assignmentsRepository.addRecipients(created.id, recipients, tx);
      return created;
    });

    if (releaseAt <= new Date()) {
      // Fire-and-forget: the scheduler retries anything this misses (claims are idempotent).
      notifyAssignmentReleased(assignment.id).catch((err) => logger.error({ err }, "Immediate notification failed"));
    }
    return toAssignmentDto(assignment);
  },

  async detail(teacher: User, id: string): Promise<TeacherAssignmentDetail> {
    const assignment = await loadOwnedAssignment(teacher, id);
    const [{ rows, stats }] = await analyticsService.statsFor(teacher, [assignment]);
    const recipients = assignment.audience === "selected" ? await assignmentsRepository.recipients(assignment.id) : [];

    // Students in the audience who have not opened the assignment yet.
    const startedIds = new Set(rows.filter((r) => r.status !== "not_started").map((r) => r.studentId));
    const audience =
      assignment.audience === "selected"
        ? recipients
        : await assignmentsRepository.studentsAtSchool(assignment.teacherSchool, { limit: 1000, offset: 0 });
    const notStartedAll = audience.filter((s) => !startedIds.has(s.id));
    const signal = notStartedInsight(assignment.notificationTime);

    rows.sort((a, b) => b.insights.length - a.insights.length || a.studentName.localeCompare(b.studentName));
    return {
      assignment: toAssignmentDto(assignment),
      stats,
      progress: rows.filter((r) => r.status !== "not_started"),
      notStarted: notStartedAll.slice(0, NOT_STARTED_LIST_LIMIT).map((s) => ({ studentId: s.id, studentName: s.name })),
      notStartedTotal: Math.max(stats.eligible - stats.started, notStartedAll.length),
      recipients,
      notStartedNote: signal?.evidence ?? null,
    };
  },

  async setArchived(teacher: User, id: string, archived: boolean) {
    await loadOwnedAssignment(teacher, id);
    return toAssignmentDto(await assignmentsRepository.setArchived(id, archived ? new Date() : null));
  },
};
