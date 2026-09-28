import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { passwordResetTokens } from "../../shared/schema";
import { db } from "../../server/db";
import { formatJoinCode, generateJoinCode, normalizeJoinCode } from "../../server/modules/classes/join-code";
import { classOf, client, createAssignment, enroll, ORIGIN, signUp } from "../helpers";

describe("join codes", () => {
  it("generates unambiguous 8-character codes and normalises user input", () => {
    for (let i = 0; i < 200; i++) expect(generateJoinCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(normalizeJoinCode(" k7m4-qxpb ")).toBe("K7M4QXPB");
    expect(normalizeJoinCode("K7M4 QXPB")).toBe("K7M4QXPB");
    expect(normalizeJoinCode("K7M4QXP")).toBeNull();
    expect(normalizeJoinCode("K7M4QXP0")).toBeNull(); // 0 is not in the alphabet
    expect(formatJoinCode("K7M4QXPB")).toBe("K7M4-QXPB");
  });
});

describe("classes", () => {
  it("teacher creates a class; students join by code; teacher sees members", async () => {
    const teacher = (await signUp("teacher")).c;
    const created = await teacher.post("/api/teacher/classes", { name: "Year 10 Biology" });
    expect(created.status).toBe(201);
    expect(created.body.joinCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const student = await signUp("student");
    const join = await student.c.post("/api/student/classes/join", { code: created.body.joinCode.toLowerCase() });
    expect(join.status).toBe(201);
    expect(join.body).toMatchObject({ name: "Year 10 Biology" });
    expect((await student.c.post("/api/student/classes/join", { code: created.body.joinCode })).body.error.code).toBe("ALREADY_MEMBER");
    expect((await student.c.get("/api/student/classes")).body).toHaveLength(1);

    const detail = await teacher.get(`/api/teacher/classes/${created.body.id}`);
    expect(detail.body.members.map((m: { id: string }) => m.id)).toEqual([student.user.id]);
    expect((await teacher.get("/api/teacher/classes")).body[0].memberCount).toBe(1);
  });

  it("rejects bad and unknown codes with helpful errors", async () => {
    const student = (await signUp("student")).c;
    expect((await student.post("/api/student/classes/join", { code: "nope" })).body.error.code).toBe("INVALID_JOIN_CODE");
    expect((await student.post("/api/student/classes/join", { code: "ZZZZ-ZZZZ" })).body.error.code).toBe("CLASS_CODE_NOT_FOUND");
  });

  it("regenerating the code invalidates the old one; archived classes can't be joined", async () => {
    const teacher = (await signUp("teacher")).c;
    const cls = await classOf(teacher);
    const regenerated = await teacher.post(`/api/teacher/classes/${cls.id}/code`);
    expect(regenerated.body.joinCode).not.toBe(cls.joinCode);
    const s1 = (await signUp("student")).c;
    expect((await s1.post("/api/student/classes/join", { code: cls.joinCode })).status).toBe(404);
    expect((await s1.post("/api/student/classes/join", { code: regenerated.body.joinCode })).status).toBe(201);

    await teacher.raw.patch(`/api/teacher/classes/${cls.id}`).set("Origin", ORIGIN).send({ archived: true });
    const s2 = (await signUp("student")).c;
    expect((await s2.post("/api/student/classes/join", { code: regenerated.body.joinCode })).status).toBe(404);
  });

  it("students can join at sign-up with a class code; a wrong code fails the sign-up clearly", async () => {
    const teacher = (await signUp("teacher")).c;
    const { joinCode } = await classOf(teacher);
    const { id } = await createAssignment(teacher);
    const joined = await signUp("student", "Anywhere", { classCode: joinCode });
    expect((await joined.c.get(`/api/student/assignments/${id}`)).status).toBe(200);

    const bad = await client().post("/api/auth/signup", {
      email: `bad-code-${Date.now()}@example.com`,
      password: "long enough pw",
      name: "Bad Code",
      role: "student",
      school: "Oak",
      classCode: "ZZZZ-ZZZZ",
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe("classCode");
  });
});

describe("assignment editing", () => {
  it("edits content and due date; release time only while scheduled", async () => {
    const teacher = (await signUp("teacher")).c;
    const released = await createAssignment(teacher);
    const patch = (id: string, body: object) => teacher.raw.patch(`/api/teacher/assignments/${id}`).set("Origin", ORIGIN).send(body);

    const edited = await patch(released.id, { topic: "Photosynthesis (revised)", instructions: "Use cooking analogies." });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ topic: "Photosynthesis (revised)", instructions: "Use cooking analogies." });

    const moveReleased = await patch(released.id, { releaseAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(moveReleased.body.error.code).toBe("ALREADY_RELEASED");

    const scheduled = await createAssignment(teacher, { releaseAt: new Date(Date.now() + 86_400_000).toISOString() });
    const moved = await patch(scheduled.id, { releaseAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    expect(moved.status).toBe(200);
    expect(moved.body.status).toBe("scheduled");

    const badDue = await patch(scheduled.id, { dueAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(badDue.body.error.code).toBe("INVALID_DUE_DATE");
    expect((await patch(scheduled.id, { audience: "school" })).status).toBe(400); // unknown fields rejected
  });

  it("students see the edited topic", async () => {
    const teacher = (await signUp("teacher")).c;
    const student = (await signUp("student")).c;
    await enroll(teacher, student);
    const { id } = await createAssignment(teacher);
    await teacher.raw.patch(`/api/teacher/assignments/${id}`).set("Origin", ORIGIN).send({ topic: "Respiration" });
    expect((await student.get(`/api/student/assignments/${id}`)).body.assignment.topic).toBe("Respiration");
  });
});

describe("password reset", () => {
  it("forgot-password always answers the same and never reveals accounts", async () => {
    const { email, user } = await signUp("student");
    const known = await client().post("/api/auth/password/forgot", { email });
    const unknown = await client().post("/api/auth/password/forgot", { email: "nobody-here@example.com" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    // A token was issued for the real account (only its hash is stored).
    const rows = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("teacher reset link: single use, signs the student out everywhere, logs them in with the new password", async () => {
    const teacher = (await signUp("teacher")).c;
    const student = await signUp("student");
    await enroll(teacher, student.c);
    const { id: classId } = await classOf(teacher);

    const link = await teacher.post(`/api/teacher/classes/${classId}/members/${student.user.id}/reset-link`);
    expect(link.status).toBe(200);
    const token = new URL(link.body.url).searchParams.get("token")!;
    expect(new URL(link.body.url).pathname).toBe("/reset-password");

    const fresh = client();
    const reset = await fresh.post("/api/auth/password/reset", { token, password: "a brand new password" });
    expect(reset.status).toBe(200);
    expect(reset.body.id).toBe(student.user.id);
    expect((await fresh.get("/api/auth/me")).status).toBe(200); // logged in on the new device
    expect((await student.c.get("/api/auth/me")).status).toBe(401); // old sessions revoked

    const reuse = await client().post("/api/auth/password/reset", { token, password: "another new password" });
    expect(reuse.body.error.code).toBe("RESET_LINK_INVALID");

    expect((await client().post("/api/auth/login", { email: student.email, password: "a brand new password" })).status).toBe(200);
    expect((await client().post("/api/auth/login", { email: student.email, password: "correct horse battery" })).status).toBe(401);
  });

  it("rejects expired links, weak passwords, and links for students outside the teacher's class", async () => {
    const teacher = (await signUp("teacher")).c;
    const student = await signUp("student");
    const outsider = await signUp("student");
    await enroll(teacher, student.c);
    const { id: classId } = await classOf(teacher);

    expect((await teacher.post(`/api/teacher/classes/${classId}/members/${outsider.user.id}/reset-link`)).status).toBe(404);

    const link = await teacher.post(`/api/teacher/classes/${classId}/members/${student.user.id}/reset-link`);
    const token = new URL(link.body.url).searchParams.get("token")!;
    expect((await client().post("/api/auth/password/reset", { token, password: "short" })).status).toBe(400);

    await db
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResetTokens.userId, student.user.id));
    expect((await client().post("/api/auth/password/reset", { token, password: "long enough password" })).body.error.code).toBe(
      "RESET_LINK_INVALID",
    );
  });

  it("only the newest link works", async () => {
    const teacher = (await signUp("teacher")).c;
    const student = await signUp("student");
    await enroll(teacher, student.c);
    const { id: classId } = await classOf(teacher);
    const first = await teacher.post(`/api/teacher/classes/${classId}/members/${student.user.id}/reset-link`);
    const second = await teacher.post(`/api/teacher/classes/${classId}/members/${student.user.id}/reset-link`);
    const t1 = new URL(first.body.url).searchParams.get("token")!;
    const t2 = new URL(second.body.url).searchParams.get("token")!;
    expect((await client().post("/api/auth/password/reset", { token: t1, password: "long enough password" })).status).toBe(400);
    expect((await client().post("/api/auth/password/reset", { token: t2, password: "long enough password" })).status).toBe(200);
  });
});

describe("invite links", () => {
  it("previews a class publicly (name and teacher only) and rejects bad codes", async () => {
    const c = client;
    const teacher = await signUp("teacher");
    const cls = (await teacher.c.post("/api/teacher/classes", { name: "Year 9 Science" })).body;
    const preview = await c().get(`/api/classes/invite/${cls.joinCode.toLowerCase()}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({ code: cls.joinCode, name: "Year 9 Science", subject: "Biology", teacherName: teacher.user.name });
    expect((await c().get("/api/classes/invite/NOPE-NOPE")).status).toBe(404);

    await teacher.c.raw.patch(`/api/teacher/classes/${cls.id}`).set("Origin", ORIGIN).send({ archived: true });
    expect((await c().get(`/api/classes/invite/${cls.joinCode}`)).status).toBe(404);
  });
});
