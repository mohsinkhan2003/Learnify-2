import crypto from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { emailVerificationTokens, users, type User } from "@shared/schema";
import { db } from "../db";
import { config } from "../config/env";
import { escapeHtml, sendEmail } from "../lib/email";

/** Email ownership check at sign-up: a single-use, 24-hour link. Only token hashes are stored. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function sendVerificationEmail(user: User, origin: string): Promise<boolean> {
  const token = crypto.randomBytes(32).toString("base64url");
  // Only the newest link works.
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
  await db
    .insert(emailVerificationTokens)
    .values({ userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) });
  const link = `${config.appOrigin ?? origin}/verify-email?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to: user.email,
    subject: "Confirm your email for Learnify",
    text: `Hi ${user.name},\n\nPlease confirm your email address to finish setting up your Learnify account:\n\n${link}\n\nThe link expires in 24 hours. If you didn't create a Learnify account, you can ignore this email.`,
    html: `<p>Hi ${escapeHtml(user.name)},</p><p>Please confirm your email address to finish setting up your Learnify account:</p><p><a href="${link}">Confirm my email</a></p><p>The link expires in 24 hours. If you didn't create a Learnify account, you can ignore this email.</p>`,
  });
}

/** Burns the token and marks the address verified. Returns the user, or null for a bad/expired link. */
export async function consumeVerification(token: string): Promise<User | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.tokenHash, hash(token)), gt(emailVerificationTokens.expiresAt, new Date())))
      .returning();
    if (!row) return null;
    const [user] = await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId)).returning();
    return user ?? null;
  });
}
