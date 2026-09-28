import { and, asc, count, desc, eq, ilike, inArray, isNull, isNotNull, lte, sql } from "drizzle-orm";
import {
  assignments,
  assignmentStudents,
  studentProgress,
  users,
  type Assignment,
  type InsertAssignment,
  type StudentProgress,
  type User,
} from "@shared/schema";
import { db, type DbOrTx } from "../../db";
import { studentVisibilityFilter } from "../../policies/assignment-access";

export interface ProgressWithStudent {
  progress: StudentProgress;
  studentName: string;
  studentEmail: string;
}

export const assignmentsRepository = {
  async create(values: InsertAssignment, conn: DbOrTx = db): Promise<Assignment> {
    const [a] = await conn.insert(assignments).values(values).returning();
    return a;
  },

  async addRecipients(assignmentId: string, studentIds: string[], conn: DbOrTx = db): Promise<void> {
    if (studentIds.length === 0) return;
    await conn
      .insert(assignmentStudents)
      .values(studentIds.map((studentId) => ({ assignmentId, studentId })))
      .onConflictDoNothing();
  },

  async findById(id: string): Promise<Assignment | undefined> {
    const [a] = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
    return a;
  },

  async isRecipient(assignmentId: string, studentId: string): Promise<boolean> {
    const [row] = await db
      .select({ one: sql<number>`1` })
      .from(assignmentStudents)
      .where(and(eq(assignmentStudents.assignmentId, assignmentId), eq(assignmentStudents.studentId, studentId)))
      .limit(1);
    return !!row;
  },

  async listByTeacher(teacherId: string, opts: { limit: number; offset: number; archived: boolean }): Promise<Assignment[]> {
    return db
      .select()
      .from(assignments)
      .where(and(eq(assignments.teacherId, teacherId), opts.archived ? isNotNull(assignments.archivedAt) : isNull(assignments.archivedAt)))
      .orderBy(desc(assignments.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  },

  /** Released, non-archived assignments of a teacher (bounded). */
  async listActiveByTeacher(teacherId: string, cap = 200): Promise<Assignment[]> {
    return db
      .select()
      .from(assignments)
      .where(and(eq(assignments.teacherId, teacherId), isNull(assignments.archivedAt), lte(assignments.notificationTime, new Date())))
      .orderBy(desc(assignments.createdAt))
      .limit(cap);
  },

  async countScheduledByTeacher(teacherId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(assignments)
      .where(and(eq(assignments.teacherId, teacherId), isNull(assignments.archivedAt), sql`${assignments.notificationTime} > now()`));
    return row?.n ?? 0;
  },

  async setArchived(id: string, archivedAt: Date | null): Promise<Assignment> {
    const [a] = await db.update(assignments).set({ archivedAt }).where(eq(assignments.id, id)).returning();
    return a;
  },

  async recipients(assignmentId: string): Promise<{ id: string; name: string }[]> {
    return db
      .select({ id: users.id, name: users.name })
      .from(assignmentStudents)
      .innerJoin(users, eq(users.id, assignmentStudents.studentId))
      .where(eq(assignmentStudents.assignmentId, assignmentId))
      .orderBy(asc(users.name));
  },

  async recipientCounts(assignmentIds: string[]): Promise<Map<string, number>> {
    if (assignmentIds.length === 0) return new Map();
    const rows = await db
      .select({ id: assignmentStudents.assignmentId, n: count() })
      .from(assignmentStudents)
      .where(inArray(assignmentStudents.assignmentId, assignmentIds))
      .groupBy(assignmentStudents.assignmentId);
    return new Map(rows.map((r) => [r.id, r.n]));
  },

  async countStudentsAtSchool(school: string | null): Promise<number> {
    if (!school) return 0;
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "student"), eq(users.school, school)));
    return row?.n ?? 0;
  },

  async studentsAtSchool(school: string | null, opts: { search?: string; limit: number; offset: number }) {
    if (!school) return [];
    const filters = [eq(users.role, "student"), eq(users.school, school)];
    if (opts.search) filters.push(ilike(users.name, `%${opts.search.replace(/[%_\\]/g, "\\$&")}%`));
    return db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(...filters))
      .orderBy(asc(users.name))
      .limit(opts.limit)
      .offset(opts.offset);
  },

  /** Returns the subset of ids that are students at the given school (prevents cross-school assignment). */
  async filterStudentIdsAtSchool(school: string | null, ids: string[]): Promise<string[]> {
    if (!school || ids.length === 0) return [];
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, ids), eq(users.role, "student"), eq(users.school, school)));
    return rows.map((r) => r.id);
  },

  /** Progress rows (with student identity) for a set of assignments. */
  async progressForAssignments(assignmentIds: string[]): Promise<ProgressWithStudent[]> {
    if (assignmentIds.length === 0) return [];
    return db
      .select({ progress: studentProgress, studentName: users.name, studentEmail: users.email })
      .from(studentProgress)
      .innerJoin(users, eq(users.id, studentProgress.studentId))
      .where(inArray(studentProgress.assignmentId, assignmentIds));
  },

  /** Assignments visible to a student, with that student's progress (if any). */
  async listVisibleForStudent(student: User, limit = 100) {
    return db
      .select({ assignment: assignments, progress: studentProgress })
      .from(assignments)
      .leftJoin(
        studentProgress,
        and(eq(studentProgress.assignmentId, assignments.id), eq(studentProgress.studentId, student.id)),
      )
      .where(studentVisibilityFilter(student))
      .orderBy(desc(assignments.notificationTime))
      .limit(limit);
  },
};
