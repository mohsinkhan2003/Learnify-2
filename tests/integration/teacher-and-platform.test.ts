import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createAssignment, getApp, ORIGIN, say, signUp } from "../helpers";

describe("teacher dashboard & analytics", () => {
  it("shows an empty overview for a new teacher", async () => {
    const { c } = await signUp("teacher", `Empty School ${Date.now()}`);
    const res = await c.get("/api/teacher/overview");
    expect(res.status).toBe(200);
    expect(res.body.metrics).toMatchObject({ activeAssignments: 0, studentsParticipating: 0, completionRate: null, needsAttention: 0 });
    expect(res.body.attention).toEqual([]);
  });

  it("computes stats from real stored progress", async () => {
    const school = `Stats School ${Date.now()}`;
    const teacher = (await signUp("teacher", school)).c;
    const s1 = (await signUp("student", school)).c;
    await signUp("student", school); // eligible but never starts
    const { id } = await createAssignment(teacher);
    await s1.post(`/api/student/assignments/${id}/session`);
    await say(s1, id, "hello");

    const detail = await teacher.get(`/api/teacher/assignments/${id}`);
    expect(detail.body.stats).toMatchObject({ eligible: 2, started: 1, completed: 0 });
    expect(detail.body.notStartedTotal).toBe(1);
    expect(detail.body.progress[0]).toMatchObject({ messageCount: 1, status: "in_progress" });

    const overview = await teacher.get("/api/teacher/overview");
    expect(overview.body.metrics).toMatchObject({ activeAssignments: 1, studentsParticipating: 1, completionRate: 0 });

    const list = await teacher.get("/api/teacher/assignments?limit=1");
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].stats.eligible).toBe(2);

    const students = await teacher.get("/api/teacher/students");
    expect(students.body.items).toHaveLength(2);
  });

  it("validates assignment input and date ordering", async () => {
    const teacher = (await signUp("teacher")).c;
    expect((await teacher.post("/api/teacher/assignments", { topic: "x" })).status).toBe(400);
    const badDue = await teacher.post("/api/teacher/assignments", {
      topic: "Enzymes",
      subject: "Biology",
      grade: "Year 10",
      instructions: "",
      releaseAt: new Date(Date.now() + 3600_000).toISOString(),
      dueAt: new Date().toISOString(),
    });
    expect(badDue.status).toBe(400);
    expect(badDue.body.error.code).toBe("INVALID_DUE_DATE");
  });

  it("paginates assignment lists", async () => {
    const teacher = (await signUp("teacher")).c;
    for (let i = 0; i < 3; i++) await createAssignment(teacher, { topic: `Topic ${i}` });
    const p1 = await teacher.get("/api/teacher/assignments?limit=2");
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextOffset).toBe(2);
    const p2 = await teacher.get("/api/teacher/assignments?limit=2&offset=2");
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.nextOffset).toBeNull();
  });
});

describe("push subscriptions", () => {
  it("requires auth, validates, and rejects non-push endpoints (SSRF)", async () => {
    const student = (await signUp("student")).c;
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", keys: { p256dh: "key", auth: "auth" } };
    expect((await request(getApp()).post("/api/push/subscriptions").set("Origin", ORIGIN).send(sub)).status).toBe(401);
    expect((await student.post("/api/push/subscriptions", sub)).status).toBe(201);
    const ssrf = await student.post("/api/push/subscriptions", { ...sub, endpoint: "http://169.254.169.254/latest/meta-data" });
    expect(ssrf.status).toBe(400);
    expect((await student.del("/api/push/subscriptions", { endpoint: sub.endpoint })).status).toBe(204);
    expect((await student.get("/api/push/public-key")).body).toEqual({ publicKey: null });
  });
});

describe("audio transcription", () => {
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20_000, 1)]);

  it("transcribes a valid recording (mock) and never trusts the declared type", async () => {
    const student = (await signUp("student")).c;
    const ok = await student.raw
      .post("/api/student/transcriptions")
      .set("Origin", ORIGIN)
      .attach("audio", webm, { filename: "../../etc/passwd", contentType: "audio/webm" });
    expect(ok.status).toBe(200);
    expect(ok.body.text).toBeTruthy();

    const fake = await student.raw
      .post("/api/student/transcriptions")
      .set("Origin", ORIGIN)
      .attach("audio", Buffer.from("#!/bin/sh\necho pwned\n".repeat(10)), { filename: "a.webm", contentType: "audio/webm" });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe("UNSUPPORTED_AUDIO");

    const wrongType = await student.raw
      .post("/api/student/transcriptions")
      .set("Origin", ORIGIN)
      .attach("audio", webm, { filename: "a.exe", contentType: "application/x-msdownload" });
    expect(wrongType.status).toBe(400);
  });

  it("rejects oversized uploads", async () => {
    const student = (await signUp("student")).c;
    const big = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(3 * 1024 * 1024 + 10)]);
    const res = await student.raw
      .post("/api/student/transcriptions")
      .set("Origin", ORIGIN)
      .attach("audio", big, { filename: "a.webm", contentType: "audio/webm" });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("AUDIO_TOO_LARGE");
  });
});

describe("rate limiting", () => {
  beforeAll(() => {
    process.env.ENABLE_RATE_LIMITS_IN_TEST = "1";
  });
  afterAll(() => {
    delete process.env.ENABLE_RATE_LIMITS_IN_TEST;
  });

  it("throttles repeated failed logins for one account", async () => {
    const app = getApp();
    const attempt = () =>
      request(app).post("/api/auth/login").set("Origin", ORIGIN).send({ email: "victim@example.com", password: "guess-guess" });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[11]).toBe(429);
  });
});

describe("request limits", () => {
  it("rejects oversized JSON bodies", async () => {
    const res = await request(getApp())
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "a@b.co", password: "x".repeat(100_000) });
    expect(res.status).toBe(413);
  });

  it("sets security headers", async () => {
    const res = await request(getApp()).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
    expect(res.headers["permissions-policy"]).toMatch(/microphone=\(self\)/);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
