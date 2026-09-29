import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, School, Users } from "lucide-react";
import type { StudentClassDto } from "@shared/api";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { queryKeys } from "@/lib/query";
import { JoinClassDialog } from "./join-class";

export default function StudentClassesPage() {
  const query = useQuery<StudentClassDto[]>({ queryKey: queryKeys.studentClasses });
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Your classes"
        description="Homework from these classes appears on your Homework tab."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden /> Join a class
          </Button>
        }
      />
      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <ListSkeleton rows={2} />
      ) : query.data!.length === 0 ? (
        <EmptyState
          icon={<School />}
          title="You're not in a class yet"
          description="Ask your teacher for the class code or invite link, then tap Join a class."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus aria-hidden /> Join a class
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {query.data!.map((c) => (
            <li key={c.id} className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Users className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-card-title">{c.name}</span>
                <span className="block truncate text-helper">
                  {c.teacherName}
                  {c.subject ? ` · ${c.subject}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <JoinClassDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
