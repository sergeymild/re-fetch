import type { HttpError, NetworkError, NormalizedError, TimeoutError } from './types';
export declare const networkError: (cause?: unknown) => NetworkError;
export declare const timeoutError: (timeoutMs: number, cause?: unknown) => TimeoutError;
export declare const httpError: (res: Response, body?: unknown) => HttpError;
export declare const isNormalizedError: (e: unknown) => e is NormalizedError;
export declare const isHttpError: (e: NormalizedError) => e is HttpError;
export declare const isNetworkError: (e: NormalizedError) => e is NetworkError;
export declare const isTimeoutError: (e: NormalizedError) => e is TimeoutError;
export declare function toTypedHttpError<TBody = unknown>(error: NormalizedError): HttpError & {
    body: TBody;
} | null;
export declare function asHttpError<TBody = unknown>(error: NormalizedError): HttpError & {
    body: TBody;
};
