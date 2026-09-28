import { useMutation, useQuery } from "@tanstack/react-query";
import type { AuthProviders, PublicUser } from "@shared/api";
import { apiGet, apiPost } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/query";

async function fetchMe(): Promise<PublicUser | null> {
  const { user } = await apiGet<{ user: PublicUser | null }>("/api/auth/session");
  return user;
}

/** Current user from the session cookie. `null` means signed out. */
export function useAuth() {
  const query = useQuery({ queryKey: queryKeys.me, queryFn: fetchMe, staleTime: 5 * 60_000 });
  return { user: query.data ?? null, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

export function useAuthProviders() {
  return useQuery({ queryKey: queryKeys.providers, queryFn: () => apiGet<AuthProviders>("/api/auth/providers"), staleTime: Infinity });
}

/** Replace all cached data with the new user's (never show one account's data to another). */
function establish(user: PublicUser | null) {
  queryClient.clear();
  queryClient.setQueryData(queryKeys.me, user);
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  role: "teacher" | "student";
  school: string;
  subject?: string;
  classCode?: string;
}

export function useLogin() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => apiPost<PublicUser>("/api/auth/login", input),
    onSuccess: establish,
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: (input: SignupInput) => apiPost<PublicUser>("/api/auth/signup", input),
    onSuccess: establish,
  });
}

export function useCompleteGoogleSignup() {
  return useMutation({
    mutationFn: (input: Omit<SignupInput, "email" | "password">) => apiPost<PublicUser>("/api/auth/google/complete", input),
    onSuccess: establish,
  });
}

/** Sets a new password from a reset link and signs in (all other sessions are revoked server-side). */
export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) => apiPost<PublicUser>("/api/auth/password/reset", input),
    onSuccess: establish,
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => apiPost<void>("/api/auth/logout"),
    onSettled: () => establish(null),
  });
}

export function homePathFor(user: PublicUser): string {
  return user.role === "teacher" ? "/teacher" : "/student";
}

/** Only same-site relative paths are accepted as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
