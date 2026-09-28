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

const defaultClasses = new WeakMap<Client, { id: string; joinCode: string }>();

/** The teacher's default class (created on first use). */
export async function classOf(teacher: Client) {
  let cls = defaultClasses.get(teacher);
  if (!cls) {
    const res = await teacher.post("/api/teacher/classes", { name: `Class ${uniq()}` });
    if (res.status !== 201) throw new Error(`create class failed: ${res.status} ${JSON.stringify(res.body)}`);
    cls = res.body as { id: string; joinCode: string };
    defaultClasses.set(teacher, cls);
  }
  return cls;
}

/** Students join the teacher's default class with its join code. */
export async function enroll(teacher: Client, ...students: Client[]) {
  const { joinCode } = await classOf(teacher);
  for (const s of students) {
    const res = await s.post("/api/student/classes/join", { code: joinCode });
    if (res.status !== 201) throw new Error(`join failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

export async function createAssignment(teacher: Client, overrides: Record<string, unknown> = {}) {
  const { id: classId } = await classOf(teacher);
  const res = await teacher.post("/api/teacher/assignments", {
    classId,
    topic: "Photosynthesis",
    subject: "Biology",
    grade: "Year 10",
    instructions: "Focus on light-dependent reactions.",
    releaseAt: new Date(Date.now() - 1000).toISOString(),
    audience: "class",
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`create assignment failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

export const newMessageId = () => crypto.randomUUID();

export async function say(student: Client, assignmentId: string, content: string) {
  return student.post(`/api/student/assignments/${assignmentId}/messages`, { content, source: "text", clientMessageId: newMessageId() });
}
