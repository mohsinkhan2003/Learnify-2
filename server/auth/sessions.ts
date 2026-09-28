import crypto from "crypto";
import type { Response } from "express";
import { and, eq, gt, lt } from "drizzle-orm";
import { sessions, users, type User } from "@shared/schema";
import { db } from "../db";
import { config } from "../config/env";

/**
 * Sessions are opaque random tokens delivered in an httpOnly cookie. Only a SHA-256
 * digest is stored, so a database leak does not expose usable sessions.
 */
export const SESSION_COOKIE = config.session.cookieSecure ? "__Host-learnify_session" : "learnify_session";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.session.ttlMs);
  await db.insert(sessions).values({ userId, token: hashToken(token), expiresAt });
  return { token, expiresAt };
}

export async function findSessionUser(token: string): Promise<User | null> {
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

export async function deleteUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return deleted.length;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: config.session.cookieSecure, sameSite: "lax", path: "/" });
}
