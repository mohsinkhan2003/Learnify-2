import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AssignmentDto, UpdateAssignmentInput } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, fieldProps } from "@/features/auth/auth-layout";
import { useToast } from "@/hooks/use-toast";
import { apiPatch, errorMessage, fieldErrors } from "@/lib/api";
import { localInputToIso, toLocalInputValue } from "@/lib/format";
import { queryClient, queryKeys } from "@/lib/query";

/**
 * Edit an assignment's content and dates. The release time is only editable while the
 * assignment is still scheduled (students haven't seen it yet).
 */
export function EditAssignmentDialog({
  assignment,
  startedCount,
  open,
  onOpenChange,
}: {
  assignment: AssignmentDto;
  startedCount: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const scheduled = assignment.status === "scheduled";
  const [values, setValues] = useState(() => ({
    topic: assignment.topic,
    subject: assignment.subject,
    grade: assignment.grade,
    instructions: assignment.instructions,
    releaseAt: toLocalInputValue(new Date(assignment.releaseAt)),
    dueAt: assignment.dueAt ? toLocalInputValue(new Date(assignment.dueAt)) : "",
  }));
  const set = (k: keyof typeof values, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body: UpdateAssignmentInput = {
        topic: values.topic.trim(),
        subject: values.subject.trim(),
        grade: values.grade.trim(),
        instructions: values.instructions.trim(),
        dueAt: values.dueAt ? localInputToIso(values.dueAt) : null,
        ...(scheduled ? { releaseAt: localInputToIso(values.releaseAt) } : {}),
      };
      return apiPatch<AssignmentDto>(`/api/teacher/assignments/${assignment.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teacherAssignment(assignment.id) });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/assignments"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.teacherOverview });
      toast({ title: "Assignment updated" });
      onOpenChange(false);
    },
  });
  const errors = fieldErrors(save.error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit assignment</DialogTitle>
            <DialogDescription>
              {startedCount > 0
                ? `${startedCount} student${startedCount === 1 ? " has" : "s have"} already started. Changes apply to their next questions; earlier messages stay as they were.`
                : "Changes apply as soon as you save."}
            </DialogDescription>
          </DialogHeader>
          <FormField id="edit-topic" label="Topic" error={errors.topic}>
            <Input
              {...fieldProps("edit-topic", errors.topic)}
              maxLength={200}
              value={values.topic}
              onChange={(e) => set("topic", e.target.value)}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="edit-subject" label="Subject" error={errors.subject}>
              <Input
                {...fieldProps("edit-subject", errors.subject)}
                maxLength={100}
                value={values.subject}
                onChange={(e) => set("subject", e.target.value)}
              />
            </FormField>
            <FormField id="edit-grade" label="Year / grade" error={errors.grade}>
              <Input
                {...fieldProps("edit-grade", errors.grade)}
                maxLength={50}
                value={values.grade}
                onChange={(e) => set("grade", e.target.value)}
              />
            </FormField>
          </div>
          <FormField
            id="edit-guidance"
            label="Guidance for the tutor"
            error={errors.instructions}
            hint={`${values.instructions.length} / 2000`}
          >
            <Textarea
              {...fieldProps("edit-guidance", errors.instructions, "x")}
              rows={4}
              maxLength={2000}
              value={values.instructions}
              onChange={(e) => set("instructions", e.target.value)}
            />
          </FormField>
          {scheduled && (
            <FormField id="edit-release" label="Release at" error={errors.releaseAt}>
              <Input
                {...fieldProps("edit-release", errors.releaseAt)}
                type="datetime-local"
                value={values.releaseAt}
                onChange={(e) => set("releaseAt", e.target.value)}
              />
            </FormField>
          )}
          <FormField id="edit-due" label="Due (optional)" error={errors.dueAt}>
            <Input
              {...fieldProps("edit-due", errors.dueAt)}
              type="datetime-local"
              value={values.dueAt}
              onChange={(e) => set("dueAt", e.target.value)}
            />
          </FormField>
          {save.error && !Object.keys(errors).length && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(save.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
