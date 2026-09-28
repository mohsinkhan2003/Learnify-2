import { users, sessions, type InsertUser, type User } from "@shared/schema";
import { db } from "./db";
import { eq, and, gt, lt, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";

const SALT_ROUNDS = 12;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Only a SHA-256 digest of each session token is stored, so a database leak
// does not expose usable session tokens.
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(data: InsertUser): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({ ...data, email: normalizeEmail(data.email) })
    .returning();
  return user;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    // Case-insensitive so accounts created before emails were normalised still match.
    .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return user;
}

export async function findUserByGoogleId(googleId: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
  return user;
}

export async function linkGoogleAccount(userId: string, googleId: string, avatar?: string | null): Promise<User> {
  const [user] = await db
    .update(users)
    .set({ googleId, ...(avatar ? { avatar } : {}) })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Creates a session and returns the raw token (only the hash is persisted). */
export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  await db.insert(sessions).values({
    userId,
    token: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
  });
  return token;
}

export async function validateSession(token: string): Promise<User | null> {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, hashToken(token)));
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/** Fields safe to send to the client. Never include the password hash. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    school: user.school,
    subject: user.subject,
    avatar: user.avatar,
  };
}
