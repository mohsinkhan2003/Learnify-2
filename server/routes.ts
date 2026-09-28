import type { Express, Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  insertAssignmentSchema,
  validStatuses,
  type Assignment,
  type ProgressStatus,
  type User,
} from "@shared/schema";
import { storage } from "./storage";
import authRoutes from "./auth-routes";
import { checkDatabase } from "./db";
import { config } from "./config";
import { log } from "./logger";
import { generateTutorReply, isSummaryMessage } from "./tutor";
import { isPushEnabled, notifyNewAssignment } from "./push";
import {
  asyncHandler,
  assertUuid,
  currentUser,
  HttpError,
  requireAuth,
  requireRole,
} from "./middleware";

// Completion is allowed once the tutor has summarised, or after sustained effort.
// Mirrors the client-side rule in student-chat.tsx.
const MIN_TIME_SECONDS = 180;
const MIN_MESSAGE_COUNT = 15;
const MAX_MESSAGE_LENGTH = 4000;

// AI calls cost money; cap them per client.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "You're sending messages too quickly. Please wait a moment." },
});

function canAccessAssignment(user: User, assignment: Assignment): boolean {
  if (user.role === "teacher") return assignment.teacherId === user.id;
  if (user.role === "student") {
    // Legacy records without school information remain accessible.
    return !assignment.teacherSchool || !user.school || assignment.teacherSchool === user.school;
  }
  return false;
}

async function loadAccessibleAssignment(user: User, id: unknown): Promise<Assignment> {
  const assignment = await storage.getAssignment(assertUuid(id, "assignment id"));
  if (!assignment) throw new HttpError(404, "Assignment not found");
  if (!canAccessAssignment(user, assignment)) throw new HttpError(403, "Access denied");
  return assignment;
}

/** Students may only act on their own progress, for assignments they can access. */
async function authorizeOwnProgress(req: Request): Promise<{ assignmentId: string; studentId: string }> {
  const user = currentUser(req);
  const assignmentId = assertUuid(req.params.assignmentId, "assignment id");
  const studentId = assertUuid(req.params.studentId, "student id");
  if (user.role !== "student" || user.id !== studentId) {
    throw new HttpError(403, "Access denied - cannot modify other students' data");
  }
  await loadAccessibleAssignment(user, assignmentId);
  return { assignmentId, studentId };
}

