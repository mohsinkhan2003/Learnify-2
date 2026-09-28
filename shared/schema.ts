import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Auth tables
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: text("name").notNull(),
  password: text("password"), // null for Google OAuth users
  role: varchar("role", { length: 20 }).notNull(), // 'teacher' or 'student'
  subject: varchar("subject", { length: 100 }), // For teachers - the subject they teach
  school: varchar("school", { length: 255 }), // School/college name for both teachers and students
  googleId: text("google_id").unique(),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Auth schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const selectUserSchema = createSelectSchema(users);

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export const selectSessionSchema = createSelectSchema(sessions);

export type User = z.infer<typeof selectUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Session = z.infer<typeof selectSessionSchema>;
export type InsertSession = z.infer<typeof insertSessionSchema>;

// Assignment tables
export const assignments = pgTable("assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  teacherId: uuid("teacher_id").references(() => users.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").references(() => users.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  grade: varchar("grade", { length: 50 }).notNull(),
  subject: varchar("subject", { length: 100 }).notNull(),
  teacherName: text("teacher_name"), // Teacher's name (denormalized for performance)
  teacherSchool: varchar("teacher_school", { length: 255 }), // Teacher's school (for filtering)
  instructions: text("instructions").notNull(),
  notificationTime: timestamp("notification_time").notNull(),
  notificationSent: text("notification_sent").notNull().default('false'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssignmentSchema = createInsertSchema(assignments).omit({
  id: true,
  createdAt: true,
  notificationSent: true,
}).extend({
  teacherId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  notificationTime: z.string().transform((str) => {
    // The client sends an ISO string that's already been adjusted for timezone
    const date = new Date(str);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date format");
    }
    return date;
  }),
});

export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Assignment = typeof assignments.$inferSelect;

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  role: text("role").notNull(), // 'student' or 'ai'
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  assignmentUserIdx: index("chat_messages_assignment_user_idx").on(table.assignmentId, table.userId),
}));

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  timestamp: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  endpoint: text("endpoint").notNull().unique(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Student Progress Tracking
export const studentProgress = pgTable("student_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default('not_started'), // 'not_started', 'in_progress', 'completed'
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  totalTimeSpent: integer("total_time_spent").notNull().default(0), // in seconds
  messageCount: integer("message_count").notNull().default(0),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueAssignmentStudent: uniqueIndex("unique_assignment_student_idx").on(table.assignmentId, table.studentId),
}));

export const validStatuses = ['not_started', 'in_progress', 'summary_provided', 'completed'] as const;
export type ProgressStatus = typeof validStatuses[number];

export const insertStudentProgressSchema = createInsertSchema(studentProgress).omit({
  id: true,
  createdAt: true,
}).extend({
  status: z.enum(validStatuses).optional(),
  totalTimeSpent: z.number().int().nonnegative().optional(),
  messageCount: z.number().int().nonnegative().optional(),
});

export type InsertStudentProgress = z.infer<typeof insertStudentProgressSchema>;
export type StudentProgress = typeof studentProgress.$inferSelect;

// Student progress with user information (for analytics)
export type StudentProgressWithUser = {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  totalTimeSpent: number;
  messageCount: number;
  lastActiveAt: Date | null;
  createdAt: Date;
};

// Link push subscriptions to users
export const userPushSubscriptions = pgTable("user_push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: varchar("subscription_id").notNull().references(() => pushSubscriptions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueUserSubscription: uniqueIndex("unique_user_subscription_idx").on(table.userId, table.subscriptionId),
}));

export const insertUserPushSubscriptionSchema = createInsertSchema(userPushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export type InsertUserPushSubscription = z.infer<typeof insertUserPushSubscriptionSchema>;
export type UserPushSubscription = typeof userPushSubscriptions.$inferSelect;