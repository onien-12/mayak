import type { ApiErrorBody, ApiFieldError } from './types';

const API_BASE = '/api/v1';
const NETWORK_ERROR = 'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.';
const UNKNOWN_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Russian message for the user (from the backend `detail`). */
  readonly detail: string;
  /** Per-field messages for 422 validation errors. */
  readonly errors: ApiFieldError[];

  constructor(status: number, body: Partial<ApiErrorBody>) {
    const detail = body.detail ?? UNKNOWN_ERROR;
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'unknown';
    this.detail = detail;
    this.errors = body.errors ?? [];
  }
}

/** User-facing message for any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.detail : UNKNOWN_ERROR;
}

interface AuthBridge {
  getToken: () => string | null;
  onUnauthorized: () => void;
}

let auth: AuthBridge = { getToken: () => null, onUnauthorized: () => undefined };

/** Wired once by the auth feature so `shared/` does not depend on `features/`. */
export function configureApiAuth(bridge: AuthBridge): void {
  auth = bridge;
}

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type QueryParams = Record<string, QueryValue>;

interface RequestOptions {
  params?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  /** How to read a successful response (default `json`). */
  responseType?: 'json' | 'blob';
}

function buildUrl(path: string, params?: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return `${API_BASE}${path}${query ? `?${query}` : ''}`;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && typeof (body as ApiErrorBody).detail === 'string') {
      return new ApiError(response.status, body as ApiErrorBody);
    }
  } catch {
    // Non-JSON error body (proxy / gateway error) — fall through to the generic message.
  }
  return new ApiError(response.status, {});
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> =
    options.responseType === 'blob' ? {} : { Accept: 'application/json' };
  const token = auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.params), {
      method,
      headers,
      body,
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, { detail: NETWORK_ERROR, code: 'network_error' });
  }

  if (!response.ok) {
    const error = await parseError(response);
    if (response.status === 401 && token) auth.onUnauthorized();
    throw error;
  }

  if (response.status === 204) return undefined as T;
  if (options.responseType === 'blob') return (await response.blob()) as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) =>
    request<T>('GET', path, { params, signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
  /** Downloads a file (e.g. GPX export). */
  blob: (path: string) => request<Blob>('GET', path, { responseType: 'blob' }),
};