export function registerRoutes(app: Express): void {
  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      try {
        await checkDatabase();
        res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
      } catch {
        res.status(503).json({ status: "error", database: "disconnected", timestamp: new Date().toISOString() });
      }
    }),
  );

  app.use("/api/auth", authRoutes);

  // Public: the VAPID public key is not a secret.
  app.get("/api/vapid-public-key", (_req, res) => {
    res.json({ publicKey: isPushEnabled() ? config.vapid.publicKey : null });
  });

  // Everything below requires a valid session.
  app.use("/api", requireAuth, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // ---------- Assignments ----------

  app.get(
    "/api/assignments",
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      if (user.role === "teacher") {
        res.json(await storage.getAssignmentsByTeacher(user.id));
      } else if (user.role === "student") {
        res.json(await storage.getAssignmentsForStudent(user.school));
      } else {
        res.json([]);
      }
    }),
  );

  app.get(
    "/api/assignments/:id",
    asyncHandler(async (req, res) => {
      res.json(await loadAccessibleAssignment(currentUser(req), req.params.id));
    }),
  );

  app.post(
    "/api/assignments",
    requireRole("teacher"),
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const result = insertAssignmentSchema.safeParse({
        ...req.body,
        // Ownership fields always come from the session, never the request body.
        teacherId: user.id,
        teacherName: user.name,
        teacherSchool: user.school,
        studentId: undefined,
      });
      if (!result.success) {
        throw new HttpError(400, "Invalid assignment data", result.error.issues);
      }

      const assignment = await storage.createAssignment(result.data);

      if (assignment.notificationTime <= new Date()) {
        notifyNewAssignment(assignment).catch((error) =>
          log.error("[Push] Failed to send notifications for new assignment:", error),
        );
      }

      res.status(201).json(assignment);
    }),
  );

  // ---------- Chat ----------

  app.get(
    "/api/chat/:assignmentId",
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const assignment = await loadAccessibleAssignment(user, req.params.assignmentId);
      // Students see only their own conversation; teachers see all conversations on their assignment.
      const messages =
        user.role === "teacher"
          ? await storage.getChatMessagesForAssignment(assignment.id)
          : await storage.getConversation(assignment.id, user.id);
      res.json(messages);
    }),
  );

  app.post(
    "/api/chat/:assignmentId/greeting",
    requireRole("student"),
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const assignment = await loadAccessibleAssignment(user, req.params.assignmentId);

      const conversation = await storage.getConversation(assignment.id, user.id);
      if (conversation.length > 0) {
        return res.json({ message: "Let's continue our conversation!" });
      }

      const greeting = "Hi there! How are you today?";
      await storage.createChatMessage({ assignmentId: assignment.id, role: "ai", content: greeting, userId: user.id });
      res.json({ message: greeting });
    }),
  );

  const chatBodySchema = z.object({
    assignmentId: z.string(),
    content: z.string().trim().min(1, "Message cannot be empty").max(MAX_MESSAGE_LENGTH, "Message is too long"),
  });

  app.post(
    "/api/chat",
    requireRole("student"),
    chatLimiter,
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const parsed = chatBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid message");
      }
      const assignment = await loadAccessibleAssignment(user, parsed.data.assignmentId);
      const studentMessage = parsed.data.content;

      const history = await storage.getConversation(assignment.id, user.id);
      const aiCountBefore = history.filter((m) => m.role === "ai").length;

      await storage.createChatMessage({
        assignmentId: assignment.id,
        role: "student",
        content: studentMessage,
        userId: user.id,
      });

      const aiResponse = await generateTutorReply(assignment, history, studentMessage);

      const aiMessage = await storage.createChatMessage({
        assignmentId: assignment.id,
        role: "ai",
        content: aiResponse,
        userId: user.id,
      });

      if (isSummaryMessage(aiResponse, aiCountBefore)) {
        await storage.markSummaryProvided(assignment.id, user.id);
      }

      res.json(aiMessage);
    }),
  );

  // ---------- Progress ----------

  // Route order matters: the specific paths must come before /:assignmentId/:studentId.
  app.get(
    "/api/progress/assignment/:assignmentId",
    requireRole("teacher"),
    asyncHandler(async (req, res) => {
      const assignment = await loadAccessibleAssignment(currentUser(req), req.params.assignmentId);
      res.json(await storage.getStudentProgressByAssignment(assignment.id));
    }),
  );

  app.get(
    "/api/progress/student/:studentId",
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const studentId = assertUuid(req.params.studentId, "student id");

      if (user.role === "student") {
        if (user.id !== studentId) throw new HttpError(403, "Access denied");
        return res.json(await storage.getStudentProgressByStudent(studentId));
      }
      // Teachers only see progress on their own assignments.
      const own = await storage.getAssignmentsByTeacher(user.id, 1000);
      res.json(await storage.getStudentProgressByStudent(studentId, own.map((a) => a.id)));
    }),
  );

  app.get(
    "/api/progress/:assignmentId/:studentId",
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const studentId = assertUuid(req.params.studentId, "student id");
      if (user.role === "student" && user.id !== studentId) throw new HttpError(403, "Access denied");
      const assignment = await loadAccessibleAssignment(user, req.params.assignmentId);
      res.json((await storage.getProgress(assignment.id, studentId)) ?? null);
    }),
  );

  // Ensures a progress record exists. Never overwrites an existing record, so
  // re-opening an assignment cannot reset a student's time or completion.
  app.post(
    "/api/progress",
    requireRole("student"),
    asyncHandler(async (req, res) => {
      const user = currentUser(req);
      const assignment = await loadAccessibleAssignment(user, req.body?.assignmentId);
      if (req.body?.studentId && req.body.studentId !== user.id) {
        throw new HttpError(403, "Access denied - cannot modify other students' data");
      }

      const existing = await storage.getProgress(assignment.id, user.id);
      if (existing) return res.json(existing);

      const progress = await storage.createOrUpdateProgress({
        assignmentId: assignment.id,
        studentId: user.id,
        status: "not_started",
      });
      res.status(201).json(progress);
    }),
  );

  const statusSchema = z.object({ status: z.enum(validStatuses) });

  app.patch(
    "/api/progress/:assignmentId/:studentId/status",
    asyncHandler(async (req, res) => {
      const { assignmentId, studentId } = await authorizeOwnProgress(req);
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, `Status must be one of: ${validStatuses.join(", ")}`);
      }
      const status: ProgressStatus = parsed.data.status;

      // summary_provided is set by the server when the tutor finishes, never by clients.
      if (status === "summary_provided") throw new HttpError(403, "Status cannot be set directly");

      const progress = await storage.getProgress(assignmentId, studentId);
      if (!progress) throw new HttpError(404, "Progress not found");

      // Completed work is final.
      if (progress.status === "completed") return res.json({ success: true });

      if (status === "completed") {
        const eligible =
          progress.status === "summary_provided" ||
          (progress.totalTimeSpent >= MIN_TIME_SECONDS && progress.messageCount >= MIN_MESSAGE_COUNT);
        if (!eligible) throw new HttpError(409, "Assignment is not ready to be completed yet");
      }

      await storage.updateProgressStatus(assignmentId, studentId, status);
      res.json({ success: true });
    }),
  );

  const timeSchema = z.object({ timeSpent: z.number().int().nonnegative().max(24 * 60 * 60) });

  app.patch(
    "/api/progress/:assignmentId/:studentId/time",
    asyncHandler(async (req, res) => {
      const { assignmentId, studentId } = await authorizeOwnProgress(req);
      const parsed = timeSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "timeSpent must be a non-negative integer (seconds)");
      await storage.updateProgressTime(assignmentId, studentId, parsed.data.timeSpent);
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/progress/:assignmentId/:studentId/increment",
    asyncHandler(async (req, res) => {
      const { assignmentId, studentId } = await authorizeOwnProgress(req);
      await storage.incrementMessageCount(assignmentId, studentId);
      res.json({ success: true });
    }),
  );

  // ---------- Push notifications ----------

  const subscriptionSchema = z.object({
    endpoint: z.string().url().max(2048),
    keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
  });

  app.post(
    "/api/push/subscribe",
    asyncHandler(async (req, res) => {
      const parsed = subscriptionSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "Invalid subscription");
      await storage.savePushSubscription(currentUser(req).id, {
        endpoint: parsed.data.endpoint,
        p256dhKey: parsed.data.keys.p256dh,
        authKey: parsed.data.keys.auth,
      });
      res.status(201).json({ message: "Subscription saved" });
    }),
  );

  // Unknown API routes return JSON 404 instead of falling through to the SPA.
  app.all("/api/*", (_req, _res, next) => next(new HttpError(404, "Not found")));
}
