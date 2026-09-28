import type { ApiErrorBody } from "@shared/api";

/** Error thrown for any failed API call. `code` is stable and safe to branch on. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetwork() {
    return this.status === 0;
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Thin fetch wrapper. Auth rides on the httpOnly session cookie (same-origin), so no token is
 * ever handled by JavaScript. Errors are normalised to ApiError from the server's envelope.
 */
export async function api<T>(method: Method, url: string, body?: unknown, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body instanceof FormData ? undefined : body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "You appear to be offline. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON (e.g. a proxy error page)
  }

  if (!response.ok) {
    const envelope = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      envelope?.code ?? "HTTP_ERROR",
      envelope?.message ?? (response.status >= 500 ? "Something went wrong on our side. Please try again." : "Request failed"),
      envelope?.details,
      envelope?.requestId,
    );
  }
  return data as T;
}

export const apiGet = <T>(url: string, init?: RequestInit) => api<T>("GET", url, undefined, init);
export const apiPost = <T>(url: string, body?: unknown) => api<T>("POST", url, body ?? {});
export const apiDelete = <T>(url: string, body?: unknown) => api<T>("DELETE", url, body);

/** Field → message map from a VALIDATION_ERROR, for inline form errors. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
  const out: Record<string, string> = {};
  for (const issue of error.details as { path?: string; message?: string }[]) {
    if (issue.path && issue.message && !out[issue.path]) out[issue.path] = issue.message;
  }
  return out;
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof ApiError ? error.message : fallback;
}
