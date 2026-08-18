/**
 * Browser API client. Talks to the API through the Next rewrite (`/api/...`)
 * so auth cookies stay first-party. Never puts secrets in the browser.
 */
export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { error?: ApiError; requestId?: string },
  ) {
    super(body.error?.message ?? `Request failed (${status})`);
    this.name = 'ApiRequestError';
  }

  get code(): string {
    return this.body.error?.code ?? 'INTERNAL';
  }
}

const BASE = '/api/v1';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(res.status, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Upload a file directly to object storage using a presigned PUT URL. */
export async function uploadToPresigned(
  presigned: { url: string; headers: Record<string, string> },
  file: File | Blob,
): Promise<void> {
  const res = await fetch(presigned.url, {
    method: 'PUT',
    headers: presigned.headers,
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}
