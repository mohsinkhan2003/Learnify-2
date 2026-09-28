import { eq, sql } from "drizzle-orm";
import { users, type InsertUser, type User } from "@shared/schema";
import type { PublicUser } from "@shared/api";
import { db, type DbOrTx } from "../db";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const usersRepository = {
  async create(data: InsertUser, conn: DbOrTx = db): Promise<User> {
    const [user] = await conn
      .insert(users)
      .values({ ...data, email: normalizeEmail(data.email) })
      .returning();
    return user;
  },

  async findById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  },

  async findByEmail(email: string): Promise<User | undefined> {
    // Case-insensitive so accounts created before emails were normalised still match.
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
      .limit(1);
    return user;
  },

  async findByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return user;
  },

  async linkGoogle(userId: string, googleId: string, avatar: string | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ googleId, ...(avatar ? { avatar } : {}) })
      .where(eq(users.id, userId))
      .returning();
    return user;
  },
};

/** The only user shape ever sent to clients (never includes the password hash). */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === "teacher" ? "teacher" : "student",
    school: user.school,
    subject: user.subject,
    avatar: user.avatar,
  };
}
