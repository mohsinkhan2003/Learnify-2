import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Clock, Flag, HelpCircle, Lightbulb, ShieldAlert, Timer, Users, XCircle } from "lucide-react";
import type { ChatMessageDto, Insight, InsightSignal, TeacherAssignmentListItem } from "@shared/api";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Meter, ScheduledBadge } from "@/components/common/metrics";
import { ErrorState, ListSkeleton } from "@/components/common/states";
import { formatDate, formatShortDate, formatTime } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";

const SIGNAL_META: Record<InsightSignal, { label: string; icon: typeof Flag; tone: "destructive" | "warning" | "info" | "secondary" }> = {
  flagged: { label: "Safety review", icon: ShieldAlert, tone: "destructive" },
  hints: { label: "Needed hints", icon: Lightbulb, tone: "warning" },
  incorrect: { label: "Incorrect answers", icon: XCircle, tone: "warning" },
  stalled: { label: "Stalled", icon: Clock, tone: "info" },
  long_session: { label: "Long session", icon: Timer, tone: "info" },
  not_started: { label: "Not started", icon: HelpCircle, tone: "secondary" },
};

/** Each insight shows its evidence, so teachers can judge for themselves. */
export function InsightList({ insights, compact = false }: { insights: Insight[]; compact?: boolean }) {
  if (insights.length === 0) return <span className="text-helper">—</span>;
  return (
    <ul className={cn("flex flex-col gap-1.5", compact && "gap-1")}>
      {insights.map((i) => {
        const meta = SIGNAL_META[i.signal];
        const Icon = meta.icon;
        return (
          <li key={i.signal} className="flex items-start gap-2 text-sm">
            <Badge variant={meta.tone} className="shrink-0">
              <Icon aria-hidden /> {meta.label}
            </Badge>
            {!compact && <span className="pt-0.5 text-muted-foreground">{i.evidence}</span>}
            {compact && <span className="sr-only">{i.evidence}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function AssignmentCard({ assignment }: { assignment: TeacherAssignmentListItem }) {
  const { stats } = assignment;
  return (
    <Link
      href={`/teacher/assignments/${assignment.id}`}
      className="interactive-card group flex flex-col rounded-lg border bg-card p-5 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-eyebrow">
            {assignment.subject} · {assignment.grade}
          </p>
          <h3 className="mt-1 line-clamp-2 text-card-title group-hover:text-primary">{assignment.topic}</h3>
        </div>
        {assignment.status === "scheduled" && <ScheduledBadge />}
        {assignment.status === "archived" && <Badge variant="secondary">Archived</Badge>}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" aria-hidden />
          <dt className="sr-only">Released</dt>
          <dd>
            {assignment.status === "scheduled"
              ? `Releases ${formatDate(assignment.releaseAt)}`
              : `Set ${formatShortDate(assignment.releaseAt)}`}
          </dd>
        </div>
        {assignment.dueAt && (
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden />
            <dt className="sr-only">Due</dt>
            <dd>Due {formatShortDate(assignment.dueAt)}</dd>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
          <dt className="sr-only">Students</dt>
          <dd>
            {stats.started} of {stats.eligible} started
          </dd>
        </div>
      </dl>
      <div className="mt-auto pt-5">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium">{stats.completed} completed</span>
          {stats.needsAttention > 0 && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="size-3.5" aria-hidden /> {stats.needsAttention} may need attention
            </span>
          )}
        </div>
        <Meter
          value={stats.completed}
          max={Math.max(stats.eligible, 1)}
          label={`${stats.completed} of ${stats.eligible} students completed`}
        />
      </div>
    </Link>
  );
}

const ASSESSMENT_LABEL: Record<string, { text: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  correct: { text: "Tutor: correct", variant: "success" },
  partially_correct: { text: "Tutor: partly correct", variant: "warning" },
  incorrect: { text: "Tutor: incorrect", variant: "destructive" },
  no_attempt: { text: "Tutor: no attempt", variant: "secondary" },
};

/** Full transcript for one student. AI assessments are shown as evidence, labelled as the tutor's view. */
export function TranscriptSheet({
  assignmentId,
  student,
  onClose,
}: {
  assignmentId: string;
  student: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const query = useQuery<ChatMessageDto[]>({
    queryKey: queryKeys.teacherTranscript(assignmentId, student?.id ?? ""),
    enabled: !!student,
  });

  return (
    <Sheet open={!!student} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5 text-left">
          <SheetTitle>{student?.name}</SheetTitle>
          <SheetDescription>Conversation transcript. Tutor assessments are automated and shown as evidence only.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5">
          {query.isLoading && <ListSkeleton rows={4} />}
          {query.error && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
          {query.data?.length === 0 && <p className="text-helper">This student hasn't started the conversation yet.</p>}
          <ol className="space-y-4">
            {query.data?.map((m, idx) => {
              // The assessment on a tutor reply refers to the student answer just before it.
              const next = query.data[idx + 1];
              const assessment = m.role === "student" && next?.role === "ai" ? next.assessment : null;
              const label = assessment ? ASSESSMENT_LABEL[assessment] : null;
              return (
                <li key={m.id} className={cn("flex flex-col", m.role === "student" ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[90%] rounded-lg px-3.5 py-2.5 text-sm leading-6",
                      m.role === "student" ? "rounded-tr-sm bg-primary-soft" : "rounded-tl-sm border bg-card",
                      m.flagged && "border border-destructive/40 bg-destructive-soft",
                    )}
                  >
                    {m.content}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>
                      {m.role === "student" ? "Student" : "Tutor"} · {formatTime(m.createdAt)}
                      {m.source === "voice" && " · spoken"}
                    </span>
                    {m.flagged && (
                      <Badge variant="destructive">
                        <ShieldAlert aria-hidden /> Held by safety filter
                      </Badge>
                    )}
                    {label && <Badge variant={label.variant}>{label.text}</Badge>}
                  </div>
                  {m.role === "ai" && m.misconception && (
                    <p className="mt-1 max-w-[90%] rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
                      Possible misconception noted: {m.misconception}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}
