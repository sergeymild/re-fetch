import type { HttpError, NetworkError, NormalizedError, TimeoutError, ValidationError } from './types';

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

export const validationError = (cause?: unknown): ValidationError => ({
  name: 'ValidationError',
  message: 'Validation failed',
  cause
});

export const isNormalizedError = (e: unknown): e is NormalizedError =>
  !!e && typeof e === 'object' && 'name' in e && 'message' in e;
