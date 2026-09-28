import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import type { StudentClassDto } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, fieldProps } from "@/features/auth/auth-layout";
import { useToast } from "@/hooks/use-toast";
import { apiPost, errorMessage } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/query";

export function JoinClassDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const join = useMutation({
    mutationFn: () => apiPost<StudentClassDto>("/api/student/classes/join", { code: code.trim() }),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.studentClasses });
      queryClient.invalidateQueries({ queryKey: queryKeys.studentAssignments });
      toast({ title: `You joined ${c.name}`, description: "Homework for this class will appear on your home page." });
      setCode("");
      onOpenChange(false);
    },
  });
  const error = join.error ? errorMessage(join.error) : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) join.reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form
          className="space-y-5"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            join.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Join a class</DialogTitle>
            <DialogDescription>Enter the code your teacher shared, e.g. ABCD-2345.</DialogDescription>
          </DialogHeader>
          <FormField id="join-code" label="Class code" error={error}>
            <Input
              {...fieldProps("join-code", error)}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={20}
              className="font-mono text-lg uppercase tracking-[0.15em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={join.isPending} disabled={code.trim().length < 6}>
              Join class
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Compact list of the student's classes with a Join button. */
export function MyClasses() {
  const query = useQuery<StudentClassDto[]>({ queryKey: queryKeys.studentClasses });
  const [open, setOpen] = useState(false);
  const classes = query.data ?? [];
  if (query.isLoading || query.error) return <JoinClassDialog open={open} onOpenChange={setOpen} />;

  return (
    <section aria-labelledby="classes-title" className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 id="classes-title" className="text-label">
          {classes.length === 0 ? "You're not in a class yet" : "Your classes"}
        </h2>
        <Button size="sm" variant={classes.length === 0 ? "default" : "outline"} onClick={() => setOpen(true)}>
          <Plus aria-hidden /> Join a class
        </Button>
      </div>
      {classes.length === 0 ? (
        <p className="mt-1 text-helper">Ask your teacher for a class code. Homework appears here once you've joined.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {classes.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
              <Users className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">· {c.teacherName}</span>
            </li>
          ))}
        </ul>
      )}
      <JoinClassDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}
