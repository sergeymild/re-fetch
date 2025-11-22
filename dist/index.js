"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unwrap = exports.safeFetch = void 0;
exports.createSafeFetch = createSafeFetch;
const utils_1 = require("./utils");
const errors_1 = require("./errors");
__exportStar(require("./types"), exports);
__exportStar(require("./errors"), exports);
function createSafeFetch(base = {}) {
    const defaultParseAs = base.parseAs ?? 'json';
    let refreshPromise = null;
    const cache = new Map();
    async function core(url, init = {}, isRefreshRetry = false) {
        let totalTimedOut = false;
        const method = (init.method ?? 'GET').toUpperCase();
        const parseAs = init.parseAs ?? defaultParseAs;
        const query = { ...(base.query ?? {}), ...(init.query ?? {}) };
        const targetUrl = (0, utils_1.buildURL)(base.baseURL, url, query);
        const retries = init.retries ?? false;
        if (init.cached && !isRefreshRetry) {
            const cacheKey = `${method}:${targetUrl}`;
            const cachedEntry = cache.get(cacheKey);
            if (cachedEntry) {
                const now = Date.now();
                const cacheTime = init.cached.cacheTime ?? Infinity;
                const isValid = (now - cachedEntry.timestamp) < cacheTime;
                if (isValid) {
                    init.cached.onValue?.(cachedEntry.data);
                }
                else {
                    cache.delete(cacheKey);
                }
            }
        }
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
                overallController.abort();
            }, totalTimeout)
            : undefined;
        const attemptFetch = async (attempt) => {
            if (aborted) {
                const mapped = mapError((0, errors_1.networkError)(new DOMException('Aborted', 'AbortError')));
                await base.interceptors?.onError?.(mapped);
                return { ok: false, error: mapped };
            }
            if (exceededTotalTimeout()) {
                const mapped = mapError((0, errors_1.timeoutError)(totalTimeout, new Error('Total timeout exceeded')));
                await base.interceptors?.onError?.(mapped);
                return { ok: false, error: mapped };
            }
            const attemptController = perAttemptTimeout ? new AbortController() : undefined;
            let attemptTimedOut = false;
            const attemptTimer = perAttemptTimeout
                ? setTimeout(() => {
                    attemptTimedOut = true;
                    attemptController.abort();
                }, perAttemptTimeout)
                : undefined;
            try {
                const reqHeadersObj = {
                    ...(base.headers ?? {}),
                    ...(init.headers ?? {}),
                };
                if (base.authentication) {
                    const authHeaders = await base.authentication();
                    Object.assign(reqHeadersObj, authHeaders);
                }
                const reqInit = { method, headers: reqHeadersObj };
                if (attemptController?.signal) {
                    if (overallController?.signal) {
                        overallController.signal.addEventListener('abort', () => attemptController.abort(), { once: true });
                    }
                    else if (externalSignal) {
                        externalSignal.addEventListener('abort', () => attemptController.abort(), { once: true });
                    }
                    reqInit.signal = attemptController.signal;
                }
                else if (overallController?.signal) {
                    reqInit.signal = overallController.signal;
                }
                else if (externalSignal) {
                    reqInit.signal = externalSignal;
                }
                if (init.body !== undefined && method !== 'GET' && method !== 'HEAD') {
                    reqInit.body = (0, utils_1.toBodyInit)(init.body);
                    if (init.body && typeof init.body === 'object' && !(init.body instanceof FormData)) {
                        const h = reqInit.headers;
                        const hasCT = Object.keys(h).some(k => k.toLowerCase() === 'content-type');
                        if (!hasCT)
                            h['Content-Type'] = 'application/json';
                    }
                }
                if (init.credentials)
                    reqInit.credentials = init.credentials;
                if (init.cache)
                    reqInit.cache = init.cache;
                if (init.redirect)
                    reqInit.redirect = init.redirect;
                if (init.referrer)
                    reqInit.referrer = init.referrer;
                if (init.referrerPolicy)
                    reqInit.referrerPolicy = init.referrerPolicy;
                if (init.integrity)
                    reqInit.integrity = init.integrity;
                if (init.keepalive)
                    reqInit.keepalive = init.keepalive;
                if (init.mode)
                    reqInit.mode = init.mode;
                await base.interceptors?.onRequest?.(targetUrl, { ...reqInit, url: targetUrl });
                const fetchPromise = fetch(targetUrl, reqInit);
                const abortPromise = (attemptController?.signal ?? overallController?.signal)
                    ? new Promise((_, reject) => {
                        const s = attemptController?.signal ?? overallController.signal;
                        s.addEventListener('abort', () => {
                            reject(new DOMException('Aborted', 'AbortError'));
                        }, { once: true });
                    })
                    : undefined;
                const res = await (abortPromise ? Promise.race([fetchPromise, abortPromise]) : fetchPromise);
                await base.interceptors?.onResponse?.(res.clone());
                const parsed = await (0, utils_1.parseBody)(res, parseAs);
                if (!res.ok) {
                    const shouldRefresh = base.refreshToken && !isRefreshRetry &&
                        (base.shouldRefreshToken ? base.shouldRefreshToken(res) : res.status === 401);
                    if (shouldRefresh) {
                        if (refreshPromise) {
                            await refreshPromise;
                        }
                        else {
                            refreshPromise = base.refreshToken()
                                .finally(() => {
                                refreshPromise = null;
                            });
                            try {
                                await refreshPromise;
                            }
                            catch (refreshError) {
                                const err = (0, errors_1.httpError)(res, parsed);
                                const mapped = mapError(err);
                                await base.interceptors?.onError?.(mapped);
                                return { ok: false, error: mapped, response: res };
                            }
                        }
                        return core(url, init, true);
                    }
                    const err = (0, errors_1.httpError)(res, parsed);
                    if (retries && shouldRetry(retries, attempt, { response: res })) {
                        let delay = (0, utils_1.backoffDelay)(attempt, retries);
                        if (res.status === 429) {
                            const ra = (0, utils_1.parseRetryAfter)(res);
                            if (ra != null)
                                delay = ra;
                        }
                        await (0, utils_1.sleep)(delay);
                        return attemptFetch(attempt + 1);
                    }
                    const mapped = mapError(err);
                    await base.interceptors?.onError?.(mapped);
                    return { ok: false, error: mapped, response: res };
                }
                if (init.validate) {
                    const result = init.validate(parsed);
                    if (!result.success) {
                        const mapped = mapError((0, errors_1.validationError)(result.error));
                        await base.interceptors?.onError?.(mapped);
                        return { ok: false, error: mapped, response: res };
                    }
                    if (init.cached) {
                        const cacheKey = `${method}:${targetUrl}`;
                        cache.set(cacheKey, {
                            data: result.data,
                            response: res,
                            timestamp: Date.now()
                        });
                    }
                    return { ok: true, data: result.data, response: res };
                }
                if (init.cached) {
                    const cacheKey = `${method}:${targetUrl}`;
                    cache.set(cacheKey, {
                        data: parsed,
                        response: res,
                        timestamp: Date.now()
                    });
                }
                return { ok: true, data: parsed, response: res };
            }
            catch (e) {
                const isAbort = e?.name === 'AbortError';
                const baseErr = isAbort
                    ? (totalTimedOut
                        ? (0, errors_1.timeoutError)(totalTimeout, e)
                        : (perAttemptTimeout && attemptTimedOut
                            ? (0, errors_1.timeoutError)(perAttemptTimeout, e)
                            : (0, errors_1.networkError)(e)))
                    : (0, errors_1.networkError)(e);
                if (retries && shouldRetry(retries, attempt, { error: baseErr })) {
                    await (0, utils_1.sleep)((0, utils_1.backoffDelay)(attempt, retries));
                    return attemptFetch(attempt + 1);
                }
                const mapped = mapError(baseErr);
                await base.interceptors?.onError?.(mapped);
                return { ok: false, error: mapped };
            }
            finally {
                if (attemptTimer)
                    clearTimeout(attemptTimer);
            }
        };
        const shouldRetry = (cfg, attempt, ctx) => {
            if (attempt >= cfg.times)
                return false;
            if (cfg.retryOn)
                return !!cfg.retryOn({ attempt, ...ctx });
            const res = ctx.response;
            const err = ctx.error;
            if (err)
                return err.name === 'NetworkError' || err.name === 'TimeoutError';
            if (res)
                return res.status >= 500 || res.status === 429;
            return false;
        };
        const mapError = (e) => {
            if (base.errorMap) {
                try {
                    const out = base.errorMap(e);
                    return (0, errors_1.isNormalizedError)(out) ? out : e;
                }
                catch {
                    return e;
                }
            }
            return e;
        };
        try {
            const result = await attemptFetch(1);
            return result;
        }
        finally {
            if (totalTimeoutTimer) {
                clearTimeout(totalTimeoutTimer);
            }
        }
    }
    const api = core;
    api.get = (url, init) => core(url, { ...init, method: 'GET' });
    api.delete = (url, init) => core(url, { ...init, method: 'DELETE' });
    api.post = (url, body, init) => core(url, { ...(init ?? {}), method: 'POST', body: body });
    api.put = (url, body, init) => core(url, { ...(init ?? {}), method: 'PUT', body: body });
    api.patch = (url, body, init) => core(url, { ...(init ?? {}), method: 'PATCH', body: body });
    return api;
}
exports.safeFetch = createSafeFetch();
const unwrap = async (promise) => {
    const result = await promise;
    if (!result.ok)
        throw result.error;
    return result.data;
};
exports.unwrap = unwrap;
