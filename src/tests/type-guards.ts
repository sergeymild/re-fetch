import type { SafeResult, NormalizedError } from '../re-fetch';

export function isError<T>(
  r: SafeResult<T>
): r is { ok: false; error: NormalizedError; response?: Response } {
  return !r.ok;
}

export function isSuccess<T>(
  r: SafeResult<T>
): r is { ok: true; data: T; response: Response } {
  return r.ok;
}
