import {
  type Assignment,
  type InsertAssignment,
  type ChatMessage,
  type InsertChatMessage,
  type PushSubscription,
  type InsertPushSubscription,
  type StudentProgress,
  type InsertStudentProgress,
  type StudentProgressWithUser,
  type ProgressStatus,
  assignments,
  chatMessages,
  pushSubscriptions,
  userPushSubscriptions,
  studentProgress,
  users,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, isNull, lte, inArray, sql } from "drizzle-orm";

export class DatabaseStorage {
  // ---- Assignments ----

  async createAssignment(insertAssignment: InsertAssignment): Promise<Assignment> {
    const [assignment] = await db.insert(assignments).values(insertAssignment).returning();
    return assignment;
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, id));
    return assignment;
  }

  async getAssignmentsByTeacher(teacherId: string, limit = 100): Promise<Assignment[]> {
    return db
      .select()
      .from(assignments)
      .where(eq(assignments.teacherId, teacherId))
      .orderBy(desc(assignments.createdAt))
      .limit(limit);
  }

  /**
   * Assignments visible to a student: those from teachers at the student's school.
   * Legacy assignments without a school are visible to everyone.
   */
  async getAssignmentsForStudent(school: string | null, limit = 50): Promise<Assignment[]> {
    const schoolFilter = school
      ? or(eq(assignments.teacherSchool, school), isNull(assignments.teacherSchool))
      : undefined;
    return db
      .select()
      .from(assignments)
      .where(schoolFilter)
      .orderBy(desc(assignments.createdAt))
      .limit(limit);
  }

  async getAssignmentsPendingNotification(): Promise<Assignment[]> {
    return db
      .select()
      .from(assignments)
      .where(and(eq(assignments.notificationSent, "false"), lte(assignments.notificationTime, new Date())));
  }

  async markAssignmentNotificationSent(id: string): Promise<void> {
    await db.update(assignments).set({ notificationSent: "true" }).where(eq(assignments.id, id));
  }

  // ---- Chat ----

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [created] = await db.insert(chatMessages).values(message).returning();
    return created;
  }

  /**
   * One student's conversation for an assignment. Both the student's messages and
   * the AI's replies to them are stored with the student's userId.
   */
  async getConversation(assignmentId: string, userId: string): Promise<ChatMessage[]> {
    return db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.assignmentId, assignmentId), eq(chatMessages.userId, userId)))
      .orderBy(asc(chatMessages.timestamp));
  }

  /** Every conversation for an assignment (teacher view). */
  async getChatMessagesForAssignment(assignmentId: string): Promise<ChatMessage[]> {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.assignmentId, assignmentId))
      .orderBy(asc(chatMessages.timestamp));
  }

  // ---- Push subscriptions ----

  async savePushSubscription(userId: string, subscription: InsertPushSubscription): Promise<PushSubscription> {
    const [saved] = await db
      .insert(pushSubscriptions)
      .values(subscription)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dhKey: subscription.p256dhKey, authKey: subscription.authKey },
      })
      .returning();

    // A browser endpoint belongs to whoever most recently subscribed with it.
    await db.delete(userPushSubscriptions).where(eq(userPushSubscriptions.subscriptionId, saved.id));
    await db.insert(userPushSubscriptions).values({ userId, subscriptionId: saved.id }).onConflictDoNothing();
    return saved;
  }

  /** Subscriptions belonging to students at the given school (all students if school is null). */
  async getStudentSubscriptions(school: string | null): Promise<PushSubscription[]> {
    const rows = await db
      .select({ subscription: pushSubscriptions })
      .from(pushSubscriptions)
      .innerJoin(userPushSubscriptions, eq(userPushSubscriptions.subscriptionId, pushSubscriptions.id))
      .innerJoin(users, eq(users.id, userPushSubscriptions.userId))
      .where(and(eq(users.role, "student"), school ? eq(users.school, school) : undefined));
    return rows.map((r) => r.subscription);
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  // ---- Progress ----

  async createOrUpdateProgress(data: InsertStudentProgress): Promise<StudentProgress> {
    const now = new Date();
    const [progress] = await db
      .insert(studentProgress)
      .values({ ...data, startedAt: data.startedAt ?? now, lastActiveAt: now })
      .onConflictDoUpdate({
        target: [studentProgress.assignmentId, studentProgress.studentId],
        set: {
          // Only overwrite fields that were provided. messageCount is managed by incrementMessageCount.
          status: data.status ?? sql`${studentProgress.status}`,
          totalTimeSpent: data.totalTimeSpent ?? sql`${studentProgress.totalTimeSpent}`,
          completedAt: data.completedAt !== undefined ? data.completedAt : sql`${studentProgress.completedAt}`,
          startedAt: sql`COALESCE(${studentProgress.startedAt}, NOW())`,
          lastActiveAt: now,
        },
      })
      .returning();
    return progress;
  }

  async getProgress(assignmentId: string, studentId: string): Promise<StudentProgress | undefined> {
    const [progress] = await db
      .select()
      .from(studentProgress)
      .where(and(eq(studentProgress.assignmentId, assignmentId), eq(studentProgress.studentId, studentId)));
    return progress;
  }

  async getStudentProgressByAssignment(assignmentId: string): Promise<StudentProgressWithUser[]> {
    return db
      .select({
        id: studentProgress.id,
        assignmentId: studentProgress.assignmentId,
        studentId: studentProgress.studentId,
        status: studentProgress.status,
        totalTimeSpent: studentProgress.totalTimeSpent,
        messageCount: studentProgress.messageCount,
        startedAt: studentProgress.startedAt,
        completedAt: studentProgress.completedAt,
        lastActiveAt: studentProgress.lastActiveAt,
        studentName: users.name,
        studentEmail: users.email,
        createdAt: studentProgress.createdAt,
      })
      .from(studentProgress)
      .leftJoin(users, eq(studentProgress.studentId, users.id))
      .where(eq(studentProgress.assignmentId, assignmentId))
      .orderBy(desc(studentProgress.lastActiveAt));
  }

  /** A student's progress, optionally restricted to a set of assignments. */
  async getStudentProgressByStudent(studentId: string, assignmentIds?: string[]): Promise<StudentProgress[]> {
    if (assignmentIds && assignmentIds.length === 0) return [];
    return db
      .select()
      .from(studentProgress)
      .where(
        and(
          eq(studentProgress.studentId, studentId),
          assignmentIds ? inArray(studentProgress.assignmentId, assignmentIds) : undefined,
        ),
      )
      .orderBy(desc(studentProgress.lastActiveAt));
  }

  private progressWhere(assignmentId: string, studentId: string) {
    return and(eq(studentProgress.assignmentId, assignmentId), eq(studentProgress.studentId, studentId));
  }

  async updateProgressStatus(assignmentId: string, studentId: string, status: ProgressStatus): Promise<void> {
    const now = new Date();
    await db
      .update(studentProgress)
      .set({
        status,
        lastActiveAt: now,
        startedAt: sql`COALESCE(${studentProgress.startedAt}, NOW())`,
        ...(status === "completed" ? { completedAt: now } : {}),
      })
      .where(this.progressWhere(assignmentId, studentId));
  }

  /** Moves an unfinished assignment to summary_provided (never downgrades a completed one). */
  async markSummaryProvided(assignmentId: string, studentId: string): Promise<void> {
    await db
      .update(studentProgress)
      .set({ status: "summary_provided", lastActiveAt: new Date() })
      .where(and(this.progressWhere(assignmentId, studentId), sql`${studentProgress.status} <> 'completed'`));
  }

  async updateProgressTime(assignmentId: string, studentId: string, timeSpent: number): Promise<void> {
    await db
      .update(studentProgress)
      .set({
        totalTimeSpent: timeSpent,
        lastActiveAt: new Date(),
        startedAt: sql`COALESCE(${studentProgress.startedAt}, NOW())`,
      })
      .where(this.progressWhere(assignmentId, studentId));
  }

  async incrementMessageCount(assignmentId: string, studentId: string): Promise<void> {
    // Atomic increment so concurrent requests cannot lose updates.
    await db
      .update(studentProgress)
      .set({
        messageCount: sql`${studentProgress.messageCount} + 1`,
        lastActiveAt: new Date(),
        startedAt: sql`COALESCE(${studentProgress.startedAt}, NOW())`,
      })
      .where(this.progressWhere(assignmentId, studentId));
  }
}

export const storage = new DatabaseStorage();
