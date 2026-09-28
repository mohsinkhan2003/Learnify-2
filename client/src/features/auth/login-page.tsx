import { useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { AuthLayout, FormField, GoogleButton, OrDivider, fieldProps } from "./auth-layout";
import { homePathFor, safeNextPath, useAuthProviders, useLogin } from "./use-auth";

export default function LoginPage() {
  const search = new URLSearchParams(useSearch());
  const [, navigate] = useLocation();
  const login = useLogin();
  const providers = useAuthProviders();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const googleFailed = search.get("error") === "google";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: (user) => navigate(safeNextPath(search.get("next")) ?? homePathFor(user), { replace: true }) },
    );
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue learning with Learnify."
      footer={
        <>
          New to Learnify?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {providers.data?.google && (
        <>
          <GoogleButton />
          <OrDivider />
        </>
      )}
      {(login.error || googleFailed) && (
        <div
          role="alert"
          className="mb-5 flex gap-2 rounded-md border border-destructive/20 bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {login.error ? errorMessage(login.error) : "Google sign-in didn't complete. Please try again."}
        </div>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
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
        <FormField id="password" label="Password">
          <Input
            {...fieldProps("password")}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={login.isPending} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
