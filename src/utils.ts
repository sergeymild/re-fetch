import type { ParseAs, RetryStrategy } from './types';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const buildURL = (base: string | undefined, path: string, q?: Record<string, any>) => {
  const url = path.startsWith('http://') || path.startsWith('https://')
    ? new URL(path)
    : new URL(path, base ?? 'http://localhost');
  if (q) {
    Object.entries(q).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
};

export const backoffDelay = (attempt: number, cfg: Exclude<RetryStrategy, false>) => {
  const base = cfg.baseDelayMs ?? 300;
  const max = cfg.maxDelayMs ?? 2000;
  const raw = Math.min(max, base * 2 ** (attempt - 1));
  const jitter = Math.random() * (raw * 0.2);
  return Math.round(raw + jitter);
};

export function parseRetryAfter(res: Response): number | null {
  const ra = res.headers.get('retry-after');
  if (!ra) return null;
  const asInt = parseInt(ra, 10);
  if (!Number.isNaN(asInt)) return asInt * 1000;
  const date = new Date(ra).getTime();
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export const parseBody = async (res: Response, as: ParseAs) => {
  switch (as) {
    case 'json': {
      if (res.status === 204 || res.status === 205) return null;
      try {
        return await res.clone().json();
      } catch {
        return null;
      }
    }
    case 'text':
      return await res.text();
    case 'blob':
      return await res.blob();
    case 'arrayBuffer':
      return await res.arrayBuffer();
    case 'response':
    default:
      return res;
  }
};

export const toBodyInit = (body: any): BodyInit | null => {
  if (body == null) return null;
  if (typeof body === 'string' || body instanceof FormData || body instanceof Blob || body instanceof URLSearchParams || body instanceof ArrayBuffer) {
    return body as BodyInit;
  }
  if (ArrayBuffer.isView(body)) return body as unknown as BodyInit;
  return JSON.stringify(body);
};
