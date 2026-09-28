import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { StudentProgressDto, TutorSessionDto, TutorTurnResult } from "@shared/api";
import { ApiError, apiPost } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/query";

export interface PendingMessage {
  clientMessageId: string;
  content: string;
  source: "text" | "voice";
  state: "sending" | "failed";
  error?: string;
}

const HEARTBEAT_MS = 30_000;

function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // RFC 4122 v4 fallback for older browsers / non-secure contexts.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Server state for a tutoring session lives in TanStack Query. The only local state is the
 * in-flight/failed student message, which keeps its clientMessageId so a retry is idempotent.
 */
export function useTutorSession(assignmentId: string) {
  const key = queryKeys.tutorSession(assignmentId);
  const session = useQuery<TutorSessionDto>({ queryKey: key, staleTime: 10_000 });
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const sendingRef = useRef(false);

  const applyProgress = useCallback(
    (progress: StudentProgressDto) => {
      queryClient.setQueryData<TutorSessionDto>(key, (old) => (old ? { ...old, progress } : old));
      queryClient.invalidateQueries({ queryKey: queryKeys.studentAssignments });
    },
    [key],
  );

  const start = useMutation({
    mutationFn: () => apiPost<TutorSessionDto>(`/api/student/assignments/${assignmentId}/session`),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });

  /** Sends a message; resolves with the tutor's reply text, or null on failure (shown inline). */
  const send = useCallback(
    async (content: string, source: "text" | "voice", retryOf?: PendingMessage): Promise<string | null> => {
      if (sendingRef.current) return null;
      sendingRef.current = true;
      const message: PendingMessage = retryOf
        ? { ...retryOf, state: "sending", error: undefined }
        : { clientMessageId: newId(), content, source, state: "sending" };
      setPending(message);
      try {
        const result = await apiPost<TutorTurnResult>(`/api/student/assignments/${assignmentId}/messages`, {
          content: message.content,
          source: message.source,
          clientMessageId: message.clientMessageId,
        });
        queryClient.setQueryData<TutorSessionDto>(key, (old) => {
          if (!old) return old;
          const ids = new Set(old.messages.map((m) => m.id));
          const added = [result.studentMessage, result.tutorMessage].filter((m) => !ids.has(m.id));
          return { ...old, messages: [...old.messages, ...added], progress: result.progress };
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.studentAssignments });
        setPending(null);
        return result.tutorMessage.content;
      } catch (error) {
        const e = error instanceof ApiError ? error : null;
        // Session-level refusals are not retryable: refresh state and drop the draft bubble.
        if (e && ["ASSIGNMENT_COMPLETED", "SESSION_FINISHED", "ASSIGNMENT_NOT_FOUND"].includes(e.code)) {
          setPending(null);
          queryClient.invalidateQueries({ queryKey: key });
        } else {
          setPending({ ...message, state: "failed", error: e?.message ?? "Your message couldn't be sent." });
          if (e?.code === "TURN_IN_PROGRESS") setTimeout(() => queryClient.invalidateQueries({ queryKey: key }), 2000);
        }
        return null;
      } finally {
        sendingRef.current = false;
      }
    },
    [assignmentId, key],
  );

  const complete = useMutation({
    mutationFn: () => apiPost<StudentProgressDto>(`/api/student/assignments/${assignmentId}/complete`),
    onSuccess: applyProgress,
  });

  // Active-time heartbeats: only while the tab is visible and the work isn't finished.
  const status = session.data?.progress.status;
  useEffect(() => {
    if (!status || status === "not_started" || status === "completed") return;
    const beat = () => {
      if (document.visibilityState === "visible") apiPost(`/api/student/assignments/${assignmentId}/heartbeat`).catch(() => {});
    };
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [assignmentId, status]);

  return { session, start, send, pending, discardPending: () => setPending(null), complete };
}
