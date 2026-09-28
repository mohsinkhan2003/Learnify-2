import { Link } from "wouter";
import { ArrowRight, BarChart3, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";

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
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">
                Create a free account <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
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
