import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, School, Users } from "lucide-react";
import type { ClassDto } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CardSkeleton, EmptyState, ErrorState, PageHeader } from "@/components/common/states";
import { FormField, fieldProps } from "@/features/auth/auth-layout";
import { useAuth } from "@/features/auth/use-auth";
import { apiPost, errorMessage, fieldErrors } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/query";

/** Dialog to create a class; resolves with the new class. Reused by the assignment wizard. */
export function CreateClassDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (c: ClassDto) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState(user?.subject ?? "");
  const create = useMutation({
    mutationFn: () => apiPost<ClassDto>("/api/teacher/classes", { name: name.trim(), subject: subject.trim() || null }),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.classes });
      setName("");
      onOpenChange(false);
      onCreated?.(c);
    },
  });
  const errors = fieldErrors(create.error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-5"
        >
          <DialogHeader>
            <DialogTitle>New class</DialogTitle>
            <DialogDescription>You'll get a join code to share with your students.</DialogDescription>
          </DialogHeader>
          <FormField id="class-name" label="Class name" error={errors.name} hint="e.g. “Year 10 Biology – Set 2”">
            <Input
              {...fieldProps("class-name", errors.name, "x")}
              autoFocus
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField id="class-subject" label="Subject (optional)" error={errors.subject}>
            <Input
              {...fieldProps("class-subject", errors.subject)}
              maxLength={100}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </FormField>
          {create.error && !Object.keys(errors).length && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(create.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
              Create class
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ClassesPage() {
  const query = useQuery<ClassDto[]>({ queryKey: queryKeys.classes });
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Classes"
        description="Students join your classes with a code. Only class members can see the homework you set for that class."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden /> New class
          </Button>
        }
      />
      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : query.data!.length === 0 ? (
        <EmptyState
          icon={<School />}
          title="Create your first class"
          description="Give it a name, share the join code with your students, and set homework for the whole class or chosen students."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus aria-hidden /> New class
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {query.data!.map((c) => (
            <li key={c.id}>
              <Link
                href={`/teacher/classes/${c.id}`}
                className="interactive-card group flex items-center gap-4 rounded-lg border bg-card p-5 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Users className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-card-title group-hover:text-primary">{c.name}</span>
                  <span className="block text-helper">
                    {c.memberCount} student{c.memberCount === 1 ? "" : "s"}
                    {c.subject ? ` · ${c.subject}` : ""} · code{" "}
                    <span className="font-mono font-semibold tracking-wider text-foreground">{c.joinCode}</span>
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateClassDialog open={open} onOpenChange={setOpen} onCreated={(c) => navigate(`/teacher/classes/${c.id}`)} />
    </div>
  );
}
