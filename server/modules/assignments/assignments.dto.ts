import type { Assignment } from "@shared/schema";
import type { AssignmentDto } from "@shared/api";
import { assignmentStatus } from "../../policies/assignment-access";
import { toIso } from "../../lib/http";

export function toAssignmentDto(a: Assignment, now = new Date()): AssignmentDto {
  return {
    id: a.id,
    topic: a.topic,
    subject: a.subject,
    grade: a.grade,
    instructions: a.instructions,
    teacherName: a.teacherName,
    audience: a.audience === "selected" ? "selected" : "school",
    releaseAt: a.notificationTime.toISOString(),
    dueAt: toIso(a.dueAt),
    archivedAt: toIso(a.archivedAt),
    createdAt: a.createdAt.toISOString(),
    status: assignmentStatus(a, now),
  };
}

/** Student-facing DTO: teacher guidance is internal to the tutor and not shown to students. */
export function toStudentAssignmentDto(a: Assignment, now = new Date()): AssignmentDto {
  return { ...toAssignmentDto(a, now), instructions: "" };
}
