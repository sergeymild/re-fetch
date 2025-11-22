import type { ParseAs, RetryStrategy } from './types';
export declare const sleep: (ms: number) => Promise<unknown>;
export declare const buildURL: (base: string | undefined, path: string, q?: Record<string, any>) => string;
export declare const backoffDelay: (attempt: number, cfg: Exclude<RetryStrategy, false>) => number;
export declare function parseRetryAfter(res: Response): number | null;
export declare const parseBody: (res: Response, as: ParseAs) => Promise<any>;
export declare const toBodyInit: (body: any) => BodyInit | null;
