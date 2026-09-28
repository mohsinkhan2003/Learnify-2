import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, BookOpen, CalendarClock, CheckCircle2, Mic, PartyPopper, X } from "lucide-react";
import type { StudentAssignmentListItem } from "@shared/api";
import { PRACTICE_QUESTIONS } from "@shared/tutor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Meter, StatusBadge } from "@/components/common/metrics";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common/states";
import { useAuth } from "@/features/auth/use-auth";
import { usePush } from "@/features/notifications/use-push";
import { firstName, formatShortDate, greeting } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";

const ONBOARDING_KEY = "learnify-student-onboarding-dismissed";
const PUSH_PROMPT_KEY = "learnify-push-prompt-dismissed";
const NEW_WINDOW_MS = 48 * 60 * 60 * 1000;

function useDismissed(key: string) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  return [
    dismissed,
    () => {
      setDismissed(true);
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    },
  ] as const;
}

function actionFor(a: StudentAssignmentListItem): { label: string; variant: "default" | "outline" | "soft" } {
  const status = a.progress?.status ?? "not_started";
  if (status === "completed") return { label: "Review", variant: "outline" };
  if (status === "summary_provided") return { label: "Hand in", variant: "default" };
  if (status === "in_progress") return { label: "Continue", variant: "default" };
  return { label: "Start", variant: "default" };
}

function HomeworkCard({ a }: { a: StudentAssignmentListItem }) {
  const status = a.progress?.status ?? "not_started";
  const isNew = status === "not_started" && Date.now() - new Date(a.releaseAt).getTime() < NEW_WINDOW_MS;
  const overdue = a.dueAt && status !== "completed" && new Date(a.dueAt) < new Date();
  const action = actionFor(a);
  return (
    <Link
      href={`/student/assignments/${a.id}`}
      className="interactive-card group flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center"
    >
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
          status === "completed" ? "bg-success-soft text-success" : "bg-primary-soft text-primary",
        )}
      >
        {status === "completed" ? <CheckCircle2 className="size-6" aria-hidden /> : <BookOpen className="size-6" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-eyebrow">
            {a.subject} · {a.grade}
          </p>
          {isNew && <Badge variant="accent">New</Badge>}
        </div>
        <h3 className="mt-1 text-card-title group-hover:text-primary">{a.topic}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <StatusBadge status={status} />
          {a.teacherName && <span>{a.teacherName}</span>}
          {a.dueAt && (
            <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-destructive")}>
              <CalendarClock className="size-3.5" aria-hidden />
              {overdue ? "Overdue" : "Due"} {formatShortDate(a.dueAt)}
            </span>
          )}
        </div>
        {status === "in_progress" && a.progress && (
          <div className="mt-3 max-w-xs">
            <Meter
              value={a.progress.practiceCompleted}
              max={PRACTICE_QUESTIONS}
              label={`${a.progress.practiceCompleted} of ${PRACTICE_QUESTIONS} practice questions done`}
            />
          </div>
        )}
      </div>
      <span className="shrink-0">
        <span
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
            action.variant === "outline" ? "border bg-card" : "bg-primary text-primary-foreground group-hover:bg-primary/90",
          )}
        >
          {action.label} <ArrowRight className="size-4" aria-hidden />
        </span>
      </span>
    </Link>
  );
}

function Section({ title, items, emptyHint }: { title: string; items: StudentAssignmentListItem[]; emptyHint?: string }) {
  if (items.length === 0 && !emptyHint) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-section-title">
        {title} <span className="text-muted-foreground">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-helper">{emptyHint}</p>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <HomeworkCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </section>
  );
}

function NotificationPrompt() {
  const { state, enable, busy } = usePush();
  const [dismissed, dismiss] = useDismissed(PUSH_PROMPT_KEY);
  if (dismissed || state !== "off") return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
        <Bell className="size-5" aria-hidden />
      </span>
      <div className="flex-1">
        <p className="text-label">Get a heads-up when new homework arrives</p>
        <p className="text-helper">We'll only notify you about new assignments. You can turn this off any time.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
        <Button variant="soft" onClick={() => enable().catch(() => undefined)} loading={busy}>
          Turn on
        </Button>
      </div>
    </div>
  );
}

export default function StudentHomePage() {
  const { user } = useAuth();
  const query = useQuery<StudentAssignmentListItem[]>({ queryKey: queryKeys.studentAssignments, refetchInterval: 60_000 });
  const [onboardingDismissed, dismissOnboarding] = useDismissed(ONBOARDING_KEY);

  const items = query.data ?? [];
  const byDue = (a: StudentAssignmentListItem, b: StudentAssignmentListItem) =>
    (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity) ||
    new Date(b.releaseAt).getTime() - new Date(a.releaseAt).getTime();
  const inProgress = items.filter((a) => a.progress?.status === "in_progress" || a.progress?.status === "summary_provided").sort(byDue);
  const toDo = items.filter((a) => !a.progress || a.progress.status === "not_started").sort(byDue);
  const done = items.filter((a) => a.progress?.status === "completed");
  const outstanding = inProgress.length + toDo.length;

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-1">
        <h1 className="text-page-title">
          {greeting()}, {firstName(user?.name)}
        </h1>
        <p className="text-body text-muted-foreground">
          {query.isLoading
            ? "Loading your homework…"
            : outstanding === 0
              ? "You're all caught up."
              : `You have ${outstanding} piece${outstanding === 1 ? "" : "s"} of homework to do.`}
        </p>
      </header>

      {!onboardingDismissed && (
        <section
          aria-labelledby="how-title"
          className="relative rounded-xl border bg-gradient-to-br from-primary-soft via-card to-accent p-5 shadow-sm sm:p-6"
        >
          <button
            onClick={dismissOnboarding}
            className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-card/70"
            aria-label="Dismiss how it works"
          >
            <X className="size-4" />
          </button>
          <h2 id="how-title" className="text-card-title">
            How it works
          </h2>
          <ol className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-5">
            {["Pick your homework", "Talk (or type) to your tutor", "Answer its questions", "Read your summary", "Press Complete"].map(
              (s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-primary shadow-xs">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ),
            )}
          </ol>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mic className="size-3.5" aria-hidden /> Tip: voice works best in Chrome, Edge or Safari. You can always type instead.
          </p>
        </section>
      )}

      <NotificationPrompt />

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PartyPopper />}
          title="No homework right now"
          description="When your teacher sets something, it'll show up here — and we'll let you know if notifications are on."
        />
      ) : (
        <div className="space-y-8">
          <Section title="In progress" items={inProgress} />
          <Section title="To do" items={toDo} />
          <Section title="Completed" items={done} />
        </div>
      )}
    </div>
  );
}
