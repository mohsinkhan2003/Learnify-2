import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config/env";
import { logger } from "./logger";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const isEmailEnabled = () => !!config.email.from && !!(config.email.resendApiKey || config.email.smtp);

let smtp: Transporter | undefined;
function smtpTransport(): Transporter {
  const s = config.email.smtp!;
  smtp ??= nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: 10_000,
    socketTimeout: 10_000,
  });
  return smtp;
}

/**
 * Sends transactional email through Resend's HTTP API or any SMTP server (e.g. Gmail with an
 * app password). Without configuration, development logs the message instead; production drops
 * it (callers never reveal whether an email was sent).
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!isEmailEnabled()) {
    if (config.env === "development") logger.info({ to: email.to, subject: email.subject, text: email.text }, "Email (dev: not sent)");
    return false;
  }
  try {
    if (config.email.resendApiKey) {
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
    }
    await smtpTransport().sendMail({ from: config.email.from, to: email.to, subject: email.subject, text: email.text, html: email.html });
    return true;
  } catch (error) {
    logger.error({ err: error }, "Email sending failed");
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
