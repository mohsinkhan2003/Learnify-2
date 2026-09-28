import multer from "multer";
import type { User } from "@shared/schema";
import { config } from "../../config/env";
import { AppError, badRequest, tooManyRequests } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { getAiProvider } from "../../ai/provider";
import { audioSecondsLast24h, recordUsage } from "../../ai/usage";

/**
 * Server-side speech-to-text fallback for browsers without the Web Speech API.
 *
 * Privacy: audio is held in memory only for the duration of the request and is never written
 * to disk or stored — only the transcript is kept (as the student's chat message).
 * Security: size-capped upload, MIME allowlist, magic-byte sniffing (the browser's filename and
 * declared type are not trusted), per-user daily audio budget.
 */
const FORMATS: { mime: string; ext: string; sniff: (b: Buffer) => boolean }[] = [
  { mime: "audio/webm", ext: "webm", sniff: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  { mime: "audio/ogg", ext: "ogg", sniff: (b) => b.subarray(0, 4).toString("latin1") === "OggS" },
  {
    mime: "audio/wav",
    ext: "wav",
    sniff: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WAVE",
  },
  { mime: "audio/mp4", ext: "m4a", sniff: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" },
  {
    mime: "audio/mpeg",
    ext: "mp3",
    sniff: (b) => b.subarray(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
];

const ALLOWED_DECLARED = /^(audio\/(webm|ogg|wav|x-wav|wave|mp4|x-m4a|m4a|aac|mpeg|mp3)|video\/webm)(;.*)?$/i;

export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.ai.maxAudioBytes, files: 1, fields: 2, fieldSize: 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DECLARED.test(file.mimetype)) return cb(badRequest("Unsupported audio format", undefined, "UNSUPPORTED_AUDIO"));
    cb(null, true);
  },
}).single("audio");

export function detectAudioFormat(buffer: Buffer) {
  return FORMATS.find((f) => buffer.length >= 12 && f.sniff(buffer)) ?? null;
}

export async function transcribe(student: User, buffer: Buffer | undefined): Promise<string> {
  if (!config.ai.transcriptionEnabled) throw new AppError(404, "TRANSCRIPTION_DISABLED", "Voice transcription is not available");
  if (!buffer || buffer.length === 0) throw badRequest("No audio received", undefined, "NO_AUDIO");

  const format = detectAudioFormat(buffer);
  if (!format) throw badRequest("Unsupported audio format", undefined, "UNSUPPORTED_AUDIO");

  if ((await audioSecondsLast24h(student.id)) >= config.ai.dailyAudioSecondsPerUser) {
    throw tooManyRequests("You've reached today's voice limit. You can keep going by typing.", "DAILY_AUDIO_LIMIT");
  }

  let result;
  try {
    result = await getAiProvider().transcribe(buffer, format.mime, format.ext);
  } catch (error) {
    logger.error({ err: error, userId: student.id }, "Transcription failed");
    throw new AppError(503, "TRANSCRIPTION_FAILED", "We couldn't transcribe that. Please try again or type your answer.");
  }

  const seconds = result.durationSeconds ?? Math.round(buffer.length / 16_000);
  await recordUsage({ userId: student.id, kind: "transcription", model: result.model, audioSeconds: seconds });

  if (seconds > config.ai.maxAudioSeconds + 5) {
    throw badRequest("That recording is too long. Please keep answers under a minute.", undefined, "AUDIO_TOO_LONG");
  }
  const text = result.text.trim().slice(0, 2000);
  if (!text) throw new AppError(422, "EMPTY_TRANSCRIPT", "We didn't catch any words. Please try again.");
  return text;
}
