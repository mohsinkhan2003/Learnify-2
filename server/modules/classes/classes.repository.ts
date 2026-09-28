import { and, asc, count, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { classes, classMembers, users, type Class } from "@shared/schema";
import { db, type DbOrTx } from "../../db";

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  joinedAt: Date;
}

export const classesRepository = {
  async create(values: { teacherId: string; name: string; subject: string | null; joinCode: string }): Promise<Class> {
    const [c] = await db.insert(classes).values(values).returning();
    return c;
  },

  async findById(id: string): Promise<Class | undefined> {
    const [c] = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
    return c;
  },

  async findByJoinCode(code: string): Promise<Class | undefined> {
    const [c] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.joinCode, code), isNull(classes.archivedAt)))
      .limit(1);
    return c;
  },

  async listByTeacher(teacherId: string, includeArchived = false) {
    const rows = await db
      .select({ cls: classes, memberCount: count(classMembers.studentId) })
      .from(classes)
      .leftJoin(classMembers, eq(classMembers.classId, classes.id))
      .where(and(eq(classes.teacherId, teacherId), includeArchived ? undefined : isNull(classes.archivedAt)))
      .groupBy(classes.id)
      .orderBy(desc(classes.createdAt));
    return rows;
  },

  async listForStudent(studentId: string) {
    return db
      .select({ id: classes.id, name: classes.name, subject: classes.subject, teacherName: users.name })
      .from(classMembers)
      .innerJoin(classes, eq(classes.id, classMembers.classId))
      .innerJoin(users, eq(users.id, classes.teacherId))
      .where(and(eq(classMembers.studentId, studentId), isNull(classes.archivedAt)))
      .orderBy(asc(classes.name));
  },

  async update(id: string, values: Partial<Pick<Class, "name" | "subject" | "joinCode" | "archivedAt">>): Promise<Class> {
    const [c] = await db.update(classes).set(values).where(eq(classes.id, id)).returning();
    return c;
  },

  async addMember(classId: string, studentId: string, conn: DbOrTx = db): Promise<boolean> {
    const rows = await conn.insert(classMembers).values({ classId, studentId }).onConflictDoNothing().returning();
    return rows.length > 0;
  },

  async removeMember(classId: string, studentId: string): Promise<boolean> {
    const rows = await db
      .delete(classMembers)
      .where(and(eq(classMembers.classId, classId), eq(classMembers.studentId, studentId)))
      .returning();
    return rows.length > 0;
  },

  async isMember(classId: string, studentId: string): Promise<boolean> {
    const [row] = await db
      .select({ classId: classMembers.classId })
      .from(classMembers)
      .where(and(eq(classMembers.classId, classId), eq(classMembers.studentId, studentId)))
      .limit(1);
    return !!row;
  },

  async members(classId: string, opts: { search?: string; limit?: number } = {}): Promise<MemberRow[]> {
    const filters = [eq(classMembers.classId, classId)];
    if (opts.search) filters.push(ilike(users.name, `%${opts.search.replace(/[%_\\]/g, "\\$&")}%`));
    return db
      .select({ id: users.id, name: users.name, email: users.email, joinedAt: classMembers.joinedAt })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.studentId))
      .where(and(...filters))
      .orderBy(asc(users.name))
      .limit(opts.limit ?? 1000);
  },

  async memberCounts(classIds: string[]): Promise<Map<string, number>> {
    if (classIds.length === 0) return new Map();
    const rows = await db
      .select({ id: classMembers.classId, n: count() })
      .from(classMembers)
      .where(inArray(classMembers.classId, classIds))
      .groupBy(classMembers.classId);
    return new Map(rows.map((r) => [r.id, r.n]));
  },

  /** Subset of ids that are members of the class (never trust a client-supplied list). */
  async filterMembers(classId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select({ id: classMembers.studentId })
      .from(classMembers)
      .where(and(eq(classMembers.classId, classId), inArray(classMembers.studentId, ids)));
    return rows.map((r) => r.id);
  },

  /** Distinct students across all of a teacher's active classes, with class names. */
  async studentsOfTeacher(teacherId: string, opts: { search?: string; limit: number; offset: number }) {
    const filters = [eq(classes.teacherId, teacherId), isNull(classes.archivedAt)];
    if (opts.search) filters.push(ilike(users.name, `%${opts.search.replace(/[%_\\]/g, "\\$&")}%`));
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, className: classes.name })
      .from(classMembers)
      .innerJoin(classes, eq(classes.id, classMembers.classId))
      .innerJoin(users, eq(users.id, classMembers.studentId))
      .where(and(...filters))
      .orderBy(asc(users.name));
    const byId = new Map<string, { id: string; name: string; email: string; classes: string[] }>();
    for (const r of rows) {
      const entry = byId.get(r.id) ?? { id: r.id, name: r.name, email: r.email, classes: [] };
      entry.classes.push(r.className);
      byId.set(r.id, entry);
    }
    return [...byId.values()].slice(opts.offset, opts.offset + opts.limit);
  },

  /** True if the student belongs to any active class of the teacher. */
  async isStudentOfTeacher(teacherId: string, studentId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: classMembers.studentId })
      .from(classMembers)
      .innerJoin(classes, eq(classes.id, classMembers.classId))
      .where(and(eq(classes.teacherId, teacherId), eq(classMembers.studentId, studentId), isNull(classes.archivedAt)))
      .limit(1);
    return !!row;
  },
};
