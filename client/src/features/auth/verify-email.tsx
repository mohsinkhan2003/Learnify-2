import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, MailCheck } from "lucide-react";
import type { PublicUser } from "@shared/api";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/common/states";
import { apiPost, errorMessage } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/query";
import { AuthLayout } from "./auth-layout";
import { homePathFor, useAuth, useLogout } from "./use-auth";

const RESEND_COOLDOWN_S = 60;

/** Shown in place of the app while a signed-in user hasn't confirmed their email yet. */
export function VerifyEmailPending({ user }: { user: PublicUser }) {
  const logout = useLogout();
  const [, navigate] = useLocation();
  const [cooldown, setCooldown] = useState(0);
  const resend = useMutation({
    mutationFn: () => apiPost<{ ok: true }>("/api/auth/verify-email/resend"),
    onSuccess: () => setCooldown(RESEND_COOLDOWN_S),
  });
  const check = useMutation({ mutationFn: () => queryClient.refetchQueries({ queryKey: queryKeys.me }) });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Pick up verification done in another tab or on another device.
  useEffect(() => {
    const onFocus = () => queryClient.refetchQueries({ queryKey: queryKeys.me });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <AuthLayout
      title="Confirm your email"
      subtitle={
        <>
          We sent a link to <strong className="text-foreground">{user.email}</strong>. Open it to finish setting up your account.
        </>
      }
      footer={
        <>
          Wrong address?{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/signup", { replace: true }) })}
          >
            Sign out and start again
          </button>
        </>
      }
    >
      <div className="flex gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p>The link works for 24 hours. Can't find it? Check your spam or promotions folder.</p>
      </div>
      <div className="mt-5 grid gap-3">
        <Button size="lg" onClick={() => check.mutate()} loading={check.isPending}>
          I've confirmed my email
        </Button>
        <Button size="lg" variant="outline" onClick={() => resend.mutate()} loading={resend.isPending} disabled={cooldown > 0}>
          {cooldown > 0 ? `Email sent — resend in ${cooldown}s` : "Send the link again"}
        </Button>
      </div>
      {resend.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {errorMessage(resend.error)}
        </p>
      )}
      {check.isSuccess && !check.isPending && (
        <p role="status" className="mt-3 text-helper">
          Not confirmed yet. Open the link in the email, then try again.
        </p>
      )}
    </AuthLayout>
  );
}

/** Target of the link in the confirmation email. */
export default function VerifyEmailPage() {
  const token = new URLSearchParams(useSearch()).get("token") ?? "";
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const verify = useMutation({
    mutationFn: () => apiPost<PublicUser>("/api/auth/verify-email", { token }),
    onSuccess: (u) => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, u);
    },
  });
  const started = useRef(false);
  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      verify.mutate();
    }
  }, [token, verify]);

  if (verify.isSuccess) {
    return (
      <AuthLayout title="Email confirmed" subtitle="Thanks! Your account is ready.">
        <div className="flex gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>You're all set.</p>
        </div>
        <Button size="lg" className="mt-5 w-full" onClick={() => navigate(homePathFor(verify.data), { replace: true })}>
          Continue to Learnify
        </Button>
      </AuthLayout>
    );
  }
  if (token && !verify.isError) return <FullPageSpinner />;

  return (
    <AuthLayout title="Link not valid" subtitle="This confirmation link is incomplete, expired or was already used.">
      <div
        role="alert"
        className="flex gap-2 rounded-md border border-destructive/20 bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {verify.error ? errorMessage(verify.error) : "The link is missing its code."}
      </div>
      <Button asChild size="lg" className="mt-5 w-full">
        <Link href={user ? homePathFor(user) : "/login"}>{user ? "Get a new link" : "Sign in to get a new link"}</Link>
      </Button>
    </AuthLayout>
  );
}
