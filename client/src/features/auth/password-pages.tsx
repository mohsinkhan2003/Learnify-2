import { useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost, errorMessage, fieldErrors } from "@/lib/api";
import { AuthLayout, FormField, fieldProps } from "./auth-layout";
import { homePathFor, useAuthProviders, useResetPassword } from "./use-auth";

const backToSignIn = (
  <Link href="/login" className="font-medium text-primary hover:underline">
    Back to sign in
  </Link>
);

function ErrorBanner({ children }: { children: string }) {
  return (
    <div
      role="alert"
      className="mb-5 flex gap-2 rounded-md border border-destructive/20 bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </div>
  );
}

export function ForgotPasswordPage() {
  const providers = useAuthProviders();
  const [email, setEmail] = useState("");
  const request = useMutation({ mutationFn: () => apiPost<{ ok: true }>("/api/auth/password/forgot", { email: email.trim() }) });
  const emailEnabled = providers.data?.email ?? false;

  if (request.isSuccess) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If an account exists for that address, a reset link is on its way."
        footer={backToSignIn}
      >
        <div className="flex gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p>
            The link works once and expires in an hour. Can't find it? Check your spam folder. Students can also ask their teacher for a
            reset link.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={
        emailEnabled ? "Enter your email and we'll send you a link to choose a new password." : "Ask your teacher for a reset link."
      }
      footer={backToSignIn}
    >
      {emailEnabled ? (
        <>
          {request.error && <ErrorBanner>{errorMessage(request.error)}</ErrorBanner>}
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              request.mutate();
            }}
          >
            <FormField id="email" label="Email">
              <Input
                {...fieldProps("email")}
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <Button type="submit" size="lg" className="w-full" loading={request.isPending} disabled={!email.trim()}>
              Send reset link
            </Button>
          </form>
          <p className="mt-4 text-helper">Students can also ask their teacher for a reset link.</p>
        </>
      ) : (
        <div className="rounded-lg border bg-card p-4 text-sm shadow-xs">
          <p>
            <strong>Students:</strong> your teacher can create a one-time reset link from their class page.
          </p>
          <p className="mt-2">
            <strong>Teachers:</strong> email reset isn't set up on this server yet. Contact your Learnify administrator.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const token = new URLSearchParams(useSearch()).get("token") ?? "";
  const [, navigate] = useLocation();
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const errors = fieldErrors(reset.error);
  const mismatch = touched && confirm !== password ? "Passwords don't match." : undefined;
  const tooShort = touched && password.length < 8 ? "Use at least 8 characters." : undefined;

  if (!token) {
    return (
      <AuthLayout title="Link incomplete" subtitle="This reset link is missing its code." footer={backToSignIn}>
        <p className="text-sm">
          Open the full link from your email or teacher, or{" "}
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            request a new one
          </Link>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll be signed in and signed out everywhere else." footer={backToSignIn}>
      {reset.error && !Object.keys(errors).length && <ErrorBanner>{errorMessage(reset.error)}</ErrorBanner>}
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setTouched(true);
          if (password.length < 8 || password !== confirm) return;
          reset.mutate({ token, password }, { onSuccess: (user) => navigate(homePathFor(user), { replace: true }) });
        }}
      >
        <FormField id="password" label="New password" error={errors.password ?? tooShort} hint="At least 8 characters.">
          <Input
            {...fieldProps("password", errors.password ?? tooShort, "x")}
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <FormField id="confirm" label="Confirm password" error={mismatch}>
          <Input
            {...fieldProps("confirm", mismatch)}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending} disabled={!password || !confirm}>
          Set password and sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
