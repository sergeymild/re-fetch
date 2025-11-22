"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBodyInit = exports.parseBody = exports.backoffDelay = exports.buildURL = exports.sleep = void 0;
exports.parseRetryAfter = parseRetryAfter;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
exports.sleep = sleep;
const buildURL = (base, path, q) => {
    const url = path.startsWith('http://') || path.startsWith('https://')
        ? new URL(path)
        : new URL(path, base ?? 'http://localhost');
    if (q) {
        Object.entries(q).forEach(([k, v]) => {
            if (v !== undefined)
                url.searchParams.set(k, String(v));
        });
    }
    return url.toString();
};
exports.buildURL = buildURL;
const backoffDelay = (attempt, cfg) => {
    const base = cfg.baseDelayMs ?? 300;
    const max = cfg.maxDelayMs ?? 2000;
    const raw = Math.min(max, base * 2 ** (attempt - 1));
    const jitter = Math.random() * (raw * 0.2);
    return Math.round(raw + jitter);
};
exports.backoffDelay = backoffDelay;
function parseRetryAfter(res) {
    const ra = res.headers.get('retry-after');
    if (!ra)
        return null;
    const asInt = parseInt(ra, 10);
    if (!Number.isNaN(asInt))
        return asInt * 1000;
    const date = new Date(ra).getTime();
    if (!Number.isNaN(date))
        return Math.max(0, date - Date.now());
    return null;
}
const parseBody = async (res, as) => {
    switch (as) {
        case 'json': {
            if (res.status === 204 || res.status === 205)
                return null;
            try {
                return await res.clone().json();
            }
            catch {
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
exports.parseBody = parseBody;
const toBodyInit = (body) => {
    if (body == null)
        return null;
    if (typeof body === 'string' || body instanceof FormData || body instanceof Blob || body instanceof URLSearchParams || body instanceof ArrayBuffer) {
        return body;
    }
    if (ArrayBuffer.isView(body))
        return body;
    return JSON.stringify(body);
};
exports.toBodyInit = toBodyInit;
