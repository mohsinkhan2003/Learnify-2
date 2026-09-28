import { type Assignment, type InsertAssignment, type ChatMessage, type InsertChatMessage, type PushSubscription, type InsertPushSubscription, type StudentProgress, type InsertStudentProgress, type StudentProgressWithUser, assignments, chatMessages, pushSubscriptions, studentProgress, users } from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, sql } from "drizzle-orm";

export interface IStorage {
  // Assignment methods
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  getAssignments(): Promise<Assignment[]>;
  getAssignmentsByTeacher(teacherId: string): Promise<Assignment[]>;
  getAssignmentsByStudent(studentId: string): Promise<Assignment[]>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  getAssignmentsPendingNotification(): Promise<Assignment[]>;
  markAssignmentNotificationSent(id: string): Promise<void>;
  assignStudentToAssignment(assignmentId: string, studentId: string): Promise<void>;

  // Chat message methods
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(assignmentId: string): Promise<ChatMessage[]>;

  // Push subscription methods
  createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
  deletePushSubscription(endpoint: string): Promise<void>;

  // Student progress methods
  createOrUpdateProgress(progress: InsertStudentProgress): Promise<StudentProgress>;
  getProgress(assignmentId: string, studentId: string): Promise<StudentProgress | undefined>;
  getStudentProgressByAssignment(assignmentId: string): Promise<StudentProgressWithUser[]>;
  getStudentProgressByStudent(studentId: string): Promise<StudentProgress[]>;
  updateProgressStatus(assignmentId: string, studentId: string, status: string): Promise<void>;
  updateProgressTime(assignmentId: string, studentId: string, timeSpent: number): Promise<void>;
  incrementMessageCount(assignmentId: string, studentId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createAssignment(insertAssignment: InsertAssignment): Promise<Assignment> {
    const [assignment] = await db
      .insert(assignments)
      .values(insertAssignment)
      .returning();
    return assignment;
  }

  async getAssignments(): Promise<Assignment[]> {
    return await db
      .select()
      .from(assignments)
      .orderBy(desc(assignments.createdAt))
      .limit(10); // Limit to 10 assignments for faster loading
  }

  async getAssignmentsByTeacher(teacherId: string): Promise<Assignment[]> {
    return await db
      .select()
      .from(assignments)
      .where(eq(assignments.teacherId, teacherId))
      .orderBy(desc(assignments.createdAt));
  }

  async getAssignmentsByStudent(studentId: string): Promise<Assignment[]> {
    return await db
      .select()
      .from(assignments)
      .where(eq(assignments.studentId, studentId))
      .orderBy(desc(assignments.createdAt));
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    const [assignment] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    return assignment || undefined;
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db
      .insert(chatMessages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async getChatMessages(assignmentId: string): Promise<ChatMessage[]> {
    // Fetch messages for the assignment, ordered by timestamp
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.assignmentId, assignmentId))
      .orderBy(asc(chatMessages.timestamp));

    // Filter messages to include only those sent by the student or AI messages that directly follow student messages
    // This is to ensure chat history is visible even for new students who haven't sent messages yet,
    // and that AI responses are correctly displayed in context.
    const filteredMessages = messages.filter((message, index, arr) => {
      // Always include messages from the student
      if (message.sender === 'student') return true;

      // Include AI messages if they are the first message or directly follow a student's message
      if (message.sender === 'ai') {
        if (index === 0) return true; // First message is always shown
        const previousMessage = arr[index - 1];
        return previousMessage.sender === 'student';
      }

      return false; // Exclude other message types
    });

    return filteredMessages;
  }

  async createPushSubscription(insertSubscription: InsertPushSubscription): Promise<PushSubscription> {
    const [subscription] = await db
      .insert(pushSubscriptions)
      .values(insertSubscription)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dhKey: insertSubscription.p256dhKey,
          authKey: insertSubscription.authKey,
        }
      })
      .returning();
    return subscription;
  }

  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return await db
      .select()
      .from(pushSubscriptions)
      .orderBy(desc(pushSubscriptions.createdAt));
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getAssignmentsPendingNotification(): Promise<Assignment[]> {
    const now = new Date();
    return await db
      .select()
      .from(assignments)
      .where(eq(assignments.notificationSent, 'false'))
      .then(results => results.filter(a => new Date(a.notificationTime) <= now));
  }

  async markAssignmentNotificationSent(id: string): Promise<void> {
    await db
      .update(assignments)
      .set({ notificationSent: 'true' })
      .where(eq(assignments.id, id));
  }

  async assignStudentToAssignment(assignmentId: string, studentId: string): Promise<void> {
    await db
      .update(assignments)
      .set({ studentId })
      .where(eq(assignments.id, assignmentId));
  }

  async createOrUpdateProgress(data: InsertStudentProgress): Promise<StudentProgress> {
    console.log('[Progress DB] Creating/updating progress:', {
      assignmentId: data.assignmentId,
      studentId: data.studentId,
      status: data.status,
      timeSpent: data.totalTimeSpent,
      messages: data.messageCount
    });

    // Ensure startedAt is set if not provided
    const values = {
      ...data,
      startedAt: data.startedAt || new Date(),
      lastActiveAt: data.lastActiveAt || new Date(),
    };

    const [progress] = await db
      .insert(studentProgress)
      .values(values)
      .onConflictDoUpdate({
        target: [studentProgress.assignmentId, studentProgress.studentId],
        set: {
          // Update status if provided, otherwise keep existing
          status: data.status !== undefined ? data.status : sql`${studentProgress.status}`,
          // Update totalTimeSpent if provided, otherwise keep existing
          totalTimeSpent: data.totalTimeSpent !== undefined ? data.totalTimeSpent : sql`${studentProgress.totalTimeSpent}`,
          // NEVER overwrite messageCount here - it's managed by incrementMessageCount
          messageCount: sql`${studentProgress.messageCount}`,
          // Update completedAt if provided, otherwise keep existing
          completedAt: data.completedAt !== undefined ? data.completedAt : sql`${studentProgress.completedAt}`,
          // Preserve startedAt if it exists, otherwise set to NOW
          startedAt: sql`COALESCE(${studentProgress.startedAt}, NOW())`,
          lastActiveAt: new Date(),
        },
      })
      .returning();

    console.log('[Progress DB] ✓ Progress saved:', progress.id);
    return progress;
  }

  async getProgress(assignmentId: string, studentId: string): Promise<StudentProgress | undefined> {
    const [progress] = await db
      .select()
      .from(studentProgress)
      .where(
        and(
          eq(studentProgress.assignmentId, assignmentId),
          eq(studentProgress.studentId, studentId)
        )
      );
    return progress || undefined;
  }

  async getStudentProgressByAssignment(assignmentId: string): Promise<StudentProgressWithUser[]> {
    console.log('[Analytics DB] Fetching progress for assignment:', assignmentId);

    const results = await db
      .select({
        id: studentProgress.id,
        assignmentId: studentProgress.assignmentId,
        studentId: studentProgress.studentId,
        status: studentProgress.status,
        totalTimeSpent: sql<number>`COALESCE(${studentProgress.totalTimeSpent}, 0)`.as('totalTimeSpent'),
        messageCount: sql<number>`COALESCE(${studentProgress.messageCount}, 0)`.as('messageCount'),
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

    console.log('[Analytics DB] Found', results.length, 'student progress records');
    results.forEach(r => {
      console.log('  -', r.studentName || 'Unknown', ':', r.status, '- Messages:', r.messageCount, '- Time:', r.totalTimeSpent + 's');
    });

    return results;
  }

  async getStudentProgressByStudent(studentId: string): Promise<StudentProgress[]> {
    return await db
      .select()
      .from(studentProgress)
      .where(eq(studentProgress.studentId, studentId))
      .orderBy(desc(studentProgress.lastActiveAt));
  }

  async updateProgressStatus(assignmentId: string, studentId: string, status: string): Promise<void> {
    // Always check if startedAt needs to be set for existing records
    const existing = await this.getProgress(assignmentId, studentId);

    const updates: any = {
      status,
      lastActiveAt: new Date(),
    };

    // Set startedAt if it's null (for both new and existing records)
    if (!existing?.startedAt) {
      updates.startedAt = new Date();
      console.log('[Progress] Setting startedAt for existing record');
    }

    if (status === 'completed') {
      updates.completedAt = new Date();
    }

    await db
      .update(studentProgress)
      .set(updates)
      .where(
        and(
          eq(studentProgress.assignmentId, assignmentId),
          eq(studentProgress.studentId, studentId)
        )
      );
  }

  async updateProgressTime(assignmentId: string, studentId: string, timeSpent: number): Promise<void> {
    // Get existing progress to check if startedAt needs to be set
    const progress = await this.getProgress(assignmentId, studentId);

    const updates: any = {
      totalTimeSpent: timeSpent,
      lastActiveAt: new Date(),
    };

    // Set startedAt if it's null (for existing records created before the fix)
    if (!progress?.startedAt) {
      updates.startedAt = new Date();
      console.log('[Progress DB] Setting startedAt for existing record during time update');
    }

    await db
      .update(studentProgress)
      .set(updates)
      .where(
        and(
          eq(studentProgress.assignmentId, assignmentId),
          eq(studentProgress.studentId, studentId)
        )
      );
  }

  async incrementMessageCount(assignmentId: string, studentId: string): Promise<void> {
    console.log('[Progress DB] Incrementing message count for student:', studentId, 'assignment:', assignmentId);

    const progress = await this.getProgress(assignmentId, studentId);
    const currentCount = progress?.messageCount ?? 0;
    const newCount = currentCount + 1;

    console.log('[Progress DB] Current count:', currentCount, '-> New count:', newCount);

    const updates: any = {
      messageCount: newCount,
      lastActiveAt: new Date(),
    };

    // Set startedAt if it's null (for existing records created before the fix)
    if (!progress?.startedAt) {
      updates.startedAt = new Date();
      console.log('[Progress DB] Setting startedAt for existing record');
    }

    await db
      .update(studentProgress)
      .set(updates)
      .where(
        and(
          eq(studentProgress.assignmentId, assignmentId),
          eq(studentProgress.studentId, studentId)
        )
      );

    console.log('[Progress DB] ✓ Message count updated to', newCount);
  }
}

export const storage = new DatabaseStorage();