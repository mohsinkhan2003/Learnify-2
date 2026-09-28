import type { ReactNode } from "react";
import { Link } from "wouter";
import { Logo } from "@/components/common/logo";

/** Split layout: form on the left, calm brand panel on the right (hidden on small screens). */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="app-backdrop grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" aria-label="Learnify home" className="self-start">
          <Logo />
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-page-title">{title}</h1>
          <p className="mt-1.5 text-body text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </main>
      </div>
      <aside className="relative hidden overflow-hidden border-l bg-gradient-to-br from-primary-soft via-background to-accent lg:flex lg:items-center lg:justify-center" aria-hidden>
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-accent-strong/15 blur-3xl" />
        <div className="glass relative mx-10 max-w-md rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-strong text-sm font-semibold text-white">AI</span>
            <div>
              <p className="text-sm font-semibold">Learnify tutor</p>
              <p className="text-xs text-muted-foreground">Photosynthesis · Year 10</p>
            </div>
          </div>
          <p className="mt-5 rounded-lg rounded-tl-sm bg-card p-4 text-body shadow-xs">
            Nice thinking! You said plants need light. What do you think happens to the glucose a plant makes if it's cloudy for a week?
          </p>
          <p className="ml-auto mt-3 w-fit max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-4 py-3 text-body text-primary-foreground">
            It would make less, so it might use its stored starch?
          </p>
          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Guides thinking — doesn't hand out answers
          </div>
        </div>
      </aside>
    </div>
  );
}

export function FormField({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-label">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[0.8125rem] font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-helper">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria wiring for an input rendered inside FormField. */
export function fieldProps(id: string, error?: string, hint?: string) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

export function GoogleButton() {
  return (
    <a
      href="/api/auth/google/start"
      className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-input bg-card text-sm font-medium shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
      </svg>
      Continue with Google
    </a>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
    </div>
  );
}
