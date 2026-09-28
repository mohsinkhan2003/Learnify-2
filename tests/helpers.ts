import crypto from "crypto";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app";

let app: Express | null = null;
export const getApp = () => (app ??= createApp());

export const ORIGIN = "http://test.local";

/** A cookie-keeping client that sends a trusted Origin on every request (CSRF check). */
export function client() {
  const agent = request.agent(getApp());
  const withOrigin = <T extends request.Test>(t: T) => t.set("Origin", ORIGIN);
  return {
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => withOrigin(agent.post(url)).send(body ?? {}),
    del: (url: string, body?: object) => withOrigin(agent.delete(url)).send(body ?? {}),
    raw: agent,
  };
}

export type Client = ReturnType<typeof client>;

const uniq = () => crypto.randomBytes(5).toString("hex");

export async function signUp(role: "teacher" | "student", school = "Oak High", extra: Record<string, string> = {}) {
  const c = client();
  const email = `${role}-${uniq()}@example.com`;
  const res = await c.post("/api/auth/signup", {
    email,
    password: "correct horse battery",
    name: `${role === "teacher" ? "Teacher" : "Student"} ${uniq()}`,
    role,
    school,
    ...(role === "teacher" ? { subject: "Biology" } : {}),
    ...extra,
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { c, user: res.body as { id: string; name: string; email: string }, email };
}

export async function createAssignment(teacher: Client, overrides: Record<string, unknown> = {}) {
  const res = await teacher.post("/api/teacher/assignments", {
    topic: "Photosynthesis",
    subject: "Biology",
    grade: "Year 10",
    instructions: "Focus on light-dependent reactions.",
    releaseAt: new Date(Date.now() - 1000).toISOString(),
    audience: "school",
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`create assignment failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

export const newMessageId = () => crypto.randomUUID();

export async function say(student: Client, assignmentId: string, content: string) {
  return student.post(`/api/student/assignments/${assignmentId}/messages`, { content, source: "text", clientMessageId: newMessageId() });
}
