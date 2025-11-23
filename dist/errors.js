"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTimeoutError = exports.isNetworkError = exports.isHttpError = exports.isNormalizedError = exports.httpError = exports.timeoutError = exports.networkError = void 0;
exports.toTypedHttpError = toTypedHttpError;
exports.asHttpError = asHttpError;
const networkError = (cause) => ({
    name: 'NetworkError',
    message: 'Network request failed',
    cause
});
exports.networkError = networkError;
const timeoutError = (timeoutMs, cause) => ({
    name: 'TimeoutError',
    message: `Request timed out after ${timeoutMs} ms`,
    timeoutMs,
    cause
});
exports.timeoutError = timeoutError;
const httpError = (res, body) => ({
    name: 'HttpError',
    message: `HTTP ${res.status} ${res.statusText}`,
    status: res.status,
    statusText: res.statusText,
    body
});
exports.httpError = httpError;
const isNormalizedError = (e) => !!e && typeof e === 'object' && 'name' in e && 'message' in e;
exports.isNormalizedError = isNormalizedError;
// Type guards for specific error types
const isHttpError = (e) => e.name === 'HttpError';
exports.isHttpError = isHttpError;
const isNetworkError = (e) => e.name === 'NetworkError';
exports.isNetworkError = isNetworkError;
const isTimeoutError = (e) => e.name === 'TimeoutError';
exports.isTimeoutError = isTimeoutError;
// Generic type guard to cast HttpError body to specific type
function toTypedHttpError(error) {
    if (!(0, exports.isHttpError)(error)) {
        return null;
    }
    return error;
}
// Convenience function that throws if not HttpError
function asHttpError(error) {
    const typed = toTypedHttpError(error);
    if (!typed) {
        throw new Error(`Expected HttpError but got ${error.name}`);
    }
    return typed;
}
