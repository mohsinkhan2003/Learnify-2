import { eq, lt } from "drizzle-orm";
import { assignments, chatMessages, studentProgress, users } from "@shared/schema";
import { db } from "../../db";

/**
 * Data-subject operations, prepared for privacy requests and retention policies.
 *
 * These are deliberately NOT exposed as HTTP routes yet: they need an authorised operator
 * (school admin / support) role and an agreed retention policy, which are product and legal
 * decisions. Run them from a maintenance script or wire them to an admin API once that exists.
 */
export const privacyService = {
  /** Everything stored about a student, for access/portability requests. */
  async exportStudentData(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;
    const progress = await db.select().from(studentProgress).where(eq(studentProgress.studentId, userId));
    const messages = await db.select().from(chatMessages).where(eq(chatMessages.userId, userId));
    const { password: _password, ...profile } = user;
    return { profile, progress, messages };
  },

  /**
   * Permanently deletes a user and their learning data (sessions, progress, push links and
   * conversations). Assignments created by a deleted teacher are kept but archived, so other
   * students' history is not destroyed. Irreversible — confirm before calling.
   */
  async deleteUser(userId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) return false;
      // chat_messages.user_id is ON DELETE SET NULL (to keep other data intact), so remove
      // this user's conversation explicitly.
      await tx.delete(chatMessages).where(eq(chatMessages.userId, userId));
      if (user.role === "teacher") {
        await tx.update(assignments).set({ archivedAt: new Date(), teacherId: null }).where(eq(assignments.teacherId, userId));
      }
      await tx.delete(users).where(eq(users.id, userId)); // cascades sessions, progress, push links
      return true;
    });
  },

  /** Retention: deletes all conversation messages older than `days` (progress metrics are kept). */
  async purgeConversationsOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const deleted = await db.delete(chatMessages).where(lt(chatMessages.timestamp, cutoff)).returning({ id: chatMessages.id });
    return deleted.length;
  },
};
