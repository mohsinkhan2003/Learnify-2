import webpush from "web-push";
import type { Assignment, PushSubscription } from "@shared/schema";
import { storage } from "./storage";
import { config } from "./config";
import { log } from "./logger";

let enabled = false;

export function initPush(): void {
  const { publicKey, privateKey, subject } = config.vapid;
  if (!publicKey || !privateKey) {
    log.warn("[Push] VAPID keys not set - push notifications disabled");
    return;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    enabled = true;
  } catch (error: any) {
    log.warn("[Push] Invalid VAPID configuration - push notifications disabled:", error.message);
  }
}

export function isPushEnabled(): boolean {
  return enabled;
}

async function sendToAll(subscriptions: PushSubscription[], payload: string): Promise<number> {
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dhKey, auth: sub.authKey } },
          payload,
        );
      } catch (error: any) {
        // Expired or unsubscribed endpoints are removed so we stop retrying them.
        if (error.statusCode === 404 || error.statusCode === 410) {
          await storage.deletePushSubscription(sub.endpoint);
        }
        throw error;
      }
    }),
  );
  return results.filter((r) => r.status === "fulfilled").length;
}

/** Notifies students at the assignment's school that new homework is available. */
export async function notifyNewAssignment(assignment: Assignment): Promise<void> {
  if (enabled) {
    const subscriptions = await storage.getStudentSubscriptions(assignment.teacherSchool);
    if (subscriptions.length > 0) {
      const payload = JSON.stringify({
        title: "New Homework Available!",
        body: `${assignment.topic} - ${assignment.subject} (${assignment.grade})`,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { assignmentId: assignment.id, url: `/chat/${assignment.id}` },
      });
      const sent = await sendToAll(subscriptions, payload);
      log.info(`[Push] Assignment ${assignment.id}: ${sent}/${subscriptions.length} notifications delivered`);
    }
  }
  await storage.markAssignmentNotificationSent(assignment.id);
}

let running = false;

/** Sends notifications for every assignment whose scheduled time has arrived. */
export async function processPendingNotifications(): Promise<void> {
  if (running) return; // don't overlap with a slow previous run
  running = true;
  try {
    const pending = await storage.getAssignmentsPendingNotification();
    for (const assignment of pending) {
      try {
        await notifyNewAssignment(assignment);
      } catch (error) {
        log.error(`[Push] Failed to notify for assignment ${assignment.id}:`, error);
      }
    }
  } finally {
    running = false;
  }
}
