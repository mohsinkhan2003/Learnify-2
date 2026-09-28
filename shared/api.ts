/**
 * API contract types shared by the Express server and the React client.
 * Dates are ISO-8601 strings on the wire.
 */
import type { AnswerAssessment, ProgressStatus, TutorStage } from "./tutor";

export type Role = "teacher" | "student";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  school: string | null;
  subject: string | null;
  avatar: string | null;
  /** False only while email verification is required and still pending. */
  emailVerified: boolean;
}

export interface AuthProviders {
  google: boolean;
  /** Whether self-service password reset emails can be sent. */
  email: boolean;
}

// ---- Classes ----

export interface ClassDto {
  id: string;
  name: string;
  subject: string | null;
  /** Formatted like "K7M4-QXPB". */
  joinCode: string;
  memberCount: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface ClassMemberDto {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
}

export interface ClassDetailDto {
  class: ClassDto;
  members: ClassMemberDto[];
}

/** Public preview of a class invite (shown before signing up / joining). */
export interface ClassInviteDto {
  code: string;
  name: string;
  subject: string | null;
  teacherName: string;
}

export interface StudentClassDto {
  id: string;
  name: string;
  subject: string | null;
  teacherName: string;
}

export interface ResetLinkDto {
  url: string;
  expiresAt: string;
}

// ---- Assignments ----

export type AssignmentStatus = "scheduled" | "active" | "archived";

export interface AssignmentDto {
  id: string;
  topic: string;
  subject: string;
  grade: string;
  instructions: string;
  teacherName: string | null;
  audience: "class" | "selected" | "school";
  classId: string | null;
  className: string | null;
  releaseAt: string;
  dueAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  status: AssignmentStatus;
}

export interface AssignmentStats {
  eligible: number;
  started: number;
  completed: number;
  readyToComplete: number;
  needsAttention: number;
  avgTimeSeconds: number;
}

export interface TeacherAssignmentListItem extends AssignmentDto {
  stats: AssignmentStats;
}

export interface Paginated<T> {
  items: T[];
  nextOffset: number | null;
}

export interface CreateAssignmentInput {
  topic: string;
  subject: string;
  grade: string;
  instructions: string;
  releaseAt: string;
  dueAt?: string | null;
  classId: string;
  audience: "class" | "selected";
  studentIds?: string[];
}

/** Editable after creation. The release time can only change while the assignment is still scheduled. */
export interface UpdateAssignmentInput {
  topic?: string;
  subject?: string;
  grade?: string;
  instructions?: string;
  dueAt?: string | null;
  releaseAt?: string;
}

// ---- Insights ----

export type InsightSignal = "hints" | "incorrect" | "stalled" | "long_session" | "flagged" | "not_started";

export interface Insight {
  signal: InsightSignal;
  /** Human-readable evidence, e.g. "Needed hints on 3 questions". */
  evidence: string;
}

export interface StudentProgressRow {
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: ProgressStatus;
  tutorStage: TutorStage;
  practiceCompleted: number;
  totalTimeSeconds: number;
  messageCount: number;
  hintCount: number;
  correctCount: number;
  incorrectCount: number;
  flaggedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  lastActiveAt: string | null;
  insights: Insight[];
}

export interface TeacherAssignmentDetail {
  assignment: AssignmentDto;
  stats: AssignmentStats;
  progress: StudentProgressRow[];
  notStarted: { studentId: string; studentName: string }[];
  notStartedTotal: number;
  /** e.g. "Not started 4 days after release" once the assignment has been out a while. */
  notStartedNote: string | null;
  recipients: { id: string; name: string }[];
}

export interface AttentionItem {
  studentId: string;
  studentName: string;
  assignmentId: string;
  assignmentTopic: string;
  insights: Insight[];
}

export interface TeacherOverview {
  metrics: {
    activeAssignments: number;
    scheduledAssignments: number;
    studentsParticipating: number;
    completionRate: number | null; // 0..1, null when there are no eligible students
    needsAttention: number;
  };
  attention: AttentionItem[];
  recentAssignments: TeacherAssignmentListItem[];
}

export interface TeacherStudentRow {
  id: string;
  name: string;
  email: string;
  classes: string[];
  assignmentsStarted: number;
  assignmentsCompleted: number;
  totalTimeSeconds: number;
  lastActiveAt: string | null;
  insightCount: number;
}

// ---- Tutoring ----

export interface ChatMessageDto {
  id: string;
  role: "student" | "ai";
  content: string;
  stage: TutorStage | null;
  source: "text" | "voice" | null;
  assessment: AnswerAssessment | null;
  misconception: string | null;
  flagged: boolean;
  createdAt: string;
}

export interface StudentProgressDto {
  status: ProgressStatus;
  tutorStage: TutorStage;
  practiceCompleted: number;
  practiceTotal: number;
  totalTimeSeconds: number;
  messageCount: number;
  canComplete: boolean;
  completedAt: string | null;
  summary: string | null;
}

export interface StudentAssignmentListItem extends AssignmentDto {
  progress: StudentProgressDto | null;
}

export interface TutorSessionDto {
  assignment: AssignmentDto;
  progress: StudentProgressDto;
  messages: ChatMessageDto[];
  limits: { maxMessageLength: number; maxAudioSeconds: number; transcriptionEnabled: boolean };
}

export interface SendMessageInput {
  content: string;
  source: "text" | "voice";
  clientMessageId: string;
}

export interface TutorTurnResult {
  studentMessage: ChatMessageDto;
  tutorMessage: ChatMessageDto;
  progress: StudentProgressDto;
}

export interface TranscriptionResult {
  text: string;
}
