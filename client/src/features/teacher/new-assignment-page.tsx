import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Pencil, Search, Send, Users, UserCheck } from "lucide-react";
import type { AssignmentDto, CreateAssignmentInput } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, fieldProps } from "@/features/auth/auth-layout";
import { useAuth } from "@/features/auth/use-auth";
import { PageHeader } from "@/components/common/states";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, fieldErrors, apiPost } from "@/lib/api";
import { formatDate, localInputToIso, toLocalInputValue } from "@/lib/format";
import { queryClient, queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";

interface Draft {
  topic: string;
  subject: string;
  grade: string;
  audience: "school" | "selected";
  studentIds: string[];
  instructions: string;
  releaseMode: "now" | "later";
  releaseAt: string; // datetime-local value
  dueAt: string; // datetime-local value or ""
}

const STEPS = ["Details", "Students", "Tutor guidance", "Schedule", "Review"] as const;
const GRADES = ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13"];
const GUIDANCE_IDEAS = [
  "Focus on real-world examples.",
  "Check they can explain key vocabulary in their own words.",
  "Pitch questions at foundation level and build up slowly.",
  "Challenge confident students with an exam-style question.",
];

const draftKey = (userId: string) => `learnify-assignment-draft:${userId}`;

function emptyDraft(subject: string): Draft {
  const later = new Date(Date.now() + 60 * 60 * 1000);
  later.setMinutes(0, 0, 0);
  return {
    topic: "",
    subject,
    grade: "",
    audience: "school",
    studentIds: [],
    instructions: "",
    releaseMode: "now",
    releaseAt: toLocalInputValue(later),
    dueAt: "",
  };
}

function validate(step: number, d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 0) {
    if (d.topic.trim().length < 3) e.topic = "Topic must be at least 3 characters";
    if (d.subject.trim().length < 2) e.subject = "Please enter a subject";
    if (!d.grade.trim()) e.grade = "Please choose a year or grade";
  }
  if (step === 1 && d.audience === "selected" && d.studentIds.length === 0) e.studentIds = "Choose at least one student";
  if (step === 2 && d.instructions.length > 2000) e.instructions = "Please keep guidance under 2000 characters";
  if (step === 3) {
    const release = d.releaseMode === "now" ? new Date() : new Date(d.releaseAt);
    if (d.releaseMode === "later" && (!d.releaseAt || Number.isNaN(release.getTime()))) e.releaseAt = "Choose a release date and time";
    else if (d.releaseMode === "later" && release.getTime() < Date.now() - 60_000)
      e.releaseAt = "Choose a time in the future, or release now";
    if (d.dueAt && new Date(d.dueAt) <= release) e.dueAt = "The due date must be after the release time";
  }
  return e;
}

