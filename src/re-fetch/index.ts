import {
  type SafeFetcher,
  type SafeFetchBaseConfig,
  type SafeFetchRequest,
  type SafeResult,
  type NormalizedError,
  type ParseAs,
  type RetryStrategy,
  type HttpMethod
} from './types';
import { backoffDelay, buildURL, parseBody, toBodyInit, sleep, parseRetryAfter } from './utils';
import { httpError, networkError, timeoutError, validationError, isNormalizedError } from './errors';

export * from './types';
export * from './errors';

export function createSafeFetch(base: SafeFetchBaseConfig = {}): SafeFetcher {
  const defaultParseAs: ParseAs = base.parseAs ?? 'json';

  async function core<TOut = unknown>(
    url: string,
    init: SafeFetchRequest<TOut> = {}
  ): Promise<SafeResult<TOut>> {
    let totalTimedOut = false;
    const method = (init.method ?? 'GET').toUpperCase() as HttpMethod;
    const parseAs = init.parseAs ?? defaultParseAs;
    const query = { ...(base.query ?? {}), ...(init.query ?? {}) };
    const targetUrl = buildURL(base.baseURL, url, query);
    const retries = init.retries ?? base.retries ?? false;

    const perAttemptTimeout = init.timeoutMs ?? base.timeoutMs ?? 0;
    const totalTimeout = init.totalTimeoutMs ?? base.totalTimeoutMs ?? 0;
    const startedAt = totalTimeout ? Date.now() : 0;
    const exceededTotalTimeout = () => totalTimeout && (Date.now() - startedAt >= totalTimeout);

    const externalSignal = init.signal;
    let aborted = false;
    externalSignal?.addEventListener('abort', () => { aborted = true; });

    const overallController = totalTimeout ? new AbortController() : undefined;
    const totalTimeoutTimer = totalTimeout
      ? setTimeout(() => {
        totalTimedOut = true;
        overallController!.abort();
      }, totalTimeout)
      : undefined;

    const attemptFetch = async (attempt: number): Promise<SafeResult<TOut>> => {
      if (aborted) {
        const mapped = mapError(networkError(new DOMException('Aborted', 'AbortError')));
        await base.interceptors?.onError?.(mapped);
        return { ok: false, error: mapped };
      }

      if (exceededTotalTimeout()) {
        const mapped = mapError(timeoutError(totalTimeout, new Error('Total timeout exceeded')));
        await base.interceptors?.onError?.(mapped);
        return { ok: false, error: mapped };
      }

      const attemptController = perAttemptTimeout ? new AbortController() : undefined;
      let attemptTimedOut = false;
      const attemptTimer = perAttemptTimeout
        ? setTimeout(() => {
          attemptTimedOut = true;
          attemptController!.abort();
        }, perAttemptTimeout)
        : undefined;

      try {
        const reqHeadersObj: Record<string, string> = {
          ...(base.headers ?? {}),
          ...((init.headers as any) ?? {}),
        };
        const reqInit: RequestInit = { method, headers: reqHeadersObj };

        if (attemptController?.signal) {
          if (overallController?.signal) {
            overallController.signal.addEventListener('abort', () => attemptController.abort(), { once: true });
          } else if (externalSignal) {
            externalSignal.addEventListener('abort', () => attemptController.abort(), { once: true });
          }
          reqInit.signal = attemptController.signal;
        } else if (overallController?.signal) {
          reqInit.signal = overallController.signal;
        } else if (externalSignal) {
          reqInit.signal = externalSignal;
        }

        if (init.body !== undefined && method !== 'GET' && method !== 'HEAD') {
          reqInit.body = toBodyInit(init.body);
          if (init.body && typeof init.body === 'object' && !(init.body instanceof FormData)) {
            const h = reqInit.headers as Record<string, string>;
            const hasCT = Object.keys(h).some(k => k.toLowerCase() === 'content-type');
            if (!hasCT) h['Content-Type'] = 'application/json';
          }
        }

        if (init.credentials) reqInit.credentials = init.credentials;
        if (init.cache) reqInit.cache = init.cache;
        if (init.redirect) reqInit.redirect = init.redirect;
        if (init.referrer) reqInit.referrer = init.referrer;
        if (init.referrerPolicy) reqInit.referrerPolicy = init.referrerPolicy;
        if (init.integrity) reqInit.integrity = init.integrity;
        if (init.keepalive) reqInit.keepalive = init.keepalive;
        if (init.mode) reqInit.mode = init.mode;

        await base.interceptors?.onRequest?.(targetUrl, { ...reqInit, url: targetUrl });

        const fetchPromise = fetch(targetUrl, reqInit);
        const abortPromise =
          (attemptController?.signal ?? overallController?.signal)
            ? new Promise<never>((_, reject) => {
              const s = attemptController?.signal ?? overallController!.signal;
              s.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              }, { once: true });
            })
            : undefined;
        const res = await (abortPromise ? Promise.race([fetchPromise, abortPromise]) : fetchPromise);

        await base.interceptors?.onResponse?.(res.clone());

        const parsed = await parseBody(res, parseAs);

        if (!res.ok) {
          const err = httpError(res, parsed);
          if (retries && shouldRetry(retries, attempt, method, { response: res })) {
            let delay = backoffDelay(attempt, retries);
            if (res.status === 429) {
              const ra = parseRetryAfter(res);
              if (ra != null) delay = ra;
            }
            await sleep(delay);
            return attemptFetch(attempt + 1);
          }
          const mapped = mapError(err);
          await base.interceptors?.onError?.(mapped);
          return { ok: false, error: mapped, response: res };
        }

        if (init.validate) {
          const result = init.validate(parsed);
          if (!result.success) {
            const mapped = mapError(validationError(result.error));
            await base.interceptors?.onError?.(mapped);
            return { ok: false, error: mapped, response: res };
          }
          return { ok: true, data: result.data, response: res };
        }

        return { ok: true, data: parsed as TOut, response: res };
      } catch (e: any) {
        const isAbort = e?.name === 'AbortError';
        const baseErr = isAbort
          ? (totalTimedOut
            ? timeoutError(totalTimeout, e)
            : (perAttemptTimeout && attemptTimedOut
              ? timeoutError(perAttemptTimeout, e)
              : networkError(e)))
          : networkError(e);

        if (retries && shouldRetry(retries, attempt, method, { error: baseErr })) {
          await sleep(backoffDelay(attempt, retries));
          return attemptFetch(attempt + 1);
        }
        const mapped = mapError(baseErr);
        await base.interceptors?.onError?.(mapped);
        return { ok: false, error: mapped };
      } finally {
        if (attemptTimer) clearTimeout(attemptTimer);
      }
    };

    const shouldRetry = (
      cfg: Exclude<RetryStrategy, false>,
      attempt: number,
      method: string,
      ctx: any
    ) => {
      if (attempt >= cfg.retries) return false;
      if (cfg.retryOn) return !!cfg.retryOn({ attempt, ...ctx });

      const isIdempotent = method === 'GET' || method === 'HEAD';
      if (!isIdempotent) {
        return false;
      }

      const res: Response | undefined = ctx.response;
      const err: NormalizedError | undefined = ctx.error;
      if (err) return err.name === 'NetworkError' || err.name === 'TimeoutError';
      if (res) return res.status >= 500 || res.status === 429;
      return false;
    };

    const mapError = (e: NormalizedError): NormalizedError => {
      if (base.errorMap) {
        try {
          const out = base.errorMap(e);
          return isNormalizedError(out) ? out : e;
        } catch {
          return e;
        }
      }
      return e;
    };

    try {
      const result = await attemptFetch(1);
      return result;
    } finally {
      if (totalTimeoutTimer) {
        clearTimeout(totalTimeoutTimer);
      }
    }
  }

  const api = core as SafeFetcher;
  api.get = (url, init) => core(url, { ...init, method: 'GET' });
  api.delete = (url, init) => core(url, { ...init, method: 'DELETE' });
  api.post = (url, body, init) => core(url, { ...(init ?? {}), method: 'POST', body: body as any });
  api.put = (url, body, init) => core(url, { ...(init ?? {}), method: 'PUT', body: body as any });
  api.patch = (url, body, init) => core(url, { ...(init ?? {}), method: 'PATCH', body: body as any });

  return api;
}

export const safeFetch = createSafeFetch();

export const unwrap = async <T>(promise: Promise<SafeResult<T>>): Promise<T> => {
  const result = await promise;
  if (!result.ok) throw result.error;
  return result.data;
};
