import { type SafeFetcher, type SafeFetchBaseConfig, type SafeResult } from './types';
export * from './types';
export * from './errors';
export declare function createSafeFetch(base?: SafeFetchBaseConfig): SafeFetcher;
export declare const safeFetch: SafeFetcher;
export declare const unwrap: <T>(promise: Promise<SafeResult<T>>) => Promise<T>;
