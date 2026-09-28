import { beforeAll, describe, expect, it } from "vitest";
import { classOf, createAssignment, enroll, say, signUp, type Client } from "../helpers";

/**
 * Authorization boundaries: Student A ≠ Student B, Teacher A ≠ Teacher B, class membership
 * (not self-declared school names) decides visibility, selected audiences, scheduled/archived
 * visibility, and role separation.
 */
describe("authorization boundaries", () => {
  let teacherA: Client, teacherB: Client, studentA: Client, studentB: Client, sameSchoolOutsider: Client;
  let studentAId: string, studentBId: string;
  let assignment: string;

  beforeAll(async () => {
    teacherA = (await signUp("teacher", "Oak High")).c;
    teacherB = (await signUp("teacher", "Oak High")).c;
    const a = await signUp("student", "Oak High");
    const b = await signUp("student", "Oak High");
    studentA = a.c;
    studentB = b.c;
    studentAId = a.user.id;
    studentBId = b.user.id;
    // Claims the same school but never joined the class: must not see anything.
    sameSchoolOutsider = (await signUp("student", "Oak High")).c;
    await enroll(teacherA, studentA, studentB);
    assignment = (await createAssignment(teacherA)).id;
    await studentA.post(`/api/student/assignments/${assignment}/session`);
    await say(studentA, assignment, "I'm good thanks");
  });

  it("requires authentication for every protected area", async () => {
    const { client } = await import("../helpers");
    const anon = client();
    for (const url of [
      "/api/teacher/overview",
      "/api/teacher/assignments",
      "/api/teacher/classes",
      "/api/student/assignments",
      "/api/student/classes",
      `/api/student/assignments/${assignment}`,
    ]) {
      expect((await anon.get(url)).status, url).toBe(401);
    }
  });

  it("separates roles", async () => {
    expect((await studentA.get("/api/teacher/overview")).status).toBe(403);
    expect((await studentA.post("/api/teacher/assignments", {})).status).toBe(403);
    expect((await studentA.post("/api/teacher/classes", { name: "Hack" })).status).toBe(403);
    expect((await teacherA.get("/api/student/assignments")).status).toBe(403);
    expect((await teacherA.post("/api/student/classes/join", { code: "ABCD2345" })).status).toBe(403);
    expect((await teacherA.post(`/api/student/assignments/${assignment}/messages`, {})).status).toBe(403);
  });

  it("claiming the same school name no longer grants access (class membership is required)", async () => {
    const list = await sameSchoolOutsider.get("/api/student/assignments");
    expect(list.body.some((a: { id: string }) => a.id === assignment)).toBe(false);
    expect((await sameSchoolOutsider.get(`/api/student/assignments/${assignment}`)).status).toBe(404);
    expect((await say(sameSchoolOutsider, assignment, "hello")).status).toBe(404);
  });

  it("teacher B cannot see or manage teacher A's assignments or classes", async () => {
    const { id: classId } = await classOf(teacherA);
    expect((await teacherB.get(`/api/teacher/assignments/${assignment}`)).status).toBe(404);
    expect((await teacherB.post(`/api/teacher/assignments/${assignment}/archive`)).status).toBe(404);
    expect((await teacherB.post(`/api/teacher/assignments/${assignment}/archive`)).status).toBe(404);
    expect((await teacherB.get(`/api/teacher/assignments/${assignment}/students/${studentAId}/messages`)).status).toBe(404);
    expect((await teacherB.get(`/api/teacher/classes/${classId}`)).status).toBe(404);
    expect((await teacherB.post(`/api/teacher/classes/${classId}/code`)).status).toBe(404);
    expect((await teacherB.post(`/api/teacher/classes/${classId}/members/${studentAId}/reset-link`)).status).toBe(404);
    const patch = await teacherB.raw
      .patch(`/api/teacher/assignments/${assignment}`)
      .set("Origin", "http://test.local")
      .send({ topic: "Hijacked" });
    expect(patch.status).toBe(404);
    // Teacher B cannot create an assignment in teacher A's class.
    const res = await teacherB.post("/api/teacher/assignments", {
      classId,
      topic: "Sneaky",
      subject: "Biology",
      grade: "Year 9",
      instructions: "",
      releaseAt: new Date().toISOString(),
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CLASS_NOT_FOUND");
    const list = await teacherB.get("/api/teacher/assignments");
    expect(list.body.items.some((i: { id: string }) => i.id === assignment)).toBe(false);
    expect((await teacherB.get("/api/teacher/students")).body.items).toHaveLength(0);
  });

  it("teacher A can read the transcript of their own student", async () => {
    const res = await teacherA.get(`/api/teacher/assignments/${assignment}/students/${studentAId}/messages`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it("student B never sees student A's conversation or progress", async () => {
    const session = await studentB.get(`/api/student/assignments/${assignment}`);
    expect(session.status).toBe(200);
    expect(session.body.messages).toHaveLength(0);
    expect(session.body.progress.status).toBe("not_started");
    expect((await studentB.get(`/api/student/assignments/${studentAId}`)).status).toBe(404);
  });

  it("selected-audience assignments are visible only to chosen class members", async () => {
    const selected = await createAssignment(teacherA, { audience: "selected", studentIds: [studentBId] });
    expect((await studentB.get(`/api/student/assignments/${selected.id}`)).status).toBe(200);
    expect((await studentA.get(`/api/student/assignments/${selected.id}`)).status).toBe(404);
  });

  it("teachers cannot select students who are not in the class", async () => {
    const outsider = await signUp("student", "Oak High");
    const res = await createAssignmentRaw(teacherA, { audience: "selected", studentIds: [outsider.user.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_RECIPIENTS");
  });

  it("removing a student from the class removes access immediately", async () => {
    const t = (await signUp("teacher")).c;
    const s = await signUp("student");
    await enroll(t, s.c);
    const { id } = await createAssignment(t);
    expect((await s.c.get(`/api/student/assignments/${id}`)).status).toBe(200);
    const { id: classId } = await classOf(t);
    expect((await t.del(`/api/teacher/classes/${classId}/members/${s.user.id}`)).status).toBe(204);
    expect((await s.c.get(`/api/student/assignments/${id}`)).status).toBe(404);
  });

  it("scheduled assignments stay hidden until release; archived ones disappear", async () => {
    const future = await createAssignment(teacherA, { releaseAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await studentA.get(`/api/student/assignments/${future.id}`)).status).toBe(404);

    const toArchive = await createAssignment(teacherA);
    expect((await studentA.get(`/api/student/assignments/${toArchive.id}`)).status).toBe(200);
    expect((await teacherA.post(`/api/teacher/assignments/${toArchive.id}/archive`)).status).toBe(200);
    expect((await studentA.get(`/api/student/assignments/${toArchive.id}`)).status).toBe(404);
  });

  it("ignores client-supplied ownership fields (mass assignment)", async () => {
    const res = await createAssignmentRaw(teacherA, {
      teacherId: studentAId,
      teacherSchool: "Elm Academy",
      notificationSent: true,
    });
    expect(res.status).toBe(201);
    expect((await teacherA.get(`/api/teacher/assignments/${res.body.id}`)).status).toBe(200);
    expect((await studentA.get(`/api/student/assignments/${res.body.id}`)).status).toBe(200);
  });

  it("rejects malformed ids with 400 instead of a server error", async () => {
    expect((await studentA.get("/api/student/assignments/not-a-uuid")).status).toBe(400);
    expect((await teacherA.get("/api/teacher/assignments/1%27%20OR%201=1")).status).toBe(400);
    expect((await teacherA.get("/api/teacher/classes/nope")).status).toBe(400);
  });
});

async function createAssignmentRaw(teacher: Client, overrides: Record<string, unknown>) {
  const { id: classId } = await classOf(teacher);
  return teacher.post("/api/teacher/assignments", {
    classId,
    topic: "Cells",
    subject: "Biology",
    grade: "Year 9",
    instructions: "",
    releaseAt: new Date().toISOString(),
    ...overrides,
  });
}
