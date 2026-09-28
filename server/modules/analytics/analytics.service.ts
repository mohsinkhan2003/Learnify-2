import type { Assignment, User } from "@shared/schema";
import type {
  AssignmentStats,
  AttentionItem,
  StudentProgressRow,
  TeacherAssignmentListItem,
  TeacherOverview,
  TeacherStudentRow,
} from "@shared/api";
import type { ProgressStatus, TutorStage } from "@shared/tutor";
import { toIso } from "../../lib/http";
import { assignmentsRepository, type ProgressWithStudent } from "../assignments/assignments.repository";
import { toAssignmentDto } from "../assignments/assignments.dto";
import { computeInsights, longSessionThreshold } from "./insights";

/**
 * Metric definitions (keep in sync with docs/ARCHITECTURE.md → Analytics):
 * - eligible:  students in the assignment's audience (school roster or selected recipients),
 *              never fewer than students who actually started.
 * - started:   progress status other than not_started.
 * - completed: status completed. Completion rate = completed / eligible.
 * - time:      active, visible-tab time accumulated from heartbeats (seconds).
 * - messages:  student messages sent to the tutor.
 */

export function toProgressRow(row: ProgressWithStudent, longThreshold: number, now = new Date()): StudentProgressRow {
  const p = row.progress;
  return {
    studentId: p.studentId,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    status: p.status as ProgressStatus,
    tutorStage: p.tutorStage as TutorStage,
    practiceCompleted: p.practiceCompleted,
    totalTimeSeconds: p.totalTimeSpent,
    messageCount: p.messageCount,
    hintCount: p.hintCount,
    correctCount: p.correctCount,
    incorrectCount: p.incorrectCount,
    flaggedCount: p.flaggedCount,
    startedAt: toIso(p.startedAt),
    completedAt: toIso(p.completedAt),
    lastActiveAt: toIso(p.lastActiveAt),
    insights: computeInsights(p, longThreshold, now),
  };
}

export function buildAssignmentStats(rows: StudentProgressRow[], eligibleRaw: number): AssignmentStats {
  const started = rows.filter((r) => r.status !== "not_started");
  const eligible = Math.max(eligibleRaw, started.length);
  const avg = started.length ? Math.round(started.reduce((s, r) => s + r.totalTimeSeconds, 0) / started.length) : 0;
  return {
    eligible,
    started: started.length,
    completed: rows.filter((r) => r.status === "completed").length,
    readyToComplete: rows.filter((r) => r.status === "summary_provided").length,
    needsAttention: rows.filter((r) => r.insights.length > 0).length,
    avgTimeSeconds: avg,
  };
}

/** Groups progress by assignment and computes rows + stats with a per-assignment long-session threshold. */
async function statsFor(teacher: User, list: Assignment[], now = new Date()) {
  const ids = list.map((a) => a.id);
  const [progress, recipientCounts, schoolCount] = await Promise.all([
    assignmentsRepository.progressForAssignments(ids),
    assignmentsRepository.recipientCounts(ids),
    assignmentsRepository.countStudentsAtSchool(teacher.school),
  ]);

  const byAssignment = new Map<string, ProgressWithStudent[]>();
  for (const row of progress) {
    const bucket = byAssignment.get(row.progress.assignmentId) ?? [];
    bucket.push(row);
    byAssignment.set(row.progress.assignmentId, bucket);
  }

  return list.map((assignment) => {
    const raw = byAssignment.get(assignment.id) ?? [];
    const threshold = longSessionThreshold(raw.filter((r) => r.progress.status !== "not_started").map((r) => r.progress.totalTimeSpent));
    const rows = raw.map((r) => toProgressRow(r, threshold, now));
    const eligible = assignment.audience === "selected" ? (recipientCounts.get(assignment.id) ?? 0) : schoolCount;
    return { assignment, rows, stats: buildAssignmentStats(rows, eligible) };
  });
}

export const analyticsService = {
  statsFor,

  async listAssignments(teacher: User, opts: { limit: number; offset: number; archived: boolean }) {
    const page = await assignmentsRepository.listByTeacher(teacher.id, { ...opts, limit: opts.limit + 1 });
    const hasMore = page.length > opts.limit;
    const items = page.slice(0, opts.limit);
    const withStats = await statsFor(teacher, items);
    return {
      items: withStats.map<TeacherAssignmentListItem>(({ assignment, stats }) => ({ ...toAssignmentDto(assignment), stats })),
      nextOffset: hasMore ? opts.offset + opts.limit : null,
    };
  },

  async overview(teacher: User): Promise<TeacherOverview> {
    const [active, scheduled] = await Promise.all([
      assignmentsRepository.listActiveByTeacher(teacher.id),
      assignmentsRepository.countScheduledByTeacher(teacher.id),
    ]);
    const all = await statsFor(teacher, active);

    const participants = new Set<string>();
    const attentionStudents = new Set<string>();
    const attention: AttentionItem[] = [];
    let completed = 0;
    let eligible = 0;

    for (const { assignment, rows, stats } of all) {
      completed += stats.completed;
      eligible += stats.eligible;
      for (const row of rows) {
        if (row.status !== "not_started") participants.add(row.studentId);
        if (row.insights.length > 0) {
          attentionStudents.add(row.studentId);
          attention.push({
            studentId: row.studentId,
            studentName: row.studentName,
            assignmentId: assignment.id,
            assignmentTopic: assignment.topic,
            insights: row.insights,
          });
        }
      }
    }

    // Safety flags first, then by number of signals.
    const weight = (a: AttentionItem) => (a.insights.some((i) => i.signal === "flagged") ? 100 : 0) + a.insights.length;
    attention.sort((a, b) => weight(b) - weight(a));

    return {
      metrics: {
        activeAssignments: active.length,
        scheduledAssignments: scheduled,
        studentsParticipating: participants.size,
        completionRate: eligible > 0 ? completed / eligible : null,
        needsAttention: attentionStudents.size,
      },
      attention: attention.slice(0, 12),
      recentAssignments: all.slice(0, 6).map(({ assignment, stats }) => ({ ...toAssignmentDto(assignment), stats })),
    };
  },

  async students(teacher: User, opts: { search?: string; limit: number; offset: number }) {
    const page = await assignmentsRepository.studentsAtSchool(teacher.school, { ...opts, limit: opts.limit + 1 });
    const hasMore = page.length > opts.limit;
    const students = page.slice(0, opts.limit);

    const active = await assignmentsRepository.listActiveByTeacher(teacher.id);
    const all = await statsFor(teacher, active);
    const agg = new Map<string, TeacherStudentRow>();
    for (const s of students) {
      agg.set(s.id, { ...s, assignmentsStarted: 0, assignmentsCompleted: 0, totalTimeSeconds: 0, lastActiveAt: null, insightCount: 0 });
    }
    for (const { rows } of all) {
      for (const row of rows) {
        const entry = agg.get(row.studentId);
        if (!entry) continue;
        if (row.status !== "not_started") entry.assignmentsStarted++;
        if (row.status === "completed") entry.assignmentsCompleted++;
        entry.totalTimeSeconds += row.totalTimeSeconds;
        entry.insightCount += row.insights.length;
        if (row.lastActiveAt && (!entry.lastActiveAt || row.lastActiveAt > entry.lastActiveAt)) entry.lastActiveAt = row.lastActiveAt;
      }
    }
    return { items: [...agg.values()], nextOffset: hasMore ? opts.offset + opts.limit : null };
  },
};
