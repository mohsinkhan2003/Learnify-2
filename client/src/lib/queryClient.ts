import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Prefer the server's { error } message so users see why a request failed.
async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return;
  const data = await response.json().catch(() => null);
  throw new Error(data?.error || `Request failed (${response.status})`);
}

const defaultQueryFn: QueryFunction = async ({ queryKey }) => {
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(queryKey[0] as string, {
    credentials: "include",
    headers,
  });

  await throwIfNotOk(response);

  return response.json();
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 0, // Changed from 1 minute to always refetch
      retry: false,
      refetchOnWindowFocus: true, // Changed to true for better sync
      refetchOnMount: 'always', // Always refetch on mount
    },
    mutations: {
      retry: false,
    },
  },
});

export async function apiRequest(
  method: string,
  url: string,
  body?: any
): Promise<Response> {
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
    credentials: "include",
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  await throwIfNotOk(response);

  return response;
}