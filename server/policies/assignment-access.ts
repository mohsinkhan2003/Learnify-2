import { and, eq, exists, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { assignments, assignmentStudents, type Assignment, type User } from "@shared/schema";
import type { AssignmentStatus } from "@shared/api";

/**
 * Central authorization rules for assignments. Every route that touches an assignment goes
 * through these helpers (or the SQL twin below) — never ad-hoc role checks.
 *
 * - Teachers manage only assignments they created.
 * - Students see an assignment once it is released and not archived, and only if they are in
 *   its audience: everyone at the teacher's school ("school"), or listed recipients ("selected").
 *   Legacy demo assignments without a school remain visible to all students.
 */

export function assignmentStatus(a: Pick<Assignment, "archivedAt" | "notificationTime">, now = new Date()): AssignmentStatus {
  if (a.archivedAt) return "archived";
  return a.notificationTime > now ? "scheduled" : "active";
}

export function canManageAssignment(user: User, a: Assignment): boolean {
  return user.role === "teacher" && a.teacherId === user.id;
}

export function canStudentAccessAssignment(user: User, a: Assignment, isRecipient: boolean, now = new Date()): boolean {
  if (user.role !== "student") return false;
  if (assignmentStatus(a, now) !== "active") return false;
  if (a.audience === "selected") return isRecipient;
  return a.teacherSchool === null || a.teacherSchool === user.school;
}

/** SQL equivalent of canStudentAccessAssignment, for list queries. Keep the two in sync. */
export function studentVisibilityFilter(user: User, now = new Date()): SQL {
  const inSchool = user.school
    ? or(isNull(assignments.teacherSchool), eq(assignments.teacherSchool, user.school))!
    : isNull(assignments.teacherSchool);
  const isRecipient = exists(
    sql`(select 1 from ${assignmentStudents} where ${assignmentStudents.assignmentId} = ${assignments.id} and ${assignmentStudents.studentId} = ${user.id})`,
  );
  return and(
    isNull(assignments.archivedAt),
    lte(assignments.notificationTime, now),
    or(and(eq(assignments.audience, "school"), inSchool), and(eq(assignments.audience, "selected"), isRecipient)),
  )!;
}
