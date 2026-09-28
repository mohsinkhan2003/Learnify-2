import { config } from "../config/env";
import { logger } from "./logger";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const isEmailEnabled = () => !!(config.email.resendApiKey && config.email.from);

/**
 * Sends transactional email via Resend's HTTP API (free tier available) when configured.
 * Without configuration, development logs the message instead; production drops it (the
 * caller never reveals whether an email was sent).
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!isEmailEnabled()) {
    if (config.env === "development") logger.info({ to: email.to, subject: email.subject, text: email.text }, "Email (dev: not sent)");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.email.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.email.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "Email provider rejected message");
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ err: error }, "Email sending failed");
    return false;
  }
}
