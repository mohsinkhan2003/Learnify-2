import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpenCheck, CheckCircle2, ClipboardList, Plus, Sparkles, Users, X, AlertTriangle } from "lucide-react";
import type { TeacherOverview } from "@shared/api";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/common/metrics";
import { CardSkeleton, EmptyState, ErrorState, PageHeader } from "@/components/common/states";
import { useAuth } from "@/features/auth/use-auth";
import { firstName, formatPercent, greeting } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { AssignmentCard, InsightList, TranscriptSheet } from "./components";

const ONBOARDING_KEY = "learnify-teacher-onboarding-dismissed";

function Onboarding({ onDismiss }: { onDismiss: () => void }) {
  const steps = [
    { title: "Create a class", body: "Share its join code — students enter it when they sign up." },
    { title: "Set an assignment", body: "Pick a topic, add tutor guidance, release now or later." },
    { title: "Students work with the tutor", body: "By voice or text, one question at a time." },
    { title: "Review progress", body: "See completion, time spent and who may need help." },
  ];
  return (
    <section
      aria-labelledby="onboarding-title"
      className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary-soft via-card to-accent p-6 shadow-sm"
    >
      <button
        onClick={onDismiss}
        className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-card/70"
        aria-label="Dismiss getting started guide"
      >
        <X className="size-4" />
      </button>
      <p className="text-eyebrow">Getting started</p>
      <h2 id="onboarding-title" className="mt-1 text-section-title">
        How Learnify works
      </h2>
      <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-sm font-semibold text-primary shadow-xs">
              {i + 1}
            </span>
            <div>
              <p className="text-label">{s.title}</p>
              <p className="text-helper">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/teacher/classes">
            <Plus aria-hidden /> Create a class
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/teacher/assignments/new">New assignment</Link>
        </Button>
      </div>
    </section>
  );
}

export default function TeacherOverviewPage() {
  const { user } = useAuth();
  const query = useQuery<TeacherOverview>({ queryKey: queryKeys.teacherOverview, refetchInterval: 60_000 });
  const [student, setStudent] = useState<{ id: string; name: string; assignmentId: string } | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (window.location.hash === "#attention" && query.data) document.getElementById("attention")?.scrollIntoView({ behavior: "smooth" });
  }, [query.data]);

  const data = query.data;
  const isNew = data && data.metrics.activeAssignments === 0 && data.metrics.scheduledAssignments === 0;

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting()}, ${firstName(user?.name)}`}
        description="Here's how your students are getting on."
        actions={
          <Button asChild>
            <Link href="/teacher/assignments/new">
              <Plus aria-hidden /> New assignment
            </Link>
          </Button>
        }
      />

      {query.error && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      {isNew && !onboardingDismissed && (
        <Onboarding
          onDismiss={() => {
            setOnboardingDismissed(true);
            try {
              localStorage.setItem(ONBOARDING_KEY, "1");
            } catch {
              /* ignore */
            }
          }}
        />
      )}

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {!data ? (
          Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <StatTile
              label="Active assignments"
              value={data.metrics.activeAssignments}
              hint={data.metrics.scheduledAssignments ? `${data.metrics.scheduledAssignments} scheduled` : "Released to students"}
              icon={<BookOpenCheck />}
            />
            <StatTile
              label="Students participating"
              value={data.metrics.studentsParticipating}
              hint="Started at least one assignment"
              icon={<Users />}
            />
            <StatTile
              label="Completion rate"
              value={formatPercent(data.metrics.completionRate)}
              hint="Completed ÷ assigned, active work"
              icon={<CheckCircle2 />}
            />
            <StatTile
              label="May need attention"
              value={data.metrics.needsAttention}
              hint="Students with at least one signal"
              icon={<AlertTriangle />}
              tone={data.metrics.needsAttention ? "attention" : "default"}
            />
          </>
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="recent-title" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="recent-title" className="text-section-title">
              Active assignments
            </h2>
            <Link href="/teacher/assignments" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          {!data ? (
            <div className="grid gap-4 md:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : data.recentAssignments.length === 0 ? (
            <EmptyState
              icon={<ClipboardList />}
              title="No active assignments"
              description="Create an assignment and it will appear here with live progress once students start."
              action={
                <Button asChild variant="outline">
                  <Link href="/teacher/assignments/new">
                    <Plus aria-hidden /> New assignment
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.recentAssignments.map((a) => (
                <AssignmentCard key={a.id} assignment={a} />
              ))}
            </div>
          )}
        </section>

        <section id="attention" aria-labelledby="attention-title" className="scroll-mt-24 space-y-4">
          <div>
            <h2 id="attention-title" className="text-section-title">
              May need attention
            </h2>
            <p className="text-helper">Simple signals from stored activity. Open a conversation to see the evidence.</p>
          </div>
          <div className="rounded-lg border bg-card shadow-sm">
            {!data ? (
              <div className="p-5">
                <CardSkeleton className="border-0 p-0" />
              </div>
            ) : data.attention.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <Sparkles className="mb-3 size-6 text-success" aria-hidden />
                <p className="text-label">Nothing to flag right now</p>
                <p className="mt-1 text-helper">Signals appear here once students begin working on assignments.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.attention.map((item) => (
                  <li key={`${item.studentId}-${item.assignmentId}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-label">{item.studentName}</p>
                        <Link href={`/teacher/assignments/${item.assignmentId}`} className="block truncate text-helper hover:text-primary">
                          {item.assignmentTopic}
                        </Link>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStudent({ id: item.studentId, name: item.studentName, assignmentId: item.assignmentId })}
                      >
                        View chat
                      </Button>
                    </div>
                    <div className="mt-3">
                      <InsightList insights={item.insights} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <TranscriptSheet assignmentId={student?.assignmentId ?? ""} student={student} onClose={() => setStudent(null)} />
    </div>
  );
}
