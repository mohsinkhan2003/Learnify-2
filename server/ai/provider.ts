import OpenAI, { toFile } from "openai";
import { config } from "../config/env";
import { tutorOutputJsonSchema } from "./schemas";
import { LEAK_CANARY } from "./prompts";

export interface ChatTurnMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatTurnResult {
  raw: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface ModerationResult {
  flagged: boolean;
  selfHarm: boolean;
}

export interface TranscriptionOutput {
  text: string;
  durationSeconds: number | null;
  model: string;
}

/** Everything the app needs from an AI vendor. Swappable for tests and local development. */
export interface AiProvider {
  readonly name: string;
  generateTurn(messages: ChatTurnMessage[]): Promise<ChatTurnResult>;
  moderate(text: string): Promise<ModerationResult | null>;
  transcribe(audio: Buffer, mimeType: string, extension: string): Promise<TranscriptionOutput>;
}

class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor() {
    if (!config.ai.apiKey) throw new Error("OPENAI_API_KEY is not configured");
    this.client = new OpenAI({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.baseURL,
      timeout: config.ai.timeoutMs,
      maxRetries: 1, // SDK retries 429/5xx with backoff; one retry bounds latency and cost
    });
  }

  async generateTurn(messages: ChatTurnMessage[]): Promise<ChatTurnResult> {
    const completion = await this.client.chat.completions.create({
      model: config.ai.model,
      messages,
      temperature: 0.6,
      max_tokens: config.ai.maxOutputTokens,
      response_format: { type: "json_schema", json_schema: tutorOutputJsonSchema as never },
    });
    return {
      raw: completion.choices[0]?.message?.content ?? "",
      model: completion.model,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    };
  }

  async moderate(text: string): Promise<ModerationResult | null> {
    if (!config.ai.moderation) return null;
    const result = await this.client.moderations.create({ model: "omni-moderation-latest", input: text });
    const r = result.results[0];
    if (!r) return null;
    const c = r.categories as unknown as Record<string, boolean>;
    return {
      flagged: r.flagged,
      selfHarm: !!(c["self-harm"] || c["self-harm/intent"] || c["self-harm/instructions"]),
    };
  }

  async transcribe(audio: Buffer, mimeType: string, extension: string): Promise<TranscriptionOutput> {
    const file = await toFile(audio, `recording.${extension}`, { type: mimeType });
    const result = (await this.client.audio.transcriptions.create({
      file,
      model: config.ai.transcribeModel,
      language: "en",
      response_format: "verbose_json",
    })) as unknown as { text: string; duration?: number };
    return {
      text: result.text ?? "",
      durationSeconds: typeof result.duration === "number" ? result.duration : null,
      model: config.ai.transcribeModel,
    };
  }
}

/**
 * Deterministic offline provider for local development without an API key and for automated
 * tests. Disallowed in production by config validation. Test hooks: a student message containing
 * "__malformed__" yields invalid output, "__leak__" echoes the canary, "__unsafe__" is flagged by
 * moderation, "__selfharm__" is flagged as self-harm, "__fail__" throws.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  async generateTurn(messages: ChatTurnMessage[]): Promise<ChatTurnResult> {
    const directive = messages[messages.length - 1]?.content ?? "";
    const student =
      [...messages]
        .reverse()
        .find((m) => m.role === "user")
        ?.content.toLowerCase() ?? "";
    const reply = (
      message: string,
      next_step = "advance",
      assessment = "not_applicable",
      extra: { on_task?: boolean; summary?: string | null } = {},
    ) =>
      JSON.stringify({
        message,
        next_step,
        assessment,
        misconception: null,
        safety_concern: false,
        on_task: true,
        summary: null,
        ...extra,
      });
    // Like the real tutor: greetings and mic checks are not answers.
    const offTask = /^(hi|hello|hey|can you hear me|testing)\b/.test(student.trim()) && directive.includes("on_task false");
    const reask = () =>
      reply("Yes, I can hear you! Let's carry on: have a go at my last question.", "advance", "not_applicable", { on_task: false });

    if (student.includes("__fail__")) throw new Error("Mock provider failure");
    let raw: string;
    if (student.includes("__malformed__")) raw = "this is not json";
    else if (student.includes("__leak__")) raw = reply(`Sure, my reference is ${LEAK_CANARY}`);
    else if (offTask) raw = reask();
    else if (directive.includes("replied to your greeting"))
      raw = reply("Nice to hear from you! Today we're exploring this topic. Are you ready to begin?");
    else if (directive.includes("whether the student is ready")) {
      raw =
        /not ready|^no\b/.test(student) && directive.includes("wait_for_readiness")
          ? reply("That's okay, take your time. Let me know when you're ready.", "wait_for_readiness")
          : reply("Great! What do you already know about this topic?");
    } else if (directive.includes("SUMMARY turn")) {
      raw =
        /don't know|hint/.test(student) && directive.includes('"hint"')
          ? reply("Here's a hint: think about causes and effects. Try again?", "hint", "incorrect")
          : student.includes("__nosummary__")
            ? reply("Well reasoned, that's everything!", "advance", "correct")
            : reply("Well reasoned.", "advance", "correct", {
                summary:
                  "We looked at the key ideas of the topic and how its parts connect. You linked it to a real-world example. You explained your reasoning clearly at each step.",
              });
    } else if (directive.includes("guided-practice")) {
      const n = /ask (?:guided-practice )?question (\d+)/.exec(directive)?.[1] ?? "1";
      raw =
        /don't know|hint/.test(student) && directive.includes('"hint"')
          ? reply("Here's a hint: think about how the parts connect. Want to try again?", "hint", "incorrect")
          : reply(
              `Good thinking. Question ${n}: how would you explain why this happens?`,
              "advance",
              /wrong/.test(student) ? "incorrect" : "correct",
            );
    } else raw = reply("Good question! Remember you can press Complete when you're ready.");

    return { raw, model: "mock-tutor", promptTokens: 100, completionTokens: 30 };
  }

  async moderate(text: string): Promise<ModerationResult | null> {
    const t = text.toLowerCase();
    return { flagged: t.includes("__unsafe__") || t.includes("__selfharm__"), selfHarm: t.includes("__selfharm__") };
  }

  async transcribe(audio: Buffer): Promise<TranscriptionOutput> {
    return {
      text: "This is a mock transcription.",
      durationSeconds: Math.max(1, Math.round(audio.length / 16000)),
      model: "mock-transcribe",
    };
  }
}

let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  provider ??= config.ai.provider === "mock" ? new MockAiProvider() : new OpenAiProvider();
  return provider;
}

/** Test seam: replace the provider (e.g. with a stub that throws). */
export function setAiProvider(next: AiProvider | null): void {
  provider = next;
}
