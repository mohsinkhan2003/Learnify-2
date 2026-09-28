import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { chatMessages, studentProgress, type ChatMessage, type InsertChatMessage, type StudentProgress } from "@shared/schema";
import { db, type DbOrTx } from "../../db";

const TURN_LOCK_SECONDS = 90;
/** Heartbeats further apart than this start a new interval (tab was hidden, device slept…). */
const HEARTBEAT_GAP_SECONDS = 90;
/** Maximum time credited per heartbeat. */
const HEARTBEAT_MAX_CREDIT_SECONDS = 60;

const where = (assignmentId: string, studentId: string) =>
  and(eq(studentProgress.assignmentId, assignmentId), eq(studentProgress.studentId, studentId));

export const tutoringRepository = {
  async getProgress(assignmentId: string, studentId: string, conn: DbOrTx = db): Promise<StudentProgress | undefined> {
    const [p] = await conn.select().from(studentProgress).where(where(assignmentId, studentId)).limit(1);
    return p;
  },

  /** Creates the progress row if missing (idempotent) and returns it. */
  async ensureProgress(assignmentId: string, studentId: string): Promise<StudentProgress> {
    await db.insert(studentProgress).values({ assignmentId, studentId }).onConflictDoNothing();
    return (await this.getProgress(assignmentId, studentId))!;
  },

  /** NOT_STARTED → GREETING exactly once. Returns the row only for the caller that won. */
  async beginSession(assignmentId: string, studentId: string, conn: DbOrTx = db): Promise<StudentProgress | undefined> {
    const [p] = await conn
      .update(studentProgress)
      .set({
        tutorStage: "GREETING",
        status: "in_progress",
        startedAt: sql`coalesce(${studentProgress.startedAt}, now())`,
        lastActiveAt: sql`now()`,
      })
      .where(and(where(assignmentId, studentId), eq(studentProgress.tutorStage, "NOT_STARTED")))
      .returning();
    return p;
  },

  /**
   * Atomically claims the per-student turn lock so only one tutor turn runs at a time
   * (double-clicks, retries, multiple tabs). Stale locks expire after TURN_LOCK_SECONDS.
   */
  async claimTurnLock(assignmentId: string, studentId: string): Promise<StudentProgress | undefined> {
    const [p] = await db
      .update(studentProgress)
      .set({ turnLockedAt: sql`now()` })
      .where(
        and(
          where(assignmentId, studentId),
          sql`(${studentProgress.turnLockedAt} is null or ${studentProgress.turnLockedAt} < now() - make_interval(secs => ${TURN_LOCK_SECONDS}))`,
        ),
      )
      .returning();
    return p;
  },

  async releaseTurnLock(assignmentId: string, studentId: string): Promise<void> {
    await db.update(studentProgress).set({ turnLockedAt: null }).where(where(assignmentId, studentId));
  },

  async updateProgress(assignmentId: string, studentId: string, values: Partial<StudentProgress>, conn: DbOrTx = db) {
    const [p] = await conn.update(studentProgress).set(values).where(where(assignmentId, studentId)).returning();
    return p;
  },

  async insertMessage(message: InsertChatMessage, conn: DbOrTx = db): Promise<ChatMessage> {
    const [m] = await conn.insert(chatMessages).values(message).returning();
    return m;
  },

  /** A student's conversation, oldest first (bounded to the most recent `limit`). */
  async listConversation(assignmentId: string, userId: string, limit = 200): Promise<ChatMessage[]> {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.assignmentId, assignmentId), eq(chatMessages.userId, userId)))
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit);
    return rows.reverse();
  },

  async findByClientMessageId(userId: string, clientMessageId: string): Promise<ChatMessage | undefined> {
    const [m] = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.userId, userId), eq(chatMessages.clientMessageId, clientMessageId)))
      .limit(1);
    return m;
  },

  /** The tutor reply stored right after a given student message. */
  async findReplyAfter(message: ChatMessage): Promise<ChatMessage | undefined> {
    const [m] = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.assignmentId, message.assignmentId),
          eq(chatMessages.userId, message.userId!),
          eq(chatMessages.role, "ai"),
          gt(chatMessages.timestamp, message.timestamp),
        ),
      )
      .orderBy(asc(chatMessages.timestamp))
      .limit(1);
    return m;
  },

  /**
   * Credits active time from visible-tab heartbeats: the gap since the previous heartbeat is
   * added (capped) only if it is short; longer gaps just restart the interval. Several tabs
   * sharing one row cannot double count because each credit is measured from the last beat.
   */
  async heartbeat(assignmentId: string, studentId: string): Promise<StudentProgress | undefined> {
    const [p] = await db
      .update(studentProgress)
      .set({
        totalTimeSpent: sql`${studentProgress.totalTimeSpent} + case
          when ${studentProgress.lastHeartbeatAt} is not null
           and ${studentProgress.lastHeartbeatAt} > now() - make_interval(secs => ${HEARTBEAT_GAP_SECONDS})
          then least(greatest(extract(epoch from now() - ${studentProgress.lastHeartbeatAt}), 0), ${HEARTBEAT_MAX_CREDIT_SECONDS})::int
          else 0 end`,
        lastHeartbeatAt: sql`now()`,
        lastActiveAt: sql`now()`,
      })
      .where(and(where(assignmentId, studentId), sql`${studentProgress.status} <> 'completed'`))
      .returning();
    return p;
  },

  /** READY_TO_COMPLETE → COMPLETED exactly once. */
  async complete(assignmentId: string, studentId: string): Promise<StudentProgress | undefined> {
    const [p] = await db
      .update(studentProgress)
      .set({ tutorStage: "COMPLETED", status: "completed", completedAt: sql`now()`, lastActiveAt: sql`now()` })
      .where(and(where(assignmentId, studentId), eq(studentProgress.tutorStage, "READY_TO_COMPLETE")))
      .returning();
    return p;
  },
};
