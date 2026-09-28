import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Users } from "lucide-react";
import type { ClassInviteDto, StudentClassDto } from "@shared/api";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/common/states";
import { AuthLayout, GoogleButton, OrDivider } from "@/features/auth/auth-layout";
import { useAuth, useAuthProviders } from "@/features/auth/use-auth";
import { savePendingClassCode } from "@/features/auth/pending-class-code";
import { ApiError, apiGet, apiPost, errorMessage } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/query";

/** Landing page for a teacher's invite link: /join/ABCD-2345. */
export default function JoinClassPage() {
  const { code = "" } = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const { user, isLoading: userLoading } = useAuth();
  const providers = useAuthProviders();
  const invite = useQuery({
    queryKey: ["/api/classes/invite", code],
    queryFn: () => apiGet<ClassInviteDto>(`/api/classes/invite/${encodeURIComponent(code)}`),
    retry: false,
  });
  const join = useMutation({
    mutationFn: () => apiPost<StudentClassDto>("/api/student/classes/join", { code }),
    onSettled: (_data, error) => {
      if (error && !(error instanceof ApiError && error.code === "ALREADY_MEMBER")) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.studentClasses });
      queryClient.invalidateQueries({ queryKey: queryKeys.studentAssignments });
      navigate("/student", { replace: true });
    },
  });

  if (invite.isLoading || userLoading) return <FullPageSpinner />;

  if (invite.error || !invite.data) {
    return (
      <AuthLayout title="Invite link not valid" subtitle="The class may have a new code, or the link was copied incompletely.">
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-destructive/20 bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {errorMessage(invite.error, "Ask your teacher for a new link or class code.")}
        </div>
        <Button asChild size="lg" className="mt-5 w-full">
          <Link href="/">Go to Learnify</Link>
        </Button>
      </AuthLayout>
    );
  }

  const cls = invite.data;
  const summary = (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-xs">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Users className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-card-title">{cls.name}</p>
        <p className="text-helper">
          {cls.teacherName}
          {cls.subject ? ` · ${cls.subject}` : ""} · code <span className="font-mono">{cls.code}</span>
        </p>
      </div>
    </div>
  );

  if (user?.role === "teacher") {
    return (
      <AuthLayout title="This is a student invite" subtitle="You're signed in as a teacher. Share this link with your students.">
        {summary}
        <Button asChild size="lg" className="mt-5 w-full">
          <Link href="/teacher/classes">Go to your classes</Link>
        </Button>
      </AuthLayout>
    );
  }

  if (user) {
    return (
      <AuthLayout title={`Join ${cls.name}`} subtitle={`You're signed in as ${user.name}.`}>
        {summary}
        {join.error && !(join.error instanceof ApiError && join.error.code === "ALREADY_MEMBER") && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {errorMessage(join.error)}
          </p>
        )}
        <Button size="lg" className="mt-5 w-full" onClick={() => join.mutate()} loading={join.isPending}>
          Join class
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Join ${cls.name}`}
      subtitle={`${cls.teacherName} invited you to do homework with Learnify's AI tutor.`}
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(`/join/${cls.code}`)}`} className="font-medium text-primary hover:underline">
            Sign in to join
          </Link>
        </>
      }
    >
      {summary}
      <Button asChild size="lg" className="mt-5 w-full">
        <Link href={`/signup?code=${encodeURIComponent(cls.code)}`}>Create my student account</Link>
      </Button>
      {providers.data?.google && (
        <>
          <OrDivider />
          <GoogleButton onClick={() => savePendingClassCode(cls.code)} />
        </>
      )}
    </AuthLayout>
  );
}
