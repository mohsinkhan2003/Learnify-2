import { Router } from "express";
import { z } from "zod";
import type { SendMessageInput } from "@shared/api";
import { asyncHandler, parse, uuidParam } from "../../lib/http";
import { currentUser, requireRole } from "../../middleware/auth";
import { rateLimits } from "../../middleware/rate-limit";
import { MAX_MESSAGE_LENGTH, tutoringService } from "./tutoring.service";
import { audioUpload, transcribe } from "./transcription";

const router = Router();
router.use(requireRole("student"));

const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Please write or say something first")
    .max(MAX_MESSAGE_LENGTH, `Messages must be under ${MAX_MESSAGE_LENGTH} characters`),
  source: z.enum(["text", "voice"]).default("text"),
  clientMessageId: z.string().uuid("Invalid message id"),
});

router.get(
  "/assignments",
  asyncHandler(async (req, res) => {
    res.json(await tutoringService.listForStudent(currentUser(req)));
  }),
);

router.get(
  "/assignments/:id",
  asyncHandler(async (req, res) => {
    res.json(await tutoringService.getSession(currentUser(req), parse(uuidParam, req.params.id)));
  }),
);

router.post(
  "/assignments/:id/session",
  asyncHandler(async (req, res) => {
    res.json(await tutoringService.start(currentUser(req), parse(uuidParam, req.params.id)));
  }),
);

router.post(
  "/assignments/:id/messages",
  rateLimits.tutorTurn,
  asyncHandler(async (req, res) => {
    const input: SendMessageInput = parse(sendMessageSchema, req.body);
    res.json(await tutoringService.sendMessage(currentUser(req), parse(uuidParam, req.params.id), input));
  }),
);

router.post(
  "/assignments/:id/heartbeat",
  asyncHandler(async (req, res) => {
    res.json(await tutoringService.heartbeat(currentUser(req), parse(uuidParam, req.params.id)));
  }),
);

router.post(
  "/assignments/:id/complete",
  asyncHandler(async (req, res) => {
    res.json(await tutoringService.complete(currentUser(req), parse(uuidParam, req.params.id)));
  }),
);

router.post(
  "/transcriptions",
  rateLimits.transcription,
  audioUpload,
  asyncHandler(async (req, res) => {
    res.json({ text: await transcribe(currentUser(req), req.file?.buffer) });
  }),
);

export default router;
