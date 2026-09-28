import { useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Archive, ArchiveRestore, ArrowLeft, CalendarClock, ChevronDown, Clock, MessageSquareText, Users } from "lucide-react";
import type { AssignmentDto, TeacherAssignmentDetail } from "@shared/api";
import { PRACTICE_QUESTIONS } from "@shared/tutor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Meter, ScheduledBadge, StatTile, StatusBadge } from "@/components/common/metrics";
import { EmptyState, ErrorState, FullPageSpinner } from "@/components/common/states";
import { useToast } from "@/hooks/use-toast";
import { apiPost, errorMessage } from "@/lib/api";
import { formatDate, formatDuration, formatPercent, formatRelative } from "@/lib/format";
import { queryClient, queryKeys } from "@/lib/query";
import { InsightList, TranscriptSheet } from "./components";
import { EditAssignmentDialog } from "./edit-assignment-dialog";

function ArchiveButton({ assignment }: { assignment: AssignmentDto }) {
  const { toast } = useToast();
  const archived = assignment.status === "archived";
  const mutation = useMutation({
    mutationFn: () => apiPost<AssignmentDto>(`/api/teacher/assignments/${assignment.id}/${archived ? "unarchive" : "archive"}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/assignments"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.teacherAssignment(assignment.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teacherOverview });
      toast({ title: archived ? "Assignment restored" : "Assignment archived" });
    },
    onError: (e) => toast({ title: "Couldn't update assignment", description: errorMessage(e), variant: "destructive" }),
  });

  if (archived) {
    return (
      <Button variant="outline" onClick={() => mutation.mutate()} loading={mutation.isPending}>
        <ArchiveRestore aria-hidden /> Restore
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Archive aria-hidden /> Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this assignment?</AlertDialogTitle>
          <AlertDialogDescription>
            Students will no longer see it or be able to continue. All progress and conversations are kept, and you can restore it at any
            time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => mutation.mutate()}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery<TeacherAssignmentDetail>({ queryKey: queryKeys.teacherAssignment(id!), refetchInterval: 60_000 });
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [showGuidance, setShowGuidance] = useState(false);
  const [editing, setEditing] = useState(false);

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { assignment, stats, progress, notStarted, notStartedTotal, notStartedNote, recipients } = query.data;

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <Link href="/teacher/assignments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Assignments
        </Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-eyebrow">
              {assignment.subject} · {assignment.grade}
            </p>
            <h1 className="mt-1 text-page-title">{assignment.topic}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {assignment.status === "scheduled" ? <ScheduledBadge /> : null}
              {assignment.status === "archived" ? <Badge variant="secondary">Archived</Badge> : null}
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-4" aria-hidden />
                {assignment.status === "scheduled" ? "Releases" : "Released"} {formatDate(assignment.releaseAt)}
              </span>
              {assignment.dueAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden /> Due {formatDate(assignment.dueAt)}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" aria-hidden />
                {assignment.audience === "school"
                  ? "Everyone at your school (legacy)"
                  : assignment.audience === "class"
                    ? `${assignment.className ?? "Class"} · whole class`
                    : `${assignment.className ?? "Class"} · ${recipients.length} selected student${recipients.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden /> Edit
            </Button>
            <ArchiveButton assignment={assignment} />
          </div>
        </div>
      </div>

      <section aria-label="Assignment metrics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Completed"
          value={`${stats.completed} / ${stats.eligible}`}
          hint={`${formatPercent(stats.eligible ? stats.completed / stats.eligible : null)} of assigned students`}
        />
        <StatTile label="Started" value={stats.started} hint={`${stats.readyToComplete} ready to hand in`} />
        <StatTile label="Average time" value={formatDuration(stats.avgTimeSeconds)} hint="Active time, students who started" />
        <StatTile
          label="May need attention"
          value={stats.needsAttention}
          hint="See evidence in the table"
          tone={stats.needsAttention ? "attention" : "default"}
        />
      </section>

      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium">Completion</span>
          <span className="text-muted-foreground">
            {stats.completed} of {stats.eligible} students
          </span>
        </div>
        <Meter value={stats.completed} max={Math.max(stats.eligible, 1)} label="Completion" />
        <button
          onClick={() => setShowGuidance((s) => !s)}
          aria-expanded={showGuidance}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Tutor guidance <ChevronDown className={`size-4 transition-transform ${showGuidance ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {showGuidance && (
          <p className="mt-2 whitespace-pre-wrap rounded-md bg-surface-muted p-3 text-sm text-muted-foreground">
            {assignment.instructions || "No extra guidance — the tutor uses its default approach."}
          </p>
        )}
      </div>

      <section aria-labelledby="students-title" className="space-y-4">
        <h2 id="students-title" className="text-section-title">
          Student progress
        </h2>
        {progress.length === 0 ? (
          <EmptyState
            icon={<MessageSquareText />}
            title="No one has started yet"
            description={
              assignment.status === "scheduled"
                ? "Students will see this assignment once it's released."
                : "Insights will appear here as soon as students begin their tutoring sessions."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Questions</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead>Last active</TableHead>
                    <TableHead className="min-w-[220px]">May need attention</TableHead>
                    <TableHead>
                      <span className="sr-only">Conversation</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progress.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell>
                        <p className="font-medium">{row.studentName}</p>
                        <p className="text-xs text-muted-foreground">{row.studentEmail}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {row.practiceCompleted} / {PRACTICE_QUESTIONS}
                      </TableCell>
                      <TableCell className="tabular text-right">{formatDuration(row.totalTimeSeconds)}</TableCell>
                      <TableCell className="tabular text-right">{row.messageCount}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatRelative(row.lastActiveAt)}</TableCell>
                      <TableCell>
                        <InsightList insights={row.insights} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setStudent({ id: row.studentId, name: row.studentName })}>
                          View chat
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>

      {notStartedTotal > 0 && assignment.status !== "scheduled" && (
        <section aria-labelledby="not-started-title" className="space-y-3">
          <h2 id="not-started-title" className="text-section-title">
            Not started <span className="text-muted-foreground">({notStartedTotal})</span>
          </h2>
          {notStartedNote && <p className="text-helper">{notStartedNote}</p>}
          <ul className="flex flex-wrap gap-2">
            {notStarted.map((s) => (
              <li key={s.studentId} className="rounded-full border bg-card px-3 py-1 text-sm">
                {s.studentName}
              </li>
            ))}
            {notStartedTotal > notStarted.length && (
              <li className="px-2 py-1 text-sm text-muted-foreground">and {notStartedTotal - notStarted.length} more</li>
            )}
          </ul>
        </section>
      )}

      <TranscriptSheet assignmentId={assignment.id} student={student} onClose={() => setStudent(null)} />
      {editing && <EditAssignmentDialog assignment={assignment} startedCount={stats.started} open={editing} onOpenChange={setEditing} />}
    </div>
  );
}
