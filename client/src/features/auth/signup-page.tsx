import { useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Check, GraduationCap, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiGet, errorMessage, fieldErrors } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AuthLayout, FormField, GoogleButton, OrDivider, fieldProps } from "./auth-layout";
import { readPendingClassCode, savePendingClassCode } from "./pending-class-code";
import { homePathFor, useAuthProviders, useCompleteGoogleSignup, useSignup } from "./use-auth";

type Role = "teacher" | "student";

function RolePicker({ value, onChange }: { value: Role | null; onChange: (r: Role) => void }) {
  const options = [
    { role: "student" as const, title: "I'm a student", body: "Do homework with a friendly AI tutor.", icon: GraduationCap },
    { role: "teacher" as const, title: "I'm a teacher", body: "Set homework and see how students are doing.", icon: Presentation },
  ];
  return (
    <div role="radiogroup" aria-label="Account type" className="grid gap-3">
      {options.map(({ role, title, body, icon: Icon }) => {
        const selected = value === role;
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(role)}
            className={cn(
              "flex items-center gap-4 rounded-lg border bg-card p-4 text-left shadow-xs transition-all hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "border-primary ring-4 ring-primary/10",
            )}
          >
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
                selected && "bg-primary-soft text-primary",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-card-title">{title}</span>
              <span className="block text-helper">{body}</span>
            </span>
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border",
                selected && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {selected && <Check className="size-3" aria-hidden />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ProfileFields({
  role,
  errors,
  values,
  set,
}: {
  role: Role;
  errors: Record<string, string>;
  values: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <FormField id="school" label="School" error={errors.school}>
        <Input
          {...fieldProps("school", errors.school, "x")}
          autoComplete="organization"
          required
          value={values.school}
          onChange={(e) => set("school", e.target.value)}
        />
      </FormField>
      {role === "student" && values.classCode !== undefined && (
        <FormField
          id="classCode"
          label="Class code (optional)"
          error={errors.classCode}
          hint="From your teacher, e.g. ABCD-2345. You can also add it later."
        >
          <Input
            {...fieldProps("classCode", errors.classCode, "x")}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase tracking-wider"
            maxLength={20}
            value={values.classCode}
            onChange={(e) => set("classCode", e.target.value)}
          />
        </FormField>
      )}
      {role === "teacher" && (
        <FormField id="subject" label="Subject you teach" error={errors.subject}>
          <Input
            {...fieldProps("subject", errors.subject)}
            required
            placeholder="e.g. Biology"
            value={values.subject}
            onChange={(e) => set("subject", e.target.value)}
          />
        </FormField>
      )}
    </>
  );
}

export default function SignupPage() {
  const [, navigate] = useLocation();
  const signup = useSignup();
  const providers = useAuthProviders();
  const params = new URLSearchParams(useSearch());
  const initialCode = params.get("code") ?? "";
  const roleParam = params.get("role");
  // A class code in the link means a student was invited; ?role= comes from the landing page.
  const [role, setRole] = useState<Role | null>(
    initialCode || roleParam === "student" ? "student" : roleParam === "teacher" ? "teacher" : null,
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState({ name: "", email: "", password: "", school: "", subject: "", classCode: initialCode });
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));
  const errors = { ...fieldErrors(signup.error), ...clientErrors };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!values.name.trim()) next.name = "Please enter your name";
    if (!/^\S+@\S+\.\S+$/.test(values.email)) next.email = "Please enter a valid email address";
    if (values.password.length < 8) next.password = "Password must be at least 8 characters";
    if (values.school.trim().length < 2) next.school = "Please enter your school";
    if (role === "teacher" && values.subject.trim().length < 2) next.subject = "Please enter the subject you teach";
    setClientErrors(next);
    if (Object.keys(next).length || !role) return;
    signup.mutate(
      {
        ...values,
        role,
        subject: role === "teacher" ? values.subject : undefined,
        classCode: role === "student" && values.classCode.trim() ? values.classCode.trim() : undefined,
      },
      { onSuccess: (u) => navigate(homePathFor(u), { replace: true }) },
    );
  };

  const topError =
    signup.error && !(signup.error instanceof ApiError && signup.error.code === "VALIDATION_ERROR") ? errorMessage(signup.error) : null;

  return (
    <AuthLayout
      title={step === 1 ? "Create your account" : role === "teacher" ? "Tell us about your class" : "Almost there"}
      subtitle={step === 1 ? "First, how will you use Learnify?" : "It only takes a minute."}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {step === 1 ? (
        <div className="space-y-6">
          <RolePicker value={role} onChange={setRole} />
          <Button size="lg" className="w-full" disabled={!role} onClick={() => setStep(2)}>
            Continue
          </Button>
          {providers.data?.google && (
            <>
              <OrDivider />
              <GoogleButton onClick={() => savePendingClassCode(role === "student" ? initialCode : "")} />
            </>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="-mt-2 mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Change account type
          </button>
          {topError && (
            <div
              role="alert"
              className="flex gap-2 rounded-md border border-destructive/20 bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {topError}
            </div>
          )}
          <FormField id="name" label="Full name" error={errors.name}>
            <Input
              {...fieldProps("name", errors.name)}
              autoComplete="name"
              required
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </FormField>
          <FormField id="email" label="Email" error={errors.email}>
            <Input
              {...fieldProps("email", errors.email)}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </FormField>
          <FormField id="password" label="Password" error={errors.password} hint="At least 8 characters.">
            <Input
              {...fieldProps("password", errors.password, "x")}
              type="password"
              autoComplete="new-password"
              required
              value={values.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </FormField>
          <ProfileFields role={role!} errors={errors} values={values} set={set} />
          <Button type="submit" size="lg" className="w-full" loading={signup.isPending}>
            Create account
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

/** Shown after Google sign-in for new users, who still need to choose a role and school. */
export function GoogleCompletePage() {
  const [, navigate] = useLocation();
  const complete = useCompleteGoogleSignup();
  const pending = useQuery({
    queryKey: ["/api/auth/google/pending"],
    queryFn: () => apiGet<{ email: string; name: string }>("/api/auth/google/pending"),
    retry: false,
  });
  const pendingCode = readPendingClassCode();
  const [role, setRole] = useState<Role | null>(pendingCode ? "student" : null);
  const [values, setValues] = useState({ school: "", subject: "", classCode: pendingCode });
  const errors = fieldErrors(complete.error);

  if (pending.isError) {
    return (
      <AuthLayout title="Sign-in expired" subtitle="Your Google sign-in took too long. Please start again.">
        <Button asChild className="w-full" size="lg">
          <Link href="/signup">Back to sign up</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Finish setting up" subtitle={pending.data ? `Signed in as ${pending.data.email}` : "Loading…"}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!role) return;
          complete.mutate(
            {
              name: pending.data?.name ?? "",
              role,
              school: values.school,
              subject: role === "teacher" ? values.subject : undefined,
              classCode: role === "student" && values.classCode.trim() ? values.classCode.trim() : undefined,
            },
            {
              onSuccess: (u) => {
                savePendingClassCode("");
                navigate(homePathFor(u), { replace: true });
              },
            },
          );
        }}
      >
        <RolePicker value={role} onChange={setRole} />
        {role && <ProfileFields role={role} errors={errors} values={values} set={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />}
        {complete.error && !Object.keys(errors).length && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(complete.error)}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={!role} loading={complete.isPending}>
          Continue
        </Button>
      </form>
    </AuthLayout>
  );
}
