import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, apiGet } from "./api";

/** Central query keys. The first element is the URL (used by the default fetcher). */
export const queryKeys = {
  me: ["/api/auth/me"] as const,
  providers: ["/api/auth/providers"] as const,
  teacherOverview: ["/api/teacher/overview"] as const,
  teacherAssignments: (archived: boolean) => ["/api/teacher/assignments", { archived }] as const,
  teacherAssignment: (id: string) => [`/api/teacher/assignments/${id}`] as const,
  teacherTranscript: (id: string, studentId: string) => [`/api/teacher/assignments/${id}/students/${studentId}/messages`] as const,
  teacherStudents: (search: string) => ["/api/teacher/students", { search }] as const,
  roster: ["/api/teacher/roster"] as const,
  studentAssignments: ["/api/student/assignments"] as const,
  tutorSession: (id: string) => [`/api/student/assignments/${id}`] as const,
  pushKey: ["/api/push/public-key"] as const,
};

function urlFor(key: readonly unknown[]): string {
  const [path, params] = key as [string, Record<string, unknown> | undefined];
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

const onAuthError = (error: unknown) => {
  // A 401 anywhere means the session ended (expired, logged out elsewhere): refresh auth state
  // so route guards send the user to sign in.
  if (error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(queryKeys.me, null);
  }
};

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      queryFn: ({ queryKey, signal }) => apiGet(urlFor(queryKey), { signal }),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => {
        // Retry transient failures only — never client errors.
        if (error instanceof ApiError && error.status > 0 && error.status < 500) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});
