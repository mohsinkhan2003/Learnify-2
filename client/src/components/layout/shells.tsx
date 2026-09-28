import type { ReactNode } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, LayoutDashboard, Plus, School, Users } from "lucide-react";
import type { TeacherOverview } from "@shared/api";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/use-auth";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import { OfflineBanner } from "./offline-banner";

function SkipLink() {
  return (
    <a href="#main" className="sr-only z-50 rounded-md bg-card px-4 py-2 shadow-md focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
      Skip to content
    </a>
  );
}

const TEACHER_NAV = [
  { href: "/teacher", label: "Overview", icon: LayoutDashboard, match: "/teacher" },
  { href: "/teacher/assignments", label: "Assignments", icon: BookOpenCheck, match: "/teacher/assignments/*?" },
  { href: "/teacher/classes", label: "Classes", icon: School, match: "/teacher/classes/*?" },
  { href: "/teacher/students", label: "Students", icon: Users, match: "/teacher/students" },
];

function NavItem({ href, label, icon: Icon, match, compact }: (typeof TEACHER_NAV)[number] & { compact?: boolean }) {
  const [active] = useRoute(match);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-primary-soft text-primary-strong hover:bg-primary-soft dark:text-primary",
        compact && "flex-1 flex-col gap-1 rounded-none px-1 py-2 text-[0.6875rem] hover:bg-transparent",
        compact && active && "bg-transparent",
      )}
    >
      <Icon className="size-[1.125rem] shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

/** Teacher layout: sidebar on desktop, glass top bar + bottom tab bar on mobile. */
export function TeacherShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Shares the overview cache; powers the "needs attention" indicator in the header.
  const overview = useQuery<TeacherOverview>({ queryKey: queryKeys.teacherOverview, enabled: !!user });
  const attention = overview.data?.metrics.needsAttention ?? 0;

  return (
    <div className="app-backdrop min-h-dvh">
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card/70 px-4 py-5 backdrop-blur-xl lg:flex">
        <Link href="/teacher" className="mb-8 px-2" aria-label="Learnify home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {TEACHER_NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>
        <Button asChild className="mt-6">
          <Link href="/teacher/assignments/new">
            <Plus aria-hidden /> New assignment
          </Link>
        </Button>
        <div className="mt-auto rounded-lg border bg-surface-muted p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{user?.school}</p>
          {user?.subject && <p>{user.subject}</p>}
        </div>
      </aside>

      <header className="glass sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-x-0 border-t-0 px-4 lg:ml-64 lg:px-8">
        <Link href="/teacher" className="lg:hidden" aria-label="Learnify home">
          <Logo />
        </Link>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-2">
          {attention > 0 && (
            <Button asChild variant="ghost" size="sm" className="text-warning">
              <Link href="/teacher#attention" aria-label={`${attention} students may need attention`}>
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning/60 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
                </span>
                <span className="hidden sm:inline">{attention} may need attention</span>
                <span className="sm:hidden">{attention}</span>
              </Link>
            </Button>
          )}
          {user && <UserMenu user={user} />}
        </div>
      </header>
      <OfflineBanner className="lg:ml-64" />

      <main id="main" className="px-4 pb-28 pt-6 sm:px-6 lg:ml-64 lg:px-8 lg:pb-12 lg:pt-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      <nav
        aria-label="Main"
        className="glass safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-stretch border-x-0 border-b-0 px-2 pt-1 lg:hidden"
      >
        {TEACHER_NAV.map((item) => (
          <NavItem key={item.href} {...item} compact />
        ))}
      </nav>
    </div>
  );
}

/** Student layout: deliberately simple — one glass top bar, no navigation maze. */
export function StudentShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { user } = useAuth();
  return (
    <div className="app-backdrop min-h-dvh">
      <SkipLink />
      <header className="glass sticky top-0 z-20 border-x-0 border-t-0">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/student" aria-label="Learnify home">
            <Logo />
          </Link>
          {user && <UserMenu user={user} />}
        </div>
      </header>
      <OfflineBanner />
      <main id="main" className={cn("mx-auto px-4 pb-16 pt-6 sm:px-6 sm:pt-10", wide ? "max-w-6xl" : "max-w-5xl")}>
        {children}
      </main>
    </div>
  );
}
