import type { Assignment, ChatMessage } from "@shared/schema";
import { config } from "../config/env";
import { logger } from "../lib/logger";
import { AppError } from "../lib/errors";
import { getAiProvider, type ChatTurnMessage } from "./provider";
import { buildSystemPrompt, buildTurnDirective, LEAK_CANARY, PROMPT_VERSION, RETRY_DIRECTIVE, SAFE_REPLIES } from "./prompts";
import { parseTutorOutput, type TutorOutput } from "./schemas";
import type { TurnPlan } from "./state-machine";
import { recordUsage } from "./usage";

const MAX_HISTORY_CHARS_PER_MESSAGE = 800;

export type TutorTurnResult =
  | { kind: "ok"; output: TutorOutput }
  /** Student input was blocked by moderation; reply with a canned message, no model call. */
  | { kind: "input_flagged"; reply: string; selfHarm: boolean }
  /** Model output was unsafe or leaked instructions; reply with a canned message, keep state. */
  | { kind: "output_rejected"; reply: string };

/**
 * Bounded context: the system prompt, the last N messages (each truncated), the new student
 * message, then the turn directive. Older turns are dropped — the persisted state machine,
 * not the transcript, carries session progress, so nothing essential is lost.
 */
export function buildMessages(assignment: Assignment, history: ChatMessage[], studentMessage: string, plan: TurnPlan): ChatTurnMessage[] {
  const recent = history.slice(-config.ai.contextMessages).map<ChatTurnMessage>((m) => ({
    role: m.role === "ai" ? "assistant" : "user",
    content: m.content.slice(0, MAX_HISTORY_CHARS_PER_MESSAGE),
  }));
  return [
    { role: "system", content: buildSystemPrompt(assignment) },
    ...recent,
    { role: "user", content: studentMessage },
    { role: "system", content: buildTurnDirective(plan) },
  ];
}

async function moderateSafely(text: string, userId: string): Promise<{ flagged: boolean; selfHarm: boolean }> {
  try {
    const result = await getAiProvider().moderate(text);
    return result ?? { flagged: false, selfHarm: false };
  } catch (error) {
    // Fail open on moderation outages: the system prompt still enforces safety rules.
    logger.warn({ err: error, userId }, "Moderation check failed; continuing without it");
    return { flagged: false, selfHarm: false };
  }
}

/** On the summary turn (when the session will finish), the model must supply the summary. */
function needsSummary(plan: TurnPlan, output: TutorOutput): boolean {
  if (plan.kind !== "summary") return false;
  const staysOnQuestion = (!output.on_task && plan.allowOffTask) || (output.next_step === "hint" && plan.allowHint);
  return !staysOnQuestion && (output.summary?.trim().length ?? 0) < 60;
}

export async function runTutorTurn(params: {
  userId: string;
  assignment: Assignment;
  history: ChatMessage[];
  studentMessage: string;
  plan: TurnPlan;
}): Promise<TutorTurnResult> {
  const { userId, assignment, history, studentMessage, plan } = params;
  const log = logger.child({ userId, assignmentId: assignment.id, promptVersion: PROMPT_VERSION, turn: plan.kind });

  const inputCheck = await moderateSafely(studentMessage, userId);
  if (inputCheck.flagged) {
    log.warn({ selfHarm: inputCheck.selfHarm }, "Student message flagged by moderation");
    return {
      kind: "input_flagged",
      reply: inputCheck.selfHarm ? SAFE_REPLIES.selfHarm : SAFE_REPLIES.flaggedInput,
      selfHarm: inputCheck.selfHarm,
    };
  }

  const provider = getAiProvider();
  const messages = buildMessages(assignment, history, studentMessage, plan);

  let output: TutorOutput | null = null;
  for (let attempt = 0; attempt < 2 && !output; attempt++) {
    const request = attempt === 0 ? messages : [...messages, { role: "system" as const, content: RETRY_DIRECTIVE }];
    let result;
    try {
      result = await provider.generateTurn(request);
    } catch (error) {
      log.error({ err: error, attempt }, "Tutor model call failed");
      throw new AppError(
        503,
        "AI_UNAVAILABLE",
        "The tutor is having trouble responding right now. Your message wasn't sent — please try again.",
      );
    }
    await recordUsage({
      userId,
      assignmentId: assignment.id,
      kind: "chat",
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    });
    output = parseTutorOutput(result.raw);
    if (!output) log.warn({ attempt }, "Tutor returned invalid structured output");
    else if (needsSummary(plan, output)) {
      // The summary turn must carry a real summary; otherwise ask again rather than finish without one.
      log.warn({ attempt }, "Tutor summary turn returned no summary");
      output = null;
    }
  }

  if (!output) {
    throw new AppError(503, "AI_INVALID_RESPONSE", "The tutor got muddled. Your message wasn't sent — please try again.");
  }

  if (output.message.includes(LEAK_CANARY)) {
    log.warn("Tutor output contained the leak canary; replacing");
    return { kind: "output_rejected", reply: SAFE_REPLIES.unsafeOutput };
  }
  const outputCheck = await moderateSafely(output.message, userId);
  if (outputCheck.flagged) {
    log.warn("Tutor output flagged by moderation; replacing");
    return { kind: "output_rejected", reply: SAFE_REPLIES.unsafeOutput };
  }

  return { kind: "ok", output };
}
