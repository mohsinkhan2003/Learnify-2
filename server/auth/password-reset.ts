import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { passwordResetTokens, users, type User } from "@shared/schema";
import { db } from "../db";
import { config } from "../config/env";
import { escapeHtml, sendEmail } from "../lib/email";
import { hashPassword } from "./password";
import { deleteUserSessions } from "./sessions";

/**
 * Password reset with single-use, 1-hour tokens. Only a SHA-256 hash of each token is stored.
 * Two ways to get a link:
 *  - self-service by email (when an email provider is configured), and
 *  - a teacher generating a link for a student in one of their classes (works without email,
 *    which suits students who don't have school email).
 */
const TOKEN_TTL_MS = 60 * 60 * 1000;

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

function resetUrl(token: string, origin: string): string {
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

async function issueToken(userId: string, createdBy: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  // Only the newest link works: older unused tokens for this user are removed.
  await db.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
  await db.insert(passwordResetTokens).values({ userId, tokenHash: hash(token), createdBy, expiresAt });
  return { token, expiresAt };
}

export async function requestEmailReset(user: User | undefined, origin: string): Promise<void> {
  if (!user) return;
  const { token } = await issueToken(user.id, null);
  const link = resetUrl(token, config.appOrigin ?? origin);
  await sendEmail({
    to: user.email,
    subject: "Reset your Learnify password",
    text: `Hi ${user.name},\n\nUse this link to choose a new Learnify password. It expires in 1 hour and can be used once:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: `<p>Hi ${escapeHtml(user.name)},</p><p>Use this link to choose a new Learnify password. It expires in 1 hour and can be used once:</p><p><a href="${link}">Reset my password</a></p><p>If you didn't ask for this, you can ignore this email.</p>`,
  });
}

export async function createTeacherResetLink(studentId: string, teacherId: string, origin: string) {
  const { token, expiresAt } = await issueToken(studentId, teacherId);
  return { url: resetUrl(token, config.appOrigin ?? origin), expiresAt };
}

/** Sets the new password, burns the token and signs the user out everywhere. Returns the user or null. */
export async function consumeReset(token: string, newPassword: string): Promise<User | null> {
  const passwordHash = await hashPassword(newPassword);
  return db
    .transaction(async (tx) => {
      const [row] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hash(token)),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!row) return null;
      // A link that arrived by email also proves the user owns the address.
      const proof = row.createdBy === null ? { emailVerifiedAt: new Date() } : {};
      const [user] = await tx
        .update(users)
        .set({ password: passwordHash, ...proof })
        .where(eq(users.id, row.userId))
        .returning();
      return user ?? null;
    })
    .then(async (user) => {
      if (user) await deleteUserSessions(user.id);
      return user;
    });
}
