import { lazy, Suspense } from "react";
import { Redirect, Route, Switch, useParams } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/common/states";
import { homePathFor, useAuth } from "@/features/auth/use-auth";
import { useServiceWorkerUpdate } from "@/features/pwa/service-worker";
import { queryClient, queryKeys } from "@/lib/query";
import { ErrorBoundary } from "./error-boundary";
import { RedirectIfSignedIn, RequireRole } from "./guards";
import { ThemeProvider } from "./theme";

// Route-level code splitting: teachers never download the tutor, students never download analytics.
// The signed-in shells (menus, date formatting) and the toaster also load on demand, so the
// public pages start with only React, the router and the data layer.
const TeacherShell = lazy(() => import("@/components/layout/shells").then((m) => ({ default: m.TeacherShell })));
const StudentShell = lazy(() => import("@/components/layout/shells").then((m) => ({ default: m.StudentShell })));
const Toaster = lazy(() => import("@/components/ui/toaster").then((m) => ({ default: m.Toaster })));
const LandingPage = lazy(() => import("@/features/auth/landing-page"));
const LoginPage = lazy(() => import("@/features/auth/login-page"));
const SignupPage = lazy(() => import("@/features/auth/signup-page"));
const GoogleCompletePage = lazy(() => import("@/features/auth/signup-page").then((m) => ({ default: m.GoogleCompletePage })));
const TeacherOverviewPage = lazy(() => import("@/features/teacher/overview-page"));
const AssignmentsPage = lazy(() => import("@/features/teacher/assignments-page"));
const NewAssignmentPage = lazy(() => import("@/features/teacher/new-assignment-page"));
const AssignmentDetailPage = lazy(() => import("@/features/teacher/assignment-detail-page"));
const StudentsPage = lazy(() => import("@/features/teacher/students-page"));
const ClassesPage = lazy(() => import("@/features/teacher/classes-page"));
const ClassDetailPage = lazy(() => import("@/features/teacher/class-detail-page"));
const ForgotPasswordPage = lazy(() => import("@/features/auth/password-pages").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/features/auth/password-pages").then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import("@/features/auth/verify-email"));
const JoinClassPage = lazy(() => import("@/features/student/join-page"));
const StudentHomePage = lazy(() => import("@/features/student/student-home-page"));
const TutorSessionPage = lazy(() => {
  // Fetch the session while the page's code downloads, instead of one after the other.
  const id = window.location.pathname.match(/^\/student\/assignments\/([0-9a-f-]{36})$/i)?.[1];
  if (id) void queryClient.prefetchQuery({ queryKey: queryKeys.tutorSession(id), staleTime: 10_000 });
  return import("@/features/tutoring/tutor-session-page");
});

function Home() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  return user ? <Redirect to={homePathFor(user)} replace /> : <LandingPage />;
}

function LegacyChatRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Redirect to={`/student/assignments/${id}`} replace />;
}

function NotFound() {
  return (
    <main id="main" className="app-backdrop flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <p className="text-eyebrow">404</p>
      <h1 className="mt-2 text-page-title">We couldn't find that page</h1>
      <p className="mt-2 text-body text-muted-foreground">The link may be old or mistyped.</p>
      <Button asChild className="mt-6">
        <a href="/">Go home</a>
      </Button>
    </main>
  );
}

function UpdateBanner() {
  const { updateReady, applyUpdate } = useServiceWorkerUpdate();
  if (!updateReady) return null;
  return (
    <div
      role="status"
      className="glass fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-sm shadow-lg lg:bottom-6"
    >
      A new version of Learnify is ready.
      <Button size="sm" variant="soft" onClick={applyUpdate}>
        <RefreshCw aria-hidden /> Update
      </Button>
    </div>
  );
}

function TeacherArea() {
  return (
    <RequireRole role="teacher">
      <TeacherShell>
        <Suspense fallback={<FullPageSpinner />}>
          <Switch>
            <Route path="/teacher" component={TeacherOverviewPage} />
            <Route path="/teacher/assignments" component={AssignmentsPage} />
            <Route path="/teacher/assignments/new" component={NewAssignmentPage} />
            <Route path="/teacher/assignments/:id" component={AssignmentDetailPage} />
            <Route path="/teacher/students" component={StudentsPage} />
            <Route path="/teacher/classes" component={ClassesPage} />
            <Route path="/teacher/classes/:id" component={ClassDetailPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </TeacherShell>
    </RequireRole>
  );
}

function Routes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login">
          <RedirectIfSignedIn>
            <LoginPage />
          </RedirectIfSignedIn>
        </Route>
        <Route path="/signup">
          <RedirectIfSignedIn>
            <SignupPage />
          </RedirectIfSignedIn>
        </Route>
        <Route path="/signup/complete" component={GoogleCompletePage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/join/:code" component={JoinClassPage} />

        <Route path="/teacher" component={TeacherArea} />
        <Route path="/teacher/*" component={TeacherArea} />

        <Route path="/student/assignments/:id">
          <RequireRole role="student">
            <TutorSessionPage />
          </RequireRole>
        </Route>
        <Route path="/student">
          <RequireRole role="student">
            <StudentShell>
              <StudentHomePage />
            </StudentShell>
          </RequireRole>
        </Route>

        {/* Links from the demo (old bookmarks, old push notifications). */}
        <Route path="/dashboard" component={Home} />
        <Route path="/chat/:id" component={LegacyChatRedirect} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Routes />
          <UpdateBanner />
          <Suspense fallback={null}>
            <Toaster />
          </Suspense>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
