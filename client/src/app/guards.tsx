import { lazy, Suspense, type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import type { Role } from "@shared/api";
import { homePathFor, useAuth } from "@/features/auth/use-auth";
import { ErrorState, FullPageSpinner } from "@/components/common/states";

const VerifyEmailPending = lazy(() => import("@/features/auth/verify-email").then((m) => ({ default: m.VerifyEmailPending })));

/**
 * UX-only route guard: sends signed-out users to sign in and users of the other role to their
 * own home. Real authorization is enforced by the server on every request.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, isLoading, error, refetch } = useAuth();
  const [location] = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (error && !user) return <ErrorState className="m-6" error={error} onRetry={() => refetch()} />;
  if (!user) return <Redirect to={`/login?next=${encodeURIComponent(location)}`} replace />;
  if (user.role !== role) return <Redirect to={homePathFor(user)} replace />;
  if (!user.emailVerified) {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <VerifyEmailPending user={user} />
      </Suspense>
    );
  }
  return <>{children}</>;
}

/** For sign-in/sign-up pages: signed-in users go straight to their home. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (user) return <Redirect to={homePathFor(user)} replace />;
  return <>{children}</>;
}
