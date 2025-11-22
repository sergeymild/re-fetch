import type { HttpError, NetworkError, NormalizedError, TimeoutError, ValidationError } from './types';
export declare const networkError: (cause?: unknown) => NetworkError;
export declare const timeoutError: (timeoutMs: number, cause?: unknown) => TimeoutError;
export declare const httpError: (res: Response, body?: unknown) => HttpError;
export declare const validationError: (cause?: unknown) => ValidationError;
export declare const isNormalizedError: (e: unknown) => e is NormalizedError;
