import { type SafeFetcher, type SafeFetchBaseConfig } from './types';
export * from './types';
export * from './errors';
export declare function createSafeFetch(base?: SafeFetchBaseConfig): SafeFetcher;
export declare const safeFetch: SafeFetcher;
