import { and, eq, gte, sql } from "drizzle-orm";
import { aiUsage } from "@shared/schema";
import { db } from "../db";
import { logger } from "../lib/logger";

export interface UsageRecord {
  userId: string;
  assignmentId?: string | null;
  kind: "chat" | "transcription" | "moderation";
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  audioSeconds?: number;
}

/** Records one AI call. Failures are logged, never surfaced to the student. */
export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      userId: record.userId,
      assignmentId: record.assignmentId ?? null,
      kind: record.kind,
      model: record.model,
      promptTokens: record.promptTokens ?? 0,
      completionTokens: record.completionTokens ?? 0,
      audioSeconds: Math.round(record.audioSeconds ?? 0),
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to record AI usage");
  }
}

const since24h = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

export async function chatCallsLast24h(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.kind, "chat"), gte(aiUsage.createdAt, since24h())));
  return row?.n ?? 0;
}

export async function audioSecondsLast24h(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${aiUsage.audioSeconds}), 0)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.kind, "transcription"), gte(aiUsage.createdAt, since24h())));
  return row?.n ?? 0;
}
