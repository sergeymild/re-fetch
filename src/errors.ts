import type { HttpError, NetworkError, NormalizedError, TimeoutError } from './types';

export const networkError = (cause?: unknown): NetworkError => ({
  name: 'NetworkError',
  message: 'Network request failed',
  cause
});

export const timeoutError = (timeoutMs: number, cause?: unknown): TimeoutError => ({
  name: 'TimeoutError',
  message: `Request timed out after ${timeoutMs} ms`,
  timeoutMs,
  cause
});

export const httpError = (res: Response, body?: unknown): HttpError => ({
  name: 'HttpError',
  message: `HTTP ${res.status} ${res.statusText}`,
  status: res.status,
  statusText: res.statusText,
  body
});

export const isNormalizedError = (e: unknown): e is NormalizedError =>
  !!e && typeof e === 'object' && 'name' in e && 'message' in e;

// Type guards for specific error types
export const isHttpError = (e: NormalizedError): e is HttpError =>
  e.name === 'HttpError';

export const isNetworkError = (e: NormalizedError): e is NetworkError =>
  e.name === 'NetworkError';

export const isTimeoutError = (e: NormalizedError): e is TimeoutError =>
  e.name === 'TimeoutError';

// Generic type guard to cast HttpError body to specific type
export function toTypedHttpError<TBody = unknown>(
  error: NormalizedError
): HttpError & { body: TBody } | null {
  if (!isHttpError(error)) {
    return null;
  }
  return error as HttpError & { body: TBody };
}

// Convenience function that throws if not HttpError
export function asHttpError<TBody = unknown>(
  error: NormalizedError
): HttpError & { body: TBody } {
  const typed = toTypedHttpError<TBody>(error);
  if (!typed) {
    throw new Error(`Expected HttpError but got ${error.name}`);
  }
  return typed;
}
