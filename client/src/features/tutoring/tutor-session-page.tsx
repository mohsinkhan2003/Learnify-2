import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, CalendarClock, CheckCircle2, Keyboard, Mic, PartyPopper, Sparkles } from "lucide-react";
import type { TutorSessionDto } from "@shared/api";
import { STAGE_STEPS, stepIndexForStage } from "@shared/tutor";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "@/components/common/logo";
import { ErrorState, FullPageSpinner } from "@/components/common/states";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { ApiError, errorMessage } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Composer, MessageList, TutorAvatar } from "./conversation";
import { useTutorSession } from "./use-tutor-session";
import { useVoice } from "./voice/use-voice";
import { MicDeniedHelp, SpeakerToggle, VoiceButton, voiceStatusText } from "./voice/voice-control";

function StageSteps({ session }: { session: TutorSessionDto }) {
  const current = stepIndexForStage(session.progress.tutorStage);
  const { practiceCompleted, practiceTotal, tutorStage } = session.progress;
  return (
    <div>
      <ol className="flex items-center gap-1.5" aria-label="Session progress">
        {STAGE_STEPS.map((step, i) => (
          <li key={step.key} className="flex flex-1 flex-col gap-1.5" aria-current={i === current ? "step" : undefined}>
            <span
              className={cn(
                "h-1.5 rounded-full bg-muted transition-colors duration-500",
                i < current && "bg-primary",
                i === current && "bg-primary/60",
              )}
            />
            <span className={cn("hidden text-[0.6875rem] font-medium text-muted-foreground md:block", i === current && "text-foreground")}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-1.5 text-xs text-muted-foreground md:hidden">
        {STAGE_STEPS[current]?.label}
        {tutorStage === "GUIDED_PRACTICE" && ` · question ${Math.min(practiceCompleted + 1, practiceTotal)} of ${practiceTotal}`}
      </p>
      {tutorStage === "GUIDED_PRACTICE" && (
        <p className="mt-1 hidden text-xs text-muted-foreground md:block">
          Practice question {Math.min(practiceCompleted + 1, practiceTotal)} of {practiceTotal}
        </p>
      )}
    </div>
  );
}

function StartScreen({
  session,
  voiceAvailable,
  onStart,
  starting,
  error,
}: {
  session: TutorSessionDto;
  voiceAvailable: boolean;
  onStart: (withVoice: boolean) => void;
  starting: boolean;
  error: unknown;
}) {
  const { assignment } = session;
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-10">
      <div className="w-full max-w-lg text-center animate-fade-up">
        <div className="relative mx-auto mb-6 w-fit">
          <span className="absolute inset-0 animate-breathe rounded-full bg-primary/20 blur-xl motion-reduce:animate-none" aria-hidden />
          <TutorAvatar className="relative h-20 w-20 [&_svg]:size-9" />
        </div>
        <p className="text-eyebrow">
          {assignment.subject} · {assignment.grade}
        </p>
        <h1 className="mt-2 text-page-title">{assignment.topic}</h1>
        <p className="mt-2 text-body text-muted-foreground">
          {assignment.teacherName ? `Set by ${assignment.teacherName}. ` : ""}Your tutor will chat with you, ask questions one at a time and
          help if you get stuck.
        </p>
        {assignment.dueAt && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4" aria-hidden /> Due {formatShortDate(assignment.dueAt)}
          </p>
        )}
        <ul className="glass mx-auto mt-6 grid gap-3 rounded-xl p-4 text-left text-sm shadow-sm sm:grid-cols-3">
          {["A quick warm-up", "5 questions that make you think", "A summary, then hand it in"].map((t, i) => (
            <li key={t} className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[0.6875rem] font-semibold text-primary">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {voiceAvailable && (
            <Button size="lg" onClick={() => onStart(true)} loading={starting}>
              <Mic aria-hidden /> Start talking
            </Button>
          )}
          <Button size="lg" variant={voiceAvailable ? "outline" : "default"} onClick={() => onStart(false)} disabled={starting}>
            <Keyboard aria-hidden /> {voiceAvailable ? "Type instead" : "Start"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        <p className="mt-6 text-xs text-muted-foreground">Your voice is turned into text for the conversation. Recordings aren't stored.</p>
      </div>
    </div>
  );
}

function Celebration({ session }: { session: TutorSessionDto }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-success/25 bg-gradient-to-br from-success-soft via-card to-primary-soft p-5 shadow-md animate-fade-up"
      role="status"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success text-white">
          <PartyPopper className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-card-title">Homework complete — well done!</p>
          <p className="text-helper">Your teacher can see you've finished. You can read back through the conversation any time.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/student">Back to my homework</Link>
        </Button>
      </div>
      {session.progress.summary && <p className="sr-only">Summary: {session.progress.summary}</p>}
    </div>
  );
}

export default function TutorSessionPage() {
  const { id } = useParams<{ id: string }>();
  const { session, start, send, pending, discardPending, complete } = useTutorSession(id!);
  const [draft, setDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const data = session.data;

  const voice = useVoice({
    onUtterance: (text) => send(text, "voice"),
    transcriptionEnabled: data?.limits.transcriptionEnabled ?? false,
    maxSeconds: data?.limits.maxAudioSeconds ?? 60,
  });

  // Stop the microphone and speech when leaving the page or finishing.
  const finished = data?.progress.status === "completed";
  useEffect(() => {
    if (finished) voice.cancel();
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session.isLoading) return <FullPageSpinner label="Loading your homework" />;
  if (session.error || !data) {
    const missing = session.error instanceof ApiError && session.error.status === 404;
    return (
      <div className="app-backdrop min-h-dvh p-6">
        {missing ? (
          <div className="mx-auto max-w-md pt-20 text-center">
            <h1 className="text-page-title">This homework isn't available</h1>
            <p className="mt-2 text-body text-muted-foreground">It may have been removed by your teacher, or isn't released yet.</p>
            <Button asChild className="mt-6">
              <Link href="/student">Back to my homework</Link>
            </Button>
          </div>
        ) : (
          <ErrorState error={session.error} onRetry={() => session.refetch()} />
        )}
      </div>
    );
  }

  const { assignment, progress, messages } = data;
  const notStarted = progress.tutorStage === "NOT_STARTED" && messages.length === 0;
  const voiceBusy = ["requesting", "listening", "transcribing", "thinking"].includes(voice.status);
  const thinking = pending?.state === "sending";
  const status = voiceStatusText(voice.status);
  const voiceAvailable = voice.status !== "unsupported";

  const handleStart = (withVoice: boolean) => {
    start.mutate(undefined, {
      onSuccess: async (fresh) => {
        const greeting = [...fresh.messages].reverse().find((m) => m.role === "ai")?.content;
        if (withVoice) {
          if (greeting) await voice.speak(greeting);
          await voice.startListening();
        } else {
          setTimeout(() => composerRef.current?.focus(), 50);
        }
      },
    });
  };

  const sendText = async () => {
    const text = draft.trim();
    if (!text) return;
    voice.cancel();
    setDraft("");
    const reply = await send(text, "text");
    if (reply === null) setDraft((d) => d || ""); // failed: the bubble offers Retry / Edit
  };

  return (
    <div className="app-backdrop flex h-dvh flex-col">
      <header className="glass z-20 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Button asChild variant="ghost" size="icon-sm" className="shrink-0">
            <Link href="/student" aria-label="Back to my homework">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="hidden sm:block">
            <Logo compact />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-card-title">{assignment.topic}</p>
            <p className="truncate text-xs text-muted-foreground">
              {assignment.subject} · {assignment.grade}
            </p>
          </div>
          {!notStarted && !finished && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={progress.canComplete ? -1 : 0}>
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!progress.canComplete}
                    variant={progress.canComplete ? "default" : "outline"}
                    size="sm"
                  >
                    <CheckCircle2 aria-hidden /> Complete
                  </Button>
                </span>
              </TooltipTrigger>
              {!progress.canComplete && <TooltipContent>Finish the conversation with your tutor to unlock this.</TooltipContent>}
            </Tooltip>
          )}
          {finished && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" aria-hidden /> Completed
            </span>
          )}
        </div>
        {!notStarted && (
          <div className="mx-auto max-w-5xl px-4 pb-3 sm:px-6">
            <StageSteps session={data} />
          </div>
        )}
      </header>
      <OfflineBanner />

      {notStarted ? (
        <StartScreen session={data} voiceAvailable={voiceAvailable} onStart={handleStart} starting={start.isPending} error={start.error} />
      ) : (
        <>
          <MessageList
            messages={messages}
            pending={pending}
            thinking={!!thinking}
            liveTranscript={voice.status === "listening" ? voice.interim : undefined}
            onRetry={() => pending && send(pending.content, pending.source, pending)}
            onEdit={() => {
              if (pending) setDraft(pending.content);
              discardPending();
              composerRef.current?.focus();
            }}
            onReplay={voiceAvailable && voice.prefs.speechOn ? (t) => voice.speak(t) : undefined}
          />

          <div className="safe-bottom z-10 px-3 pt-2 sm:px-6">
            <div className="mx-auto max-w-3xl space-y-3">
              {finished ? (
                <Celebration session={data} />
              ) : (
                <>
                  {progress.canComplete && (
                    <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary-soft/80 p-3 text-sm sm:flex-row sm:items-center">
                      <Sparkles className="hidden size-5 shrink-0 text-primary sm:block" aria-hidden />
                      <p className="flex-1">
                        You've reached the summary. Read it through, ask a quick follow-up if you like, then hand it in.
                      </p>
                      <Button size="sm" onClick={() => setConfirmOpen(true)}>
                        <CheckCircle2 aria-hidden /> Hand in homework
                      </Button>
                    </div>
                  )}
                  {voice.status === "denied" && <MicDeniedHelp onDismiss={voice.resetDenied} />}

                  <div className="glass rounded-2xl p-3 shadow-lg">
                    <div className="flex items-center gap-3">
                      {voiceAvailable && (
                        <VoiceButton
                          size="md"
                          status={voice.status}
                          level={voice.level}
                          onStart={() => voice.startListening()}
                          onStop={voice.stopListening}
                          onInterrupt={() => voice.startListening()}
                        />
                      )}
                      <Composer
                        inputRef={composerRef}
                        value={draft}
                        onChange={setDraft}
                        onSend={sendText}
                        disabled={voiceBusy || !!thinking}
                        maxLength={data.limits.maxMessageLength}
                        placeholder={
                          progress.canComplete
                            ? "Ask a follow-up, or hand in your homework"
                            : voiceAvailable
                              ? "Or type your answer…"
                              : "Type your answer…"
                        }
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
                      <p className="text-xs" role="status" aria-live="polite">
                        {voiceAvailable ? (
                          <>
                            <span className={cn("font-medium", voice.status === "listening" ? "text-primary" : "text-foreground")}>
                              {status.title}
                            </span>
                            <span className="text-muted-foreground"> · {voice.hint ?? status.detail}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Voice isn't supported in this browser — try Chrome, Edge or Safari. Typing works everywhere.
                          </span>
                        )}
                      </p>
                      {voiceAvailable && (
                        <div className="flex items-center gap-1">
                          <SpeakerToggle
                            on={voice.prefs.speechOn}
                            onToggle={() => voice.updatePrefs({ speechOn: !voice.prefs.speechOn })}
                          />
                          <button
                            type="button"
                            aria-pressed={voice.prefs.handsFree}
                            onClick={() => voice.updatePrefs({ handsFree: !voice.prefs.handsFree })}
                            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {voice.prefs.handsFree ? "Hands-free on" : "Hands-free off"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hand in your homework?</AlertDialogTitle>
            <AlertDialogDescription>
              Your teacher will see that you've finished. You'll still be able to read this conversation afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {complete.error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(complete.error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                complete.mutate(undefined, { onSuccess: () => setConfirmOpen(false) });
              }}
              disabled={complete.isPending}
            >
              {complete.isPending ? "Handing in…" : "Hand it in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
