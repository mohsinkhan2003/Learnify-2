import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft, KeyRound, Plus, RefreshCw, UserMinus, UserPlus } from "lucide-react";
import type { ClassDetailDto, ClassDto, ResetLinkDto } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyButton } from "@/components/common/copy-button";
import { EmptyState, ErrorState, FullPageSpinner } from "@/components/common/states";
import { useToast } from "@/hooks/use-toast";
import { apiDelete, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { formatDate, formatShortDate } from "@/lib/format";
import { queryClient, queryKeys } from "@/lib/query";

type Confirm = { kind: "code" } | { kind: "archive" } | { kind: "remove"; id: string; name: string } | null;

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const query = useQuery<ClassDetailDto>({ queryKey: queryKeys.classDetail(id!) });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [resetFor, setResetFor] = useState<{ name: string; link: ResetLinkDto } | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.classDetail(id!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.classes });
  };
  const onError = (e: unknown) => toast({ title: "Something went wrong", description: errorMessage(e), variant: "destructive" });

  const regenerate = useMutation({ mutationFn: () => apiPost<ClassDto>(`/api/teacher/classes/${id}/code`), onSuccess: refresh, onError });
  const archive = useMutation({
    mutationFn: () => apiPatch<ClassDto>(`/api/teacher/classes/${id}`, { archived: true }),
    onSuccess: () => {
      refresh();
      toast({ title: "Class archived", description: "Its code no longer works. Existing assignments are unchanged." });
      navigate("/teacher/classes");
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (studentId: string) => apiDelete<void>(`/api/teacher/classes/${id}/members/${studentId}`),
    onSuccess: refresh,
    onError,
  });
  const resetLink = useMutation({
    mutationFn: (m: { id: string; name: string }) =>
      apiPost<ResetLinkDto>(`/api/teacher/classes/${id}/members/${m.id}/reset-link`).then((link) => ({ name: m.name, link })),
    onSuccess: setResetFor,
    onError,
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const { class: cls, members } = query.data;

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <Link href="/teacher/classes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Classes
        </Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {cls.subject && <p className="text-eyebrow">{cls.subject}</p>}
            <h1 className="mt-1 text-page-title">{cls.name}</h1>
            <p className="mt-1 text-helper">
              {cls.memberCount} student{cls.memberCount === 1 ? "" : "s"} · created {formatShortDate(cls.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/teacher/assignments/new?class=${cls.id}`}>
                <Plus aria-hidden /> New assignment
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setConfirm({ kind: "archive" })}>
              <Archive aria-hidden /> Archive
            </Button>
          </div>
        </div>
      </div>

      <section aria-labelledby="code-title" className="glass rounded-xl p-6 shadow-md">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="code-title" className="text-label text-muted-foreground">
              Class join code
            </h2>
            <p
              className="mt-1 font-mono text-4xl font-semibold tracking-[0.18em]"
              aria-label={`Join code ${cls.joinCode.split("").join(" ")}`}
            >
              {cls.joinCode}
            </p>
            <p className="mt-2 max-w-md text-helper">
              Students enter this when they sign up or from <strong>Join a class</strong> on their home page. Codes aren't case-sensitive.
            </p>
          </div>
          <div className="flex gap-2">
            <CopyButton value={cls.joinCode} label="Copy code" />
            <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "code" })} loading={regenerate.isPending}>
              <RefreshCw aria-hidden /> New code
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="members-title" className="space-y-4">
        <h2 id="members-title" className="text-section-title">
          Students
        </h2>
        {members.length === 0 ? (
          <EmptyState
            icon={<UserPlus />}
            title="No students yet"
            description={`Share the code ${cls.joinCode} with your class. Students appear here as soon as they join.`}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatShortDate(m.joinedAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resetLink.mutate(m)}
                            loading={resetLink.isPending && resetLink.variables?.id === m.id}
                          >
                            <KeyRound aria-hidden /> Reset password
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setConfirm({ kind: "remove", id: m.id, name: m.name })}
                          >
                            <UserMinus aria-hidden /> Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "code"
                ? "Create a new join code?"
                : confirm?.kind === "archive"
                  ? "Archive this class?"
                  : `Remove ${confirm?.kind === "remove" ? confirm.name : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "code"
                ? "The current code will stop working immediately. Students who already joined stay in the class."
                : confirm?.kind === "archive"
                  ? "The join code stops working and the class is hidden from your list. Assignments and student progress are kept."
                  : "They'll immediately lose access to this class's homework. Their past work is kept, and they can rejoin with the code."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm?.kind === "code") regenerate.mutate();
                if (confirm?.kind === "archive") archive.mutate();
                if (confirm?.kind === "remove") remove.mutate(confirm.id);
              }}
            >
              {confirm?.kind === "code" ? "New code" : confirm?.kind === "archive" ? "Archive" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset link for {resetFor?.name}</DialogTitle>
            <DialogDescription>
              Give this link to the student privately. It works once and expires {resetFor ? formatDate(resetFor.link.expiresAt) : ""}.
              Creating a new link cancels this one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={resetFor?.link.url ?? ""}
              aria-label="Reset link"
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            {resetFor && <CopyButton value={resetFor.link.url} label="Copy" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
