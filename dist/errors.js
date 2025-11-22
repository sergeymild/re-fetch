"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNormalizedError = exports.validationError = exports.httpError = exports.timeoutError = exports.networkError = void 0;
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
const validationError = (cause) => ({
    name: 'ValidationError',
    message: 'Validation failed',
    cause
});
exports.validationError = validationError;
const isNormalizedError = (e) => !!e && typeof e === 'object' && 'name' in e && 'message' in e;
exports.isNormalizedError = isNormalizedError;
