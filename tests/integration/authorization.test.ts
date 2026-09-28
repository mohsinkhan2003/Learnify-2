import { beforeAll, describe, expect, it } from "vitest";
import { createAssignment, say, signUp, type Client } from "../helpers";

/**
 * Authorization boundaries: Student A ≠ Student B, Teacher A ≠ Teacher B, school isolation,
 * selected audiences, scheduled/archived visibility, and role separation.
 */
describe("authorization boundaries", () => {
  let teacherA: Client, teacherB: Client, studentA: Client, studentB: Client, otherSchool: Client;
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
    otherSchool = (await signUp("student", "Elm Academy")).c;
    assignment = (await createAssignment(teacherA)).id;
    await studentA.post(`/api/student/assignments/${assignment}/session`);
    await say(studentA, assignment, "I'm good thanks");
  });

  it("requires authentication for every protected area", async () => {
    const { client } = await import("../helpers");
    const anon = client();
    for (const url of ["/api/teacher/overview", "/api/teacher/assignments", "/api/student/assignments", `/api/student/assignments/${assignment}`]) {
      expect((await anon.get(url)).status, url).toBe(401);
    }
  });

  it("separates roles", async () => {
    expect((await studentA.get("/api/teacher/overview")).status).toBe(403);
    expect((await studentA.post("/api/teacher/assignments", {})).status).toBe(403);
    expect((await teacherA.get("/api/student/assignments")).status).toBe(403);
    expect((await teacherA.post(`/api/student/assignments/${assignment}/messages`, {})).status).toBe(403);
  });

  it("teacher B cannot see or manage teacher A's assignment", async () => {
    expect((await teacherB.get(`/api/teacher/assignments/${assignment}`)).status).toBe(404);
    expect((await teacherB.post(`/api/teacher/assignments/${assignment}/archive`)).status).toBe(404);
    expect((await teacherB.get(`/api/teacher/assignments/${assignment}/students/${studentAId}/messages`)).status).toBe(404);
    const list = await teacherB.get("/api/teacher/assignments");
    expect(list.body.items.some((i: { id: string }) => i.id === assignment)).toBe(false);
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
    // There is no endpoint that accepts another student's id; ids in URLs are only assignment ids.
    expect((await studentB.get(`/api/student/assignments/${studentAId}`)).status).toBe(404);
  });

  it("students at another school cannot see or use the assignment", async () => {
    const list = await otherSchool.get("/api/student/assignments");
    expect(list.body.some((a: { id: string }) => a.id === assignment)).toBe(false);
    expect((await otherSchool.get(`/api/student/assignments/${assignment}`)).status).toBe(404);
    expect((await say(otherSchool, assignment, "hello")).status).toBe(404);
  });

  it("selected-audience assignments are visible only to chosen students", async () => {
    const selected = await createAssignment(teacherA, { audience: "selected", studentIds: [studentBId] });
    expect((await studentB.get(`/api/student/assignments/${selected.id}`)).status).toBe(200);
    expect((await studentA.get(`/api/student/assignments/${selected.id}`)).status).toBe(404);
  });

  it("teachers cannot assign students from another school", async () => {
    const outsider = await signUp("student", "Elm Academy");
    const res = await teacherA.post("/api/teacher/assignments", {
      topic: "Cells",
      subject: "Biology",
      grade: "Year 9",
      instructions: "",
      releaseAt: new Date().toISOString(),
      audience: "selected",
      studentIds: [outsider.user.id],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_RECIPIENTS");
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
    const res = await teacherA.post("/api/teacher/assignments", {
      topic: "Mass assignment",
      subject: "Biology",
      grade: "Year 10",
      instructions: "",
      releaseAt: new Date().toISOString(),
      teacherId: studentAId,
      teacherSchool: "Elm Academy",
      notificationSent: true,
    });
    expect(res.status).toBe(201);
    const detail = await teacherA.get(`/api/teacher/assignments/${res.body.id}`);
    expect(detail.status).toBe(200);
    // Visible to Oak High students, so school came from the session, not the body.
    expect((await studentA.get(`/api/student/assignments/${res.body.id}`)).status).toBe(200);
  });

  it("rejects malformed ids with 400 instead of a server error", async () => {
    expect((await studentA.get("/api/student/assignments/not-a-uuid")).status).toBe(400);
    expect((await teacherA.get("/api/teacher/assignments/1%27%20OR%201=1")).status).toBe(400);
  });
});
