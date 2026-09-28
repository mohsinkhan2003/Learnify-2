import webpush from "web-push";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  assignments,
  assignmentStudents,
  pushSubscriptions,
  userPushSubscriptions,
  users,
  type Assignment,
  type PushSubscription,
} from "@shared/schema";
import { db } from "../db";
import { config } from "../config/env";
import { logger } from "../lib/logger";

let enabled = false;

export function initPush(): void {
  const { publicKey, privateKey, subject } = config.vapid;
  if (!publicKey || !privateKey) {
    logger.warn("VAPID keys not set — push notifications disabled");
    return;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    enabled = true;
  } catch (error) {
    logger.warn({ err: error }, "Invalid VAPID configuration — push notifications disabled");
  }
}

export const isPushEnabled = () => enabled;
export const vapidPublicKey = () => (enabled ? config.vapid.publicKey ?? null : null);

/**
 * Browsers only issue endpoints on their vendor push services. Restricting to these hosts stops
 * the subscription API from being used to make the server send requests to arbitrary URLs (SSRF).
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export async function saveSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }) {
  await db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(pushSubscriptions)
      .values({ endpoint: sub.endpoint, p256dhKey: sub.p256dh, authKey: sub.auth })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dhKey: sub.p256dh, authKey: sub.auth } })
      .returning();
    // A browser endpoint belongs to whoever last subscribed on that device (shared devices).
    await tx.delete(userPushSubscriptions).where(eq(userPushSubscriptions.subscriptionId, saved.id));
    await tx.insert(userPushSubscriptions).values({ userId, subscriptionId: saved.id });
  });
}

export async function removeSubscription(userId: string, endpoint: string) {
  const [sub] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).limit(1);
  if (!sub) return;
  await db
    .delete(userPushSubscriptions)
    .where(and(eq(userPushSubscriptions.subscriptionId, sub.id), eq(userPushSubscriptions.userId, userId)));
}

async function subscriptionsFor(assignment: Assignment): Promise<PushSubscription[]> {
  const base = db
    .select({ s: pushSubscriptions })
    .from(pushSubscriptions)
    .innerJoin(userPushSubscriptions, eq(userPushSubscriptions.subscriptionId, pushSubscriptions.id))
    .innerJoin(users, eq(users.id, userPushSubscriptions.userId));

  const rows =
    assignment.audience === "selected"
      ? await base.where(
          inArray(
            users.id,
            db.select({ id: assignmentStudents.studentId }).from(assignmentStudents).where(eq(assignmentStudents.assignmentId, assignment.id)),
          ),
        )
      : assignment.teacherSchool
        ? await base.where(and(eq(users.role, "student"), eq(users.school, assignment.teacherSchool)))
        : [];
  return rows.map((r) => r.s);
}

async function deliver(subs: PushSubscription[], payload: string): Promise<number> {
  let delivered = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dhKey, auth: sub.authKey } }, payload, {
          TTL: 24 * 60 * 60,
          urgency: "normal",
        });
        delivered++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The browser unsubscribed or the subscription expired: stop sending to it.
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          logger.warn({ status }, "Push delivery failed");
        }
      }
    }),
  );
  return delivered;
}

/**
 * Sends the "new homework" notification for an assignment exactly once. The UPDATE … RETURNING
 * claim makes this safe to call concurrently (immediate send + scheduler, several instances).
 * The payload avoids topic details because notifications can appear on lock screens.
 */
export async function notifyAssignmentReleased(assignmentId: string): Promise<void> {
  const [claimed] = await db
    .update(assignments)
    .set({ notificationSent: true })
    .where(
      and(
        eq(assignments.id, assignmentId),
        eq(assignments.notificationSent, false),
        isNull(assignments.archivedAt),
        lte(assignments.notificationTime, sql`now()`),
      ),
    )
    .returning();
  if (!claimed || !enabled) return;

  const subs = await subscriptionsFor(claimed);
  if (subs.length === 0) return;
  const payload = JSON.stringify({
    title: "New homework on Learnify",
    body: `You have new ${claimed.subject} homework${claimed.teacherName ? ` from ${claimed.teacherName}` : ""}.`,
    url: `/student/assignments/${claimed.id}`,
    tag: `assignment-${claimed.id}`,
  });
  const delivered = await deliver(subs, payload);
  logger.info({ assignmentId, delivered, total: subs.length }, "Assignment notification sent");
}

let running = false;

/** Scheduler tick: notify every assignment whose release time has passed. */
export async function processDueNotifications(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(eq(assignments.notificationSent, false), isNull(assignments.archivedAt), lte(assignments.notificationTime, sql`now()`)))
      .limit(50);
    for (const { id } of due) {
      await notifyAssignmentReleased(id).catch((err) => logger.error({ err, assignmentId: id }, "Notification failed"));
    }
  } finally {
    running = false;
  }
}
