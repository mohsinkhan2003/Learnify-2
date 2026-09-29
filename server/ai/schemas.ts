import { z } from "zod";
import { ANSWER_ASSESSMENTS } from "@shared/tutor";

/**
 * Structured output the model must return on every tutor turn. The server validates it and
 * uses the signals (next_step, assessment) as *inputs* to the state machine — the model never
 * sets application state directly.
 */
export const NEXT_STEPS = ["advance", "hint", "wait_for_readiness"] as const;

export const tutorOutputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  next_step: z.enum(NEXT_STEPS),
  assessment: z.enum(ANSWER_ASSESSMENTS),
  misconception: z.string().trim().max(300).nullable(),
  safety_concern: z.boolean(),
  /** Did the student's latest message actually respond to the tutor's last question? */
  on_task: z.boolean(),
  /** The end-of-session summary: required on the summary turn, otherwise null. */
  summary: z.string().trim().max(1500).nullable(),
});

export type TutorOutput = z.infer<typeof tutorOutputSchema>;

/** JSON Schema passed to the model (OpenAI strict structured outputs). Mirrors tutorOutputSchema. */
export const tutorOutputJsonSchema = {
  name: "tutor_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["message", "next_step", "assessment", "misconception", "safety_concern", "on_task", "summary"],
    properties: {
      message: { type: "string", description: "What the tutor says to the student. Plain spoken English, no markdown." },
      next_step: {
        type: "string",
        enum: [...NEXT_STEPS],
        description:
          "advance = move on as instructed; hint = gave a hint and re-asked the same question; wait_for_readiness = student is not ready yet",
      },
      assessment: {
        type: "string",
        enum: [...ANSWER_ASSESSMENTS],
        description: "Assessment of the student's latest answer to a content question; not_applicable for small talk/readiness",
      },
      misconception: {
        type: ["string", "null"],
        description: "One short sentence naming a misconception in the student's latest answer, or null",
      },
      safety_concern: {
        type: "boolean",
        description: "true if the student's message suggests risk of harm, distress, abuse or a safeguarding issue",
      },
      on_task: {
        type: "boolean",
        description:
          "true if the student's latest message responds to your last question (an answer, a guess, a wrong answer or 'I don't know'); false for greetings, small talk, 'can you hear me', off-topic or empty messages",
      },
      summary: {
        type: ["string", "null"],
        description: "Only on the summary turn: 3-4 spoken sentences summarising the session. Otherwise null.",
      },
    },
  },
} as const;

export function parseTutorOutput(raw: string): TutorOutput | null {
  try {
    const result = tutorOutputSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
