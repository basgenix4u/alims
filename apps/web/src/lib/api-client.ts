import type { HealthResponse, ProblemDetails } from '@alims/contracts';

/**
 * Typed API client.
 *
 * Uses relative URLs so the browser always calls its own origin; Next.js
 * proxies to the API service. Browser code must never target localhost,
 * because the user's browser is not the host running the API.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'include',
  });

  if (!res.ok) {
    let problem: ProblemDetails | null = null;
    try {
      problem = (await res.json()) as ProblemDetails;
    } catch {
      problem = null;
    }
    throw new ApiError(res.status, problem, problem?.detail ?? `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/health'),
};
