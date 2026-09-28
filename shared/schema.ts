import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid, integer, boolean, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";

// All timestamps are stored as timestamptz (UTC instants) and converted to the
// viewer's local time zone only for display.
const tz = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// Users & sessions
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: text("name").notNull(),
    password: text("password"), // bcrypt hash; null for Google-only accounts
    role: varchar("role", { length: 20 }).notNull(), // 'teacher' | 'student'
    subject: varchar("subject", { length: 100 }), // teachers: the subject they teach
    school: varchar("school", { length: 255 }), // tenant boundary for teachers and students
    googleId: text("google_id").unique(),
    avatar: text("avatar"),
    /** When the user proved they own `email` (verification link, email reset, or Google). */
    emailVerifiedAt: tz("email_verified_at"),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    schoolRoleIdx: index("users_school_role_idx").on(t.school, t.role),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(), // SHA-256 of the session token, never the token itself
    expiresAt: tz("expires_at").notNull(),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

/** Single-use email verification links (24 h). Only a SHA-256 hash of each token is stored. */
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: tz("expires_at").notNull(),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("email_verification_tokens_user_idx").on(t.userId),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ---------------------------------------------------------------------------
// Classes: the verified link between a teacher and students (join by code)
// ---------------------------------------------------------------------------

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    subject: varchar("subject", { length: 100 }),
    /** Short code students type to join, e.g. "K7M4QXPB". Regenerable by the teacher. */
    joinCode: varchar("join_code", { length: 16 }).notNull().unique(),
    archivedAt: tz("archived_at"),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    teacherIdx: index("classes_teacher_idx").on(t.teacherId),
  }),
);

export const classMembers = pgTable(
  "class_members",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: tz("joined_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.classId, t.studentId] }),
    studentIdx: index("class_members_student_idx").on(t.studentId),
  }),
);

export type Class = typeof classes.$inferSelect;

/** Single-use, short-lived password reset tokens (only the SHA-256 hash is stored). */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** Teacher who generated the link, or null for self-service email resets. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: tz("expires_at").notNull(),
    usedAt: tz("used_at"),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("password_reset_tokens_user_idx").on(t.userId),
  }),
);

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/**
 * - class:    every member of a class (verified by join code)
 * - selected: chosen members of a class
 * - school:   legacy (demo) audience — everyone who claimed the same school name. Not offered for new assignments.
 */
export const ASSIGNMENT_AUDIENCES = ["class", "selected", "school"] as const;
export type AssignmentAudience = (typeof ASSIGNMENT_AUDIENCES)[number];

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teacherId: uuid("teacher_id").references(() => users.id, { onDelete: "cascade" }),
    /** @deprecated Legacy single-student field from the demo. Use assignment_students. */
    studentId: uuid("student_id").references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    grade: varchar("grade", { length: 50 }).notNull(),
    subject: varchar("subject", { length: 100 }).notNull(),
    teacherName: text("teacher_name"),
    teacherSchool: varchar("teacher_school", { length: 255 }),
    instructions: text("instructions").notNull(),
    /** Release time: students see the assignment (and are notified) from this instant. */
    notificationTime: tz("notification_time").notNull(),
    notificationSent: boolean("notification_sent").notNull().default(false),
    audience: varchar("audience", { length: 20 }).notNull().default("school"),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    dueAt: tz("due_at"),
    archivedAt: tz("archived_at"),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    teacherCreatedIdx: index("assignments_teacher_created_idx").on(t.teacherId, t.createdAt),
    classIdx: index("assignments_class_idx").on(t.classId),
    schoolReleaseIdx: index("assignments_school_release_idx").on(t.teacherSchool, t.notificationTime),
    pendingNotificationIdx: index("assignments_pending_notification_idx")
      .on(t.notificationTime)
      .where(sql`${t.notificationSent} = false`),
  }),
);

/** Recipients for assignments with audience = 'selected'. */
export const assignmentStudents = pgTable(
  "assignment_students",
  {
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.assignmentId, t.studentId] }),
    studentIdx: index("assignment_students_student_idx").on(t.studentId),
  }),
);

