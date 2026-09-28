import type { Class, User } from "@shared/schema";
import type { ClassDetailDto, ClassDto, ClassInviteDto, ResetLinkDto, StudentClassDto } from "@shared/api";
import { AppError, badRequest, conflict, isUniqueViolation, notFound } from "../../lib/errors";
import { toIso } from "../../lib/http";
import { createTeacherResetLink } from "../../auth/password-reset";
import { classesRepository } from "./classes.repository";
import { usersRepository } from "../../auth/users.repository";
import { formatJoinCode, generateJoinCode, normalizeJoinCode } from "./join-code";

export function toClassDto(c: Class, memberCount: number): ClassDto {
  return {
    id: c.id,
    name: c.name,
    subject: c.subject,
    joinCode: formatJoinCode(c.joinCode),
    memberCount,
    createdAt: c.createdAt.toISOString(),
    archivedAt: toIso(c.archivedAt),
  };
}

/** A class the teacher owns; anything else is a 404 (no existence leak). */
export async function loadOwnedClass(teacher: User, id: string): Promise<Class> {
  const c = await classesRepository.findById(id);
  if (!c || c.teacherId !== teacher.id) throw notFound("Class not found", "CLASS_NOT_FOUND");
  return c;
}

async function withUniqueCode<T>(fn: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn(generateJoinCode());
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new AppError(500, "JOIN_CODE_EXHAUSTED", "Could not generate a class code. Please try again.");
}

export const classesService = {
  async list(teacher: User): Promise<ClassDto[]> {
    const rows = await classesRepository.listByTeacher(teacher.id);
    return rows.map((r) => toClassDto(r.cls, r.memberCount));
  },

  async create(teacher: User, input: { name: string; subject?: string | null }): Promise<ClassDto> {
    const c = await withUniqueCode((joinCode) =>
      classesRepository.create({ teacherId: teacher.id, name: input.name, subject: input.subject ?? teacher.subject ?? null, joinCode }),
    );
    return toClassDto(c, 0);
  },

  async detail(teacher: User, id: string): Promise<ClassDetailDto> {
    const c = await loadOwnedClass(teacher, id);
    const members = await classesRepository.members(c.id);
    return {
      class: toClassDto(c, members.length),
      members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, joinedAt: m.joinedAt.toISOString() })),
    };
  },

  async update(teacher: User, id: string, input: { name?: string; subject?: string | null; archived?: boolean }) {
    await loadOwnedClass(teacher, id);
    const c = await classesRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    });
    return toClassDto(c, (await classesRepository.memberCounts([id])).get(id) ?? 0);
  },

  /** New code; the old one stops working immediately (e.g. if it leaked). */
  async regenerateCode(teacher: User, id: string): Promise<ClassDto> {
    await loadOwnedClass(teacher, id);
    const c = await withUniqueCode((joinCode) => classesRepository.update(id, { joinCode }));
    return toClassDto(c, (await classesRepository.memberCounts([id])).get(id) ?? 0);
  },

  async removeMember(teacher: User, classId: string, studentId: string): Promise<void> {
    await loadOwnedClass(teacher, classId);
    if (!(await classesRepository.removeMember(classId, studentId))) throw notFound("Student is not in this class", "MEMBER_NOT_FOUND");
  },

  async resetLink(teacher: User, classId: string, studentId: string, origin: string): Promise<ResetLinkDto> {
    await loadOwnedClass(teacher, classId);
    if (!(await classesRepository.isMember(classId, studentId))) throw notFound("Student is not in this class", "MEMBER_NOT_FOUND");
    const { url, expiresAt } = await createTeacherResetLink(studentId, teacher.id, origin);
    return { url, expiresAt: expiresAt.toISOString() };
  },

  // ---- student side ----

  async listForStudent(student: User): Promise<StudentClassDto[]> {
    return classesRepository.listForStudent(student.id);
  },

  /** What an invite link shows before sign-up. Only the class and teacher names are revealed. */
  async invitePreview(rawCode: string): Promise<ClassInviteDto> {
    const code = normalizeJoinCode(rawCode);
    const c = code ? await classesRepository.findByJoinCode(code) : undefined;
    const teacher = c ? await usersRepository.findById(c.teacherId) : undefined;
    if (!c || !teacher) throw notFound("This invite link isn't valid any more. Ask your teacher for a new one.", "CLASS_CODE_NOT_FOUND");
    return { code: formatJoinCode(c.joinCode), name: c.name, subject: c.subject, teacherName: teacher.name };
  },

  async join(student: User, rawCode: string): Promise<StudentClassDto> {
    const code = normalizeJoinCode(rawCode);
    if (!code) throw badRequest("That doesn't look like a class code. Codes have 8 letters and numbers.", undefined, "INVALID_JOIN_CODE");
    const c = await classesRepository.findByJoinCode(code);
    if (!c) throw notFound("We couldn't find a class with that code. Check it with your teacher.", "CLASS_CODE_NOT_FOUND");
    const added = await classesRepository.addMember(c.id, student.id);
    if (!added) throw conflict("You're already in this class.", "ALREADY_MEMBER");
    return (await classesRepository.listForStudent(student.id)).find((x) => x.id === c.id)!;
  },
};
