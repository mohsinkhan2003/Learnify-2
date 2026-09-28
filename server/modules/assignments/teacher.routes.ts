import { Router } from "express";
import { z } from "zod";
import type { ChatMessageDto, CreateAssignmentInput, Paginated, TeacherStudentRow, UpdateAssignmentInput } from "@shared/api";
import { asyncHandler, parse, uuidParam } from "../../lib/http";
import { currentUser, requireRole } from "../../middleware/auth";
import { rateLimits } from "../../middleware/rate-limit";
import { analyticsService } from "../analytics/analytics.service";
import { assignmentsService, loadOwnedAssignment } from "./assignments.service";
import { teacherClassRoutes } from "../classes/classes.routes";
import { toChatMessageDto } from "../tutoring/tutoring.dto";
import { tutoringRepository } from "../tutoring/tutoring.repository";

const router = Router();
router.use(requireRole("teacher"));

const isoDate = z.string().datetime({ offset: true, message: "Invalid date" });
const YEAR = 365 * 24 * 60 * 60 * 1000;

export const createAssignmentSchema = z
  .object({
    topic: z.string().trim().min(3, "Topic must be at least 3 characters").max(200, "Topic is too long"),
    subject: z.string().trim().min(2, "Please choose a subject").max(100),
    grade: z.string().trim().min(1, "Please choose a year/grade").max(50),
    instructions: z.string().trim().max(2000, "Tutor instructions must be under 2000 characters").default(""),
    releaseAt: isoDate,
    dueAt: isoDate.nullable().optional(),
    classId: z.string({ required_error: "Please choose a class" }).uuid("Please choose a class"),
    audience: z.enum(["class", "selected"]).default("class"),
    studentIds: z.array(z.string().uuid()).max(500, "Select at most 500 students").optional(),
  })
  .refine((d) => new Date(d.releaseAt).getTime() < Date.now() + YEAR, {
    path: ["releaseAt"],
    message: "Release time must be within a year",
  })
  .refine((d) => d.audience !== "selected" || (d.studentIds?.length ?? 0) > 0, {
    path: ["studentIds"],
    message: "Select at least one student",
  })
  .transform((d) => ({
    ...d,
    // A release time in the past means "release now".
    releaseAt: new Date(Math.max(new Date(d.releaseAt).getTime(), Date.now() - 60_000)).toISOString(),
  }));

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

router.get(
  "/overview",
  rateLimits.analytics,
  asyncHandler(async (req, res) => {
    res.json(await analyticsService.overview(currentUser(req)));
  }),
);

router.get(
  "/assignments",
  rateLimits.analytics,
  asyncHandler(async (req, res) => {
    const q = parse(pageQuery.extend({ archived: z.enum(["true", "false"]).default("false") }), req.query);
    res.json(await analyticsService.listAssignments(currentUser(req), { ...q, archived: q.archived === "true" }));
  }),
);

router.post(
  "/assignments",
  asyncHandler(async (req, res) => {
    const input: CreateAssignmentInput = parse(createAssignmentSchema, req.body);
    res.status(201).json(await assignmentsService.create(currentUser(req), input));
  }),
);

router.get(
  "/assignments/:id",
  rateLimits.analytics,
  asyncHandler(async (req, res) => {
    res.json(await assignmentsService.detail(currentUser(req), parse(uuidParam, req.params.id)));
  }),
);

router.post(
  "/assignments/:id/archive",
  asyncHandler(async (req, res) => {
    res.json(await assignmentsService.setArchived(currentUser(req), parse(uuidParam, req.params.id), true));
  }),
);

router.post(
  "/assignments/:id/unarchive",
  asyncHandler(async (req, res) => {
    res.json(await assignmentsService.setArchived(currentUser(req), parse(uuidParam, req.params.id), false));
  }),
);

const updateAssignmentSchema = z
  .object({
    topic: z.string().trim().min(3, "Topic must be at least 3 characters").max(200, "Topic is too long").optional(),
    subject: z.string().trim().min(2, "Please choose a subject").max(100).optional(),
    grade: z.string().trim().min(1, "Please choose a year/grade").max(50).optional(),
    instructions: z.string().trim().max(2000, "Tutor instructions must be under 2000 characters").optional(),
    releaseAt: isoDate.optional(),
    dueAt: isoDate.nullable().optional(),
  })
  .strict()
  .refine((d) => !d.releaseAt || new Date(d.releaseAt).getTime() < Date.now() + YEAR, {
    path: ["releaseAt"],
    message: "Release time must be within a year",
  });

router.patch(
  "/assignments/:id",
  asyncHandler(async (req, res) => {
    const input: UpdateAssignmentInput = parse(updateAssignmentSchema, req.body);
    res.json(await assignmentsService.update(currentUser(req), parse(uuidParam, req.params.id), input));
  }),
);

/** One student's transcript for an assignment the teacher owns. */
router.get(
  "/assignments/:id/students/:studentId/messages",
  asyncHandler(async (req, res) => {
    const assignment = await loadOwnedAssignment(currentUser(req), parse(uuidParam, req.params.id));
    const studentId = parse(uuidParam, req.params.studentId);
    const rows = await tutoringRepository.listConversation(assignment.id, studentId, 500);
    const items: ChatMessageDto[] = rows.map(toChatMessageDto);
    res.json(items);
  }),
);

router.get(
  "/students",
  rateLimits.analytics,
  asyncHandler(async (req, res) => {
    const q = parse(pageQuery.extend({ search: z.string().trim().max(100).optional() }), req.query);
    const result: Paginated<TeacherStudentRow> = await analyticsService.students(currentUser(req), q);
    res.json(result);
  }),
);

router.use("/classes", teacherClassRoutes);

export default router;