function StudentPicker({ draft, update, error }: { draft: Draft; update: (p: Partial<Draft>) => void; error?: string }) {
  const { user } = useAuth();
  const roster = useQuery<{ id: string; name: string; email: string }[]>({
    queryKey: queryKeys.roster,
    enabled: draft.audience === "selected",
  });
  const [search, setSearch] = useState("");
  const filtered = (roster.data ?? []).filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  const selected = new Set(draft.studentIds);

  const Option = ({ value, icon: Icon, title, body }: { value: Draft["audience"]; icon: typeof Users; title: string; body: string }) => (
    <button
      type="button"
      role="radio"
      aria-checked={draft.audience === value}
      onClick={() => update({ audience: value })}
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        draft.audience === value && "border-primary ring-4 ring-primary/10",
      )}
    >
      <Icon className="mt-0.5 size-5 text-primary" aria-hidden />
      <span>
        <span className="block text-card-title">{title}</span>
        <span className="block text-helper">{body}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Who should do this assignment" className="grid gap-3 sm:grid-cols-2">
        <Option
          value="school"
          icon={Users}
          title="Everyone at my school"
          body={`All students at ${user?.school ?? "your school"}, including ones who join later.`}
        />
        <Option value="selected" icon={UserCheck} title="Choose students" body="Only the students you pick will see it." />
      </div>
      {draft.audience === "selected" && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center gap-3 border-b p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                aria-label="Search students"
                placeholder="Search students"
                className="h-10 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <span className="shrink-0 text-sm text-muted-foreground" aria-live="polite">
              {draft.studentIds.length} selected
            </span>
          </div>
          <ul className="max-h-72 overflow-y-auto p-2" aria-label="Students">
            {roster.isLoading && <li className="p-3 text-helper">Loading students…</li>}
            {roster.data?.length === 0 && <li className="p-3 text-helper">No students at your school have signed up yet.</li>}
            {filtered.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={(c) =>
                      update({ studentIds: c ? [...draft.studentIds, s.id] : draft.studentIds.filter((id) => id !== s.id) })
                    }
                  />
                  <span className="text-sm">
                    <span className="font-medium">{s.name}</span> <span className="text-muted-foreground">{s.email}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default function NewAssignmentPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const key = draftKey(user?.id ?? "anon");
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return { ...emptyDraft(user?.subject ?? ""), ...JSON.parse(saved) };
    } catch {
      /* ignore */
    }
    return emptyDraft(user?.subject ?? "");
  });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = draft.topic !== "" || draft.instructions !== "";

  // Autosave the draft so accidental navigation or a refresh never loses work.
  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft, dirty, key]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const payload = useMemo<CreateAssignmentInput>(
    () => ({
      topic: draft.topic.trim(),
      subject: draft.subject.trim(),
      grade: draft.grade.trim(),
      instructions: draft.instructions.trim(),
      audience: draft.audience,
      studentIds: draft.audience === "selected" ? draft.studentIds : undefined,
      releaseAt: draft.releaseMode === "now" ? new Date().toISOString() : localInputToIso(draft.releaseAt),
      dueAt: draft.dueAt ? localInputToIso(draft.dueAt) : null,
    }),
    [draft],
  );

  const create = useMutation({
    mutationFn: () =>
      apiPost<AssignmentDto>("/api/teacher/assignments", {
        ...payload,
        releaseAt: draft.releaseMode === "now" ? new Date().toISOString() : payload.releaseAt,
      }),
    onSuccess: (a) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/assignments"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.teacherOverview });
      toast({
        title: a.status === "scheduled" ? "Assignment scheduled" : "Assignment published",
        description: a.status === "scheduled" ? `Students will see it ${formatDate(a.releaseAt)}.` : "Students can start now.",
      });
      navigate(`/teacher/assignments/${a.id}`, { replace: true });
    },
    onError: (e) => {
      const f = fieldErrors(e);
      if (Object.keys(f).length) {
        setErrors(f);
        setStep(f.topic || f.subject || f.grade ? 0 : f.studentIds ? 1 : f.instructions ? 2 : 3);
      }
    },
  });

  const next = () => {
    const e = validate(step, draft);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-up">
      <div>
        <Link href="/teacher/assignments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Assignments
        </Link>
        <PageHeader
          className="mt-3"
          title="New assignment"
          description={
            dirty ? "Your draft is saved automatically on this device." : "Set up homework for the AI tutor to guide students through."
          }
        />
      </div>

      <nav aria-label="Progress">
        <ol className="grid grid-cols-5 gap-2">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => i < step && setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className="group w-full text-left disabled:cursor-default"
              >
                <span className={cn("block h-1.5 rounded-full bg-muted transition-colors", i <= step && "bg-primary")} />
                <span className={cn("mt-2 hidden text-xs font-medium text-muted-foreground sm:block", i === step && "text-foreground")}>
                  {i < step && <Check className="mr-1 inline size-3 text-success" aria-hidden />}
                  {label}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm font-medium sm:hidden">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </nav>

      <form
        className="surface space-y-6 p-5 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) next();
          else create.mutate();
        }}
        noValidate
      >
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-section-title">What's the homework about?</h2>
            <FormField
              id="topic"
              label="Topic"
              error={errors.topic}
              hint="Be specific — e.g. “Photosynthesis: the light-dependent reactions”."
            >
              <Input
                {...fieldProps("topic", errors.topic, "x")}
                autoFocus
                maxLength={200}
                value={draft.topic}
                onChange={(e) => update({ topic: e.target.value })}
              />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField id="subject" label="Subject" error={errors.subject}>
                <Input
                  {...fieldProps("subject", errors.subject)}
                  maxLength={100}
                  value={draft.subject}
                  onChange={(e) => update({ subject: e.target.value })}
                />
              </FormField>
              <FormField id="grade" label="Year / grade" error={errors.grade}>
                <Input
                  {...fieldProps("grade", errors.grade)}
                  list="grade-options"
                  maxLength={50}
                  placeholder="e.g. Year 10"
                  value={draft.grade}
                  onChange={(e) => update({ grade: e.target.value })}
                />
                <datalist id="grade-options">
                  {GRADES.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </FormField>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-section-title">Who should do it?</h2>
            <StudentPicker draft={draft} update={update} error={errors.studentIds} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-section-title">Guide the tutor (optional)</h2>
              <p className="mt-1 text-helper">
                Tell the tutor what to focus on, the level to pitch at, or examples to use. It always keeps its safety rules and the
                question-by-question structure.
              </p>
            </div>
            <FormField
              id="instructions"
              label="Guidance for the tutor"
              error={errors.instructions}
              hint={`${draft.instructions.length} / 2000`}
            >
              <Textarea
                {...fieldProps("instructions", errors.instructions, "x")}
                rows={6}
                maxLength={2000}
                value={draft.instructions}
                onChange={(e) => update({ instructions: e.target.value })}
              />
            </FormField>
            <div>
              <p className="mb-2 text-label">Ideas</p>
              <div className="flex flex-wrap gap-2">
                {GUIDANCE_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => update({ instructions: (draft.instructions ? `${draft.instructions.trim()} ` : "") + idea })}
                    className="rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    + {idea}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-section-title">When should students see it?</h2>
            <div role="radiogroup" aria-label="Release time" className="grid gap-3 sm:grid-cols-2">
              {(["now", "later"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={draft.releaseMode === mode}
                  onClick={() => update({ releaseMode: mode })}
                  className={cn(
                    "rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/40",
                    draft.releaseMode === mode && "border-primary ring-4 ring-primary/10",
                  )}
                >
                  <span className="block text-card-title">{mode === "now" ? "Release now" : "Schedule for later"}</span>
                  <span className="block text-helper">
                    {mode === "now"
                      ? "Students can start straight away and get notified."
                      : "Students see it and get notified at the time you choose."}
                  </span>
                </button>
              ))}
            </div>
            {draft.releaseMode === "later" && (
              <FormField
                id="releaseAt"
                label="Release at"
                error={errors.releaseAt}
                hint={`Your time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
              >
                <Input
                  {...fieldProps("releaseAt", errors.releaseAt, "x")}
                  type="datetime-local"
                  value={draft.releaseAt}
                  onChange={(e) => update({ releaseAt: e.target.value })}
                />
              </FormField>
            )}
            <FormField id="dueAt" label="Due (optional)" error={errors.dueAt} hint="Shown to students to help them plan.">
              <Input
                {...fieldProps("dueAt", errors.dueAt, "x")}
                type="datetime-local"
                value={draft.dueAt}
                onChange={(e) => update({ dueAt: e.target.value })}
              />
            </FormField>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-section-title">Review and publish</h2>
            <dl className="divide-y rounded-lg border">
              {[
                { label: "Topic", value: `${draft.topic} · ${draft.subject} · ${draft.grade}`, step: 0 },
                {
                  label: "Students",
                  value: draft.audience === "school" ? `Everyone at ${user?.school}` : `${draft.studentIds.length} selected students`,
                  step: 1,
                },
                { label: "Tutor guidance", value: draft.instructions || "Default approach", step: 2 },
                {
                  label: "Schedule",
                  value: `${draft.releaseMode === "now" ? "Release now" : `Release ${formatDate(localInputToIso(draft.releaseAt))}`}${draft.dueAt ? ` · Due ${formatDate(localInputToIso(draft.dueAt))}` : ""}`,
                  step: 3,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <dt className="text-label text-muted-foreground">{row.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-body">{row.value}</dd>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep(row.step)}
                    aria-label={`Edit ${row.label.toLowerCase()}`}
                  >
                    <Pencil aria-hidden /> Edit
                  </Button>
                </div>
              ))}
            </dl>
            {create.error && !Object.keys(fieldErrors(create.error)).length && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {errorMessage(create.error)}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-6">
          <Button type="button" variant="ghost" onClick={() => (step === 0 ? navigate("/teacher/assignments") : setStep(step - 1))}>
            <ArrowLeft aria-hidden /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="submit">
              Continue <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button type="submit" loading={create.isPending}>
              <Send aria-hidden /> {draft.releaseMode === "now" ? "Publish to students" : "Schedule assignment"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
