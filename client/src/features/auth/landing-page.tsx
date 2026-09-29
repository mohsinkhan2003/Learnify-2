import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, BarChart3, GraduationCap, Mic, Presentation, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Students usually arrive with a class code from their teacher: take them straight to the invite page. */
function StudentCodeCard() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Accept "abcd-2345", "ABCD 2345" or a pasted invite link.
    const raw = code.match(/\/join\/([A-Za-z0-9-]+)/)?.[1] ?? code;
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length !== 8) return setError("Class codes have 8 letters and numbers, like ABCD-2345.");
    navigate(`/join/${clean.slice(0, 4)}-${clean.slice(4)}`);
  };
  return (
    <div className="flex flex-col rounded-xl border bg-card p-6 text-left shadow-sm">
      <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <h2 className="text-card-title">I'm a student</h2>
      <p className="mt-1 text-helper">Enter the class code from your teacher to create your account and join the class.</p>
      <form onSubmit={submit} className="mt-4 flex gap-2" noValidate>
        <Input
          aria-label="Class code"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "landing-code-error" : undefined}
          placeholder="ABCD-2345"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase tracking-wider"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
        />
        <Button type="submit">Join</Button>
      </form>
      {error && (
        <p id="landing-code-error" className="mt-2 text-[0.8125rem] font-medium text-destructive">
          {error}
        </p>
      )}
      <p className="mt-auto pt-4 text-helper">
        No code yet?{" "}
        <Link href="/signup?role=student" className="font-medium text-primary hover:underline">
          Create a student account
        </Link>{" "}
        and join later.
      </p>
    </div>
  );
}

function TeacherCard() {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-6 text-left shadow-sm">
      <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Presentation className="size-5" aria-hidden />
      </span>
      <h2 className="text-card-title">I'm a teacher</h2>
      <p className="mt-1 text-helper">Create classes, invite students with a link or QR code, and set homework for the AI tutor.</p>
      <Button asChild size="lg" className="mt-auto">
        <Link href="/signup?role=teacher">
          Create a teacher account <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

const FEATURES = [
  { icon: Mic, title: "Voice-first tutoring", body: "Students talk through homework naturally, with a typed transcript kept for review." },
  {
    icon: Sparkles,
    title: "Guides, doesn't tell",
    body: "The tutor asks questions, gives hints and checks understanding instead of handing out answers.",
  },
  { icon: BarChart3, title: "Explainable insights", body: "Teachers see progress, time and evidence-based signals — never opaque labels." },
  {
    icon: ShieldCheck,
    title: "Safe by design",
    body: "Content filtering, teacher visibility of every conversation, and minimal data collection.",
  },
];

export default function LandingPage() {
  return (
    <div className="app-backdrop min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Account">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-5">
        <section className="mx-auto max-w-3xl py-16 text-center sm:py-24">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> AI homework tutor for schools
          </p>
          <h1 className="text-display">
            Homework that feels like a conversation with a{" "}
            <span className="bg-gradient-to-r from-primary to-accent-strong bg-clip-text text-transparent">patient tutor</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-7 text-muted-foreground">
            Teachers set a topic. Learnify guides each student through it — by voice or text — then shows teachers exactly where students
            thrived and where they may need help.
          </p>
          <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
            <StudentCodeCard />
            <TeacherCard />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </section>
        <section aria-label="Features" className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border bg-card/80 p-5 shadow-sm">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="text-card-title">{title}</h2>
              <p className="mt-1 text-helper">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
