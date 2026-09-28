import { describe, expect, it } from "vitest";
import { createAssignment, say, signUp } from "../helpers";
import { privacyService } from "../../server/modules/privacy/privacy.service";

describe("privacy operations", () => {
  it("exports a student's data without the password hash", async () => {
    const teacher = (await signUp("teacher")).c;
    const student = await signUp("student");
    const { id } = await createAssignment(teacher);
    await student.c.post(`/api/student/assignments/${id}/session`);
    await say(student.c, id, "hello");
    const data = await privacyService.exportStudentData(student.user.id);
    expect(data?.profile).not.toHaveProperty("password");
    expect(data?.progress).toHaveLength(1);
    expect(data?.messages.length).toBeGreaterThanOrEqual(3);
  });

  it("deletes a student and their conversations, keeping other students' data", async () => {
    const teacher = (await signUp("teacher")).c;
    const a = await signUp("student");
    const b = await signUp("student");
    const { id } = await createAssignment(teacher);
    for (const s of [a, b]) {
      await s.c.post(`/api/student/assignments/${id}/session`);
      await say(s.c, id, "hi");
    }
    expect(await privacyService.deleteUser(a.user.id)).toBe(true);
    expect(await privacyService.exportStudentData(a.user.id)).toBeNull();
    expect((await a.c.get("/api/auth/me")).status).toBe(401); // sessions gone
    const detail = await teacher.get(`/api/teacher/assignments/${id}`);
    expect(detail.body.progress).toHaveLength(1);
    expect((await b.c.get(`/api/student/assignments/${id}`)).body.messages.length).toBeGreaterThanOrEqual(3);
  });

  it("deleting a teacher archives (not destroys) their assignments", async () => {
    const teacher = await signUp("teacher");
    const student = await signUp("student");
    const { id } = await createAssignment(teacher.c);
    await student.c.post(`/api/student/assignments/${id}/session`);
    await privacyService.deleteUser(teacher.user.id);
    const data = await privacyService.exportStudentData(student.user.id);
    expect(data?.progress).toHaveLength(1);
    expect((await student.c.get(`/api/student/assignments/${id}`)).status).toBe(404); // archived
  });
});