export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = typeof assignments.$inferInsert;

// ---------------------------------------------------------------------------
// Tutoring
// ---------------------------------------------------------------------------

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // varchar (not uuid/FK) for compatibility with rows created by the demo, which may reference
    // deleted assignments. Access is always checked through the assignment first.
    assignmentId: varchar("assignment_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    role: text("role").notNull(), // 'student' | 'ai'
    content: text("content").notNull(),
    /** Tutor stage this message belongs to (see shared/tutor.ts). */
    stage: varchar("stage", { length: 32 }),
    /** How a student message was entered. */
    source: varchar("source", { length: 10 }), // 'text' | 'voice'
    /** Tutor's assessment of the student answer this AI message responds to. */
    assessment: varchar("assessment", { length: 24 }),
    /** Short note on a misconception the tutor noticed (teacher-visible evidence). */
    misconception: text("misconception"),
    flagged: boolean("flagged").notNull().default(false),
    /** Client-generated id so retried submissions are idempotent. */
    clientMessageId: uuid("client_message_id"),
    timestamp: tz("timestamp").defaultNow().notNull(),
  },
  (t) => ({
    assignmentUserIdx: index("chat_messages_assignment_user_idx").on(t.assignmentId, t.userId, t.timestamp),
    clientMessageIdx: uniqueIndex("chat_messages_client_message_idx").on(t.userId, t.clientMessageId),
  }),
);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

export const studentProgress = pgTable(
  "student_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Coarse lifecycle status (see PROGRESS_STATUSES). */
    status: varchar("status", { length: 20 }).notNull().default("not_started"),
    /** Fine-grained tutor state machine stage (see TUTOR_STAGES). */
    tutorStage: varchar("tutor_stage", { length: 32 }).notNull().default("NOT_STARTED"),
    /** Student turns spent in the current stage / on the current practice question. */
    stageTurns: integer("stage_turns").notNull().default(0),
    practiceCompleted: integer("practice_completed").notNull().default(0),
    hintCount: integer("hint_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    flaggedCount: integer("flagged_count").notNull().default(0),
    summary: text("summary"),
    /** Set while a tutor turn is being generated; prevents concurrent turns. */
    turnLockedAt: tz("turn_locked_at"),
    startedAt: tz("started_at"),
    completedAt: tz("completed_at"),
    /** Active learning time in seconds, accumulated from visible-tab heartbeats. */
    totalTimeSpent: integer("total_time_spent").notNull().default(0),
    /** Student messages sent to the tutor. */
    messageCount: integer("message_count").notNull().default(0),
    lastActiveAt: tz("last_active_at"),
    lastHeartbeatAt: tz("last_heartbeat_at"),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueAssignmentStudent: uniqueIndex("unique_assignment_student_idx").on(t.assignmentId, t.studentId),
    studentIdx: index("student_progress_student_idx").on(t.studentId),
  }),
);

export type StudentProgress = typeof studentProgress.$inferSelect;

/** One row per paid AI call, for cost tracking and per-user limits. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    assignmentId: uuid("assignment_id").references(() => assignments.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 20 }).notNull(), // 'chat' | 'transcription' | 'moderation'
    model: varchar("model", { length: 64 }).notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    audioSeconds: integer("audio_seconds").notNull().default(0),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userCreatedIdx: index("ai_usage_user_created_idx").on(t.userId, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

/** Shared rate-limit counters (used when RATE_LIMIT_STORE=postgres, e.g. on Vercel). */
export const rateLimitHits = pgTable("rate_limit_hits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  resetAt: tz("reset_at").notNull(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  endpoint: text("endpoint").notNull().unique(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  createdAt: tz("created_at").defaultNow().notNull(),
});

export const userPushSubscriptions = pgTable(
  "user_push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: varchar("subscription_id")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueUserSubscription: uniqueIndex("unique_user_subscription_idx").on(t.userId, t.subscriptionId),
    subscriptionIdx: index("user_push_subscriptions_subscription_idx").on(t.subscriptionId),
  }),
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
