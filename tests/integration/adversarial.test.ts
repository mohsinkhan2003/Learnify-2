import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { sessions } from "../../shared/schema";
import { db } from "../../server/db";
import { MockAiProvider, setAiProvider } from "../../server/ai/provider";
import { createAssignment, getApp, newMessageId, ORIGIN, say, signUp } from "../helpers";

describe("adversarial scenarios", () => {
  afterEach(() => setAiProvider(null));

  it("rejects an expired session", async () => {
    const { c, user } = await signUp("student");
    expect((await c.get("/api/auth/me")).status).toBe(200);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id));
    expect((await c.get("/api/auth/me")).status).toBe(401);
    expect((await c.get("/api/auth/session")).body).toEqual({ user: null });
  });

  it("reports failed transcription without charging state", async () => {
    setAiProvider(
      new (class extends MockAiProvider {
        async transcribe(): Promise<never> {
          throw new Error("upstream down");
        }
      })(),
    );
    const { c } = await signUp("student");
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(5000, 1)]);
    const res = await c.raw
      .post("/api/student/transcriptions")
      .set("Origin", ORIGIN)
      .attach("audio", webm, { filename: "a.webm", contentType: "audio/webm" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("TRANSCRIPTION_FAILED");
  });

  it("rejects empty transcripts with a friendly error", async () => {
    setAiProvider(
      new (class extends MockAiProvider {
        async transcribe() {
          return { text: "   ", durationSeconds: 2, model: "mock" };
        }
      })(),
    );
    const { c } = await signUp("student");
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(5000, 1)]);
    const res = await c.raw
      .post("/api/student/transcriptions")
      .set("Origin", ORIGIN)
      .attach("audio", webm, { filename: "a.webm", contentType: "audio/webm" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EMPTY_TRANSCRIPT");
  });

  it("cannot complete without reaching the summary, even by replaying or racing requests", async () => {
    const teacher = (await signUp("teacher")).c;
    const student = (await signUp("student")).c;
    const { id } = await createAssignment(teacher);
    await student.post(`/api/student/assignments/${id}/session`);
    const results = await Promise.all(Array.from({ length: 5 }, () => student.post(`/api/student/assignments/${id}/complete`)));
    expect(results.every((r) => r.status === 409)).toBe(true);
  });

  it("does not let a student reuse another student's clientMessageId to read their exchange", async () => {
    const teacher = (await signUp("teacher")).c;
    const a = (await signUp("student")).c;
    const b = (await signUp("student")).c;
    const { id } = await createAssignment(teacher);
    await a.post(`/api/student/assignments/${id}/session`);
    await b.post(`/api/student/assignments/${id}/session`);
    const clientMessageId = newMessageId();
    const first = await a.post(`/api/student/assignments/${id}/messages`, { content: "secret answer", source: "text", clientMessageId });
    expect(first.status).toBe(200);
    const hijack = await b.post(`/api/student/assignments/${id}/messages`, { content: "hi", source: "text", clientMessageId });
    expect(hijack.status).toBe(200);
    expect(hijack.body.studentMessage.content).toBe("hi"); // B gets their own new turn, not A's
  });

  it("caps heartbeat credit at wall-clock time", async () => {
    const teacher = (await signUp("teacher")).c;
    const student = (await signUp("student")).c;
    const { id } = await createAssignment(teacher);
    await student.post(`/api/student/assignments/${id}/session`);
    const beats = await Promise.all(Array.from({ length: 20 }, () => student.post(`/api/student/assignments/${id}/heartbeat`)));
    const max = Math.max(...beats.map((b) => b.body.totalTimeSeconds ?? 0));
    expect(max).toBeLessThanOrEqual(2);
  });

  it("returns 401 JSON (not HTML) for unauthenticated API calls and 404 JSON for unknown API paths", async () => {
    const res = await request(getApp()).get("/api/student/assignments");
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toMatch(/json/);
    const missing = await request(getApp()).get("/api/does-not-exist");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });

  it("keeps working after many rapid messages (turn lock + limits, no 500s)", async () => {
    const teacher = (await signUp("teacher")).c;
    const student = (await signUp("student")).c;
    const { id } = await createAssignment(teacher);
    await student.post(`/api/student/assignments/${id}/session`);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => say(student, id, `burst ${i}`)));
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(results.some((r) => r.status === 200)).toBe(true);
  });
});
