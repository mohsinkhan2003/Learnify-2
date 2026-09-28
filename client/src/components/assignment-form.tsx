import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertAssignmentSchema, type InsertAssignment } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { z } from "zod";

interface AssignmentFormProps {
  onSuccess?: () => void;
}

// Form schema that accepts string for datetime-local input
const assignmentFormSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  grade: z.string().min(1, "Grade is required"),
  subject: z.string().min(1, "Subject is required"),
  instructions: z.string().min(1, "Instructions are required"),
  notificationTime: z.string().min(1, "Notification time is required"),
});

type AssignmentFormData = z.infer<typeof assignmentFormSchema>;

export function AssignmentForm({ onSuccess }: AssignmentFormProps) {
  const { toast } = useToast();

  // Set default notification time to current time in datetime-local format
  const getDefaultNotificationTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      topic: "",
      grade: "",
      subject: "",
      instructions: "",
      notificationTime: getDefaultNotificationTime(),
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AssignmentFormData) => {
      // Convert datetime-local string to ISO string for proper timezone handling
      const localDate = new Date(data.notificationTime);
      const isoString = localDate.toISOString();

      const payload = {
        ...data,
        notificationTime: isoString,
      };

      console.log("[Frontend] Local time selected:", data.notificationTime);
      console.log("[Frontend] Converted to UTC ISO:", isoString);
      console.log("[Frontend] Sending assignment data:", payload);

      try {
        const response = await apiRequest("POST", "/api/assignments", payload);
        const result = await response.json();
        console.log("[Frontend] Assignment created successfully:", result);
        return result;
      } catch (error) {
        console.error("[Frontend] Assignment creation failed:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({
        title: "Assignment created",
        description: "Your homework assignment has been created successfully.",
      });
      form.reset();
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create assignment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof assignmentFormSchema>) => {
    // datetime-local gives us "YYYY-MM-DDTHH:mm" in local timezone
    // Convert to a proper Date object which will be in local time
    const localDate = new Date(data.notificationTime);
    // Convert to ISO string which will be in UTC
    const formattedData = {
      ...data,
      notificationTime: localDate.toISOString()
    };
    createMutation.mutate(formattedData);
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Create New Assignment</CardTitle>
        <CardDescription>
          Set up a homework topic and the AI will guide students through understanding it
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              placeholder="e.g., Osmosis"
              data-testid="input-topic"
              {...form.register("topic")}
            />
            {form.formState.errors.topic && (
              <p className="text-sm text-destructive">{form.formState.errors.topic.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="grade">Grade Level</Label>
              <Input
                id="grade"
                placeholder="e.g., Grade 9"
                data-testid="input-grade"
                {...form.register("grade")}
              />
              {form.formState.errors.grade && (
                <p className="text-sm text-destructive">{form.formState.errors.grade.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="e.g., Biology"
                data-testid="input-subject"
                {...form.register("subject")}
              />
              {form.formState.errors.subject && (
                <p className="text-sm text-destructive">{form.formState.errors.subject.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">AI Instructions</Label>
            <Textarea
              id="instructions"
              placeholder="Tell the AI how to help students. E.g., 'First assess what the student knows about osmosis by asking basic questions. Then provide targeted help only in areas where they struggle.'"
              rows={4}
              data-testid="input-instructions"
              {...form.register("instructions")}
            />
            {form.formState.errors.instructions && (
              <p className="text-sm text-destructive">{form.formState.errors.instructions.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Describe how the AI should interact with students and what learning approach to use
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notificationTime">Notification Time</Label>
            <Input
              id="notificationTime"
              type="datetime-local"
              data-testid="input-notification-time"
              {...form.register("notificationTime")}
            />
            {form.formState.errors.notificationTime && (
              <p className="text-sm text-destructive">{form.formState.errors.notificationTime.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              When should students receive a notification about this homework?
            </p>
          </div>

          <div className="flex gap-4">
            <Button
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Assignment"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}