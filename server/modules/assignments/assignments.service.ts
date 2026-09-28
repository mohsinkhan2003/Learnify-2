import type { User, Assignment } from "@shared/schema";
import type { AssignmentDto, CreateAssignmentInput, TeacherAssignmentDetail, UpdateAssignmentInput } from "@shared/api";
import { db } from "../../db";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { canManageAssignment } from "../../policies/assignment-access";
import { analyticsService } from "../analytics/analytics.service";
import { notStartedInsight } from "../analytics/insights";
import { notifyAssignmentReleased } from "../../notifications/push.service";
import { classesRepository } from "../classes/classes.repository";
import { loadOwnedClass } from "../classes/classes.service";
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

async function dto(a: Assignment): Promise<AssignmentDto> {
  const names = await assignmentsRepository.classNames([a]);
  return toAssignmentDto(a, a.classId ? (names.get(a.classId) ?? null) : null);
}

/** Students in an assignment's audience (bounded), for the not-started list. */
async function audienceOf(a: Assignment, recipients: { id: string; name: string }[]) {
  if (a.audience === "selected") return recipients;
  if (a.audience === "class" && a.classId) return classesRepository.members(a.classId);
  return assignmentsRepository.studentsAtSchool(a.teacherSchool, { limit: 1000, offset: 0 });
}

export const assignmentsService = {
  async create(teacher: User, input: CreateAssignmentInput) {
    const releaseAt = new Date(input.releaseAt);
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && dueAt <= releaseAt) throw badRequest("The due date must be after the release time", undefined, "INVALID_DUE_DATE");

    // The class must belong to this teacher; any selected students must be members of it.
    const cls = await loadOwnedClass(teacher, input.classId);
    if (cls.archivedAt) throw badRequest("That class is archived", undefined, "CLASS_ARCHIVED");

    let recipients: string[] = [];
    if (input.audience === "selected") {
      const requested = [...new Set(input.studentIds ?? [])];
      recipients = await classesRepository.filterMembers(cls.id, requested);
      if (recipients.length === 0 || recipients.length !== requested.length) {
        throw badRequest("Please choose students from this class", undefined, "INVALID_RECIPIENTS");
      }
    }

    const assignment = await db.transaction(async (tx) => {
      const created = await assignmentsRepository.create(
        {
          teacherId: teacher.id,
          teacherName: teacher.name,
          teacherSchool: teacher.school,
          classId: cls.id,
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
    return toAssignmentDto(assignment, cls.name);
  },

  /**
   * Edits content and dates. The release time can only move while the assignment is still
   * scheduled (students haven't seen it); moving it resets the pending notification.
   * Content edits apply to future tutor turns of students who already started.
   */
  async update(teacher: User, id: string, input: UpdateAssignmentInput): Promise<AssignmentDto> {
    const current = await loadOwnedAssignment(teacher, id);
    const now = new Date();
    const values: Partial<Assignment> = {};

    if (input.topic !== undefined) values.topic = input.topic;
    if (input.subject !== undefined) values.subject = input.subject;
    if (input.grade !== undefined) values.grade = input.grade;
    if (input.instructions !== undefined) values.instructions = input.instructions;

    let releaseAt = current.notificationTime;
    if (input.releaseAt !== undefined) {
      if (current.notificationTime <= now) {
        throw conflict("This assignment is already released, so its release time can't change.", "ALREADY_RELEASED");
      }
      releaseAt = new Date(Math.max(new Date(input.releaseAt).getTime(), now.getTime() - 60_000));
      values.notificationTime = releaseAt;
      values.notificationSent = false;
    }
    if (input.dueAt !== undefined) values.dueAt = input.dueAt ? new Date(input.dueAt) : null;
    const dueAt = values.dueAt !== undefined ? values.dueAt : current.dueAt;
    if (dueAt && dueAt <= releaseAt) throw badRequest("The due date must be after the release time", undefined, "INVALID_DUE_DATE");

    const updated = Object.keys(values).length ? await assignmentsRepository.update(id, values) : current;
    if (values.notificationTime && releaseAt <= now) {
      notifyAssignmentReleased(id).catch((err) => logger.error({ err }, "Immediate notification failed"));
    }
    return dto(updated);
  },

  async detail(teacher: User, id: string): Promise<TeacherAssignmentDetail> {
    const assignment = await loadOwnedAssignment(teacher, id);
    const [{ rows, stats }] = await analyticsService.statsFor(teacher, [assignment]);
    const recipients = assignment.audience === "selected" ? await assignmentsRepository.recipients(assignment.id) : [];

    // Students in the audience who have not opened the assignment yet.
    const startedIds = new Set(rows.filter((r) => r.status !== "not_started").map((r) => r.studentId));
    const audience = await audienceOf(assignment, recipients);
    const notStartedAll = audience.filter((s) => !startedIds.has(s.id));
    const signal = notStartedInsight(assignment.notificationTime);

    rows.sort((a, b) => b.insights.length - a.insights.length || a.studentName.localeCompare(b.studentName));
    return {
      assignment: await dto(assignment),
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
    return dto(await assignmentsRepository.setArchived(id, archived ? new Date() : null));
  },
};
