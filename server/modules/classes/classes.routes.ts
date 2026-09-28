import { Router } from "express";
import { z } from "zod";
import { asyncHandler, parse, uuidParam } from "../../lib/http";
import { currentUser, requireRole } from "../../middleware/auth";
import { rateLimits } from "../../middleware/rate-limit";
import { classesService } from "./classes.service";

const name = z.string().trim().min(1, "Please name the class").max(100, "Class name is too long");
const subject = z.string().trim().max(100).nullable().optional();

/** Mounted at /api/teacher/classes (teacher role enforced by the parent router). */
export const teacherClassRoutes = Router();

teacherClassRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await classesService.list(currentUser(req)));
  }),
);

teacherClassRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    res.status(201).json(await classesService.create(currentUser(req), parse(z.object({ name, subject }), req.body)));
  }),
);

teacherClassRoutes.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await classesService.detail(currentUser(req), parse(uuidParam, req.params.id)));
  }),
);

teacherClassRoutes.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = parse(z.object({ name: name.optional(), subject, archived: z.boolean().optional() }), req.body);
    res.json(await classesService.update(currentUser(req), parse(uuidParam, req.params.id), input));
  }),
);

teacherClassRoutes.post(
  "/:id/code",
  asyncHandler(async (req, res) => {
    res.json(await classesService.regenerateCode(currentUser(req), parse(uuidParam, req.params.id)));
  }),
);

teacherClassRoutes.delete(
  "/:id/members/:studentId",
  asyncHandler(async (req, res) => {
    await classesService.removeMember(currentUser(req), parse(uuidParam, req.params.id), parse(uuidParam, req.params.studentId));
    res.status(204).end();
  }),
);

teacherClassRoutes.post(
  "/:id/members/:studentId/reset-link",
  rateLimits.passwordReset,
  asyncHandler(async (req, res) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.json(
      await classesService.resetLink(currentUser(req), parse(uuidParam, req.params.id), parse(uuidParam, req.params.studentId), origin),
    );
  }),
);

/** Mounted at /api/classes: public, for invite links (rate limited per IP against code guessing). */
export const publicClassRoutes = Router();

publicClassRoutes.get(
  "/invite/:code",
  rateLimits.invitePreview,
  asyncHandler(async (req, res) => {
    res.json(await classesService.invitePreview(parse(z.string().max(20), req.params.code)));
  }),
);

/** Mounted at /api/student/classes. */
export const studentClassRoutes = Router();
studentClassRoutes.use(requireRole("student"));

studentClassRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await classesService.listForStudent(currentUser(req)));
  }),
);

studentClassRoutes.post(
  "/join",
  rateLimits.joinClass,
  asyncHandler(async (req, res) => {
    const { code } = parse(z.object({ code: z.string().trim().min(1, "Enter your class code").max(20) }), req.body);
    res.status(201).json(await classesService.join(currentUser(req), code));
  }),
);
