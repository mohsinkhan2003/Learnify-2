import { users, sessions, type InsertUser, type User } from "@shared/schema";
import { db } from "./db";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";

const SALT_ROUNDS = 10;
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createUser(data: InsertUser) {
  try {
    console.log('[Auth DB] Creating user:', data.email, 'Role:', data.role);
    const [user] = await db.insert(users).values(data).returning();
    console.log('[Auth DB] ✓ User created with ID:', user.id);
    return user;
  } catch (error: any) {
    console.error('[Auth DB] ❌ Error creating user:', error.message);
    console.error('[Auth DB] Full error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

export async function findUserByEmail(email: string) {
  let retries = 3;
  while (retries > 0) {
    try {
      console.log('[Auth DB] Looking up user by email:', email, '(retries left:', retries, ')');
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      console.log('[Auth DB] User found:', !!user);
      return user;
    } catch (error: any) {
      retries--;
      console.error('[Auth DB] ❌ Error finding user by email:', error.message);
      
      if (retries === 0) {
        console.error('[Auth DB] Full error:', error);
        throw new Error(`Error connecting to database: fetch failed`);
      }
      
      // Wait before retry with exponential backoff
      const waitTime = (4 - retries) * 1000;
      console.log(`[Auth DB] Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

export async function findUserByGoogleId(googleId: string): Promise<User | undefined> {
  try {
    console.log('[Auth DB] Looking up user by Google ID:', googleId);
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    console.log('[Auth DB] User found:', !!user);
    return user;
  } catch (error: any) {
    console.error('[Auth DB] ❌ Error finding user by Google ID:', error.message);
    console.error('[Auth DB] Full error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

export async function createSession(userId: string) {
  try {
    console.log('[Auth DB] Creating session for user ID:', userId);
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION);

    await db.insert(sessions).values({
      userId,
      token,
      expiresAt,
    });

    console.log('[Auth DB] ✓ Session created');
    return token;
  } catch (error: any) {
    console.error('[Auth DB] ❌ Error creating session:', error.message);
    console.error('[Auth DB] Full error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

export async function validateSession(token: string): Promise<User | null> {
  try {
    console.log('[Auth DB] Validating session token:', token);
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.token, token),
          gt(sessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) {
      console.log('[Auth DB] Session not found or expired');
      return null;
    }

    console.log('[Auth DB] Session found, looking up user ID:', session.userId);
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    console.log('[Auth DB] User found for session:', !!user);
    return user || null;
  } catch (error: any) {
    console.error('[Auth DB] ❌ Error validating session:', error.message);
    console.error('[Auth DB] Full error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

export async function deleteSession(token: string): Promise<void> {
  try {
    console.log('[Auth DB] Deleting session token:', token);
    await db.delete(sessions).where(eq(sessions.token, token));
    console.log('[Auth DB] ✓ Session deleted');
  } catch (error: any) {
    console.error('[Auth DB] ❌ Error deleting session:', error.message);
    console.error('[Auth DB] Full error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}