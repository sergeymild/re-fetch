import { createSafeFetch, safeFetch } from '../index';
import { isError, isSuccess } from './type-guards';

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('safe-fetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('returns ok:true on 200 + json', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ hello: 'world' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const api = createSafeFetch();
      const res = await api.get<{ hello: string }>('/hello');

      expect(res.ok).toBe(true);
      if (isSuccess(res)) {
        expect(res.data.hello).toBe('world');
        expect(res.response.status).toBe(200);
      }
    });

    it('returns HttpError on 500', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
      );

      const api = createSafeFetch();
      const res = await api.get('/error');

      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('HttpError');
        expect((res.error as any).status).toBe(500);
        expect(res.response?.status).toBe(500);
      }
    });

    it('returns NetworkError on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failed'));

      const api = createSafeFetch();
      const res = await api.get('/fail');

      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('NetworkError');
        expect(res.error.message).toBe('Network request failed');
      }
    });
  });

  describe('http methods', () => {
    it('GET method works', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"data": "get"}', { status: 200 }));

      await safeFetch.get('/test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('POST method works with body', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"data": "post"}', { status: 200 }));

      const body = { name: 'test' };
      await safeFetch.post('/test', body);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('DELETE method works', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await safeFetch.delete('/test/123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test/123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('configuration', () => {
    it('uses baseURL', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      const api = createSafeFetch({ baseURL: 'https://api.example.com' });
      await api.get('/users');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.any(Object)
      );
    });

    it('adds query parameters', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      const api = createSafeFetch({ baseURL: 'https://api.example.com' });
      await api.get('/users', { query: { page: 1, limit: 10 } });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users?page=1&limit=10',
        expect.any(Object)
      );
    });

    it('adds default headers', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      const api = createSafeFetch({
        headers: { Authorization: 'Bearer token' }
      });
      await api.get('/users');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token'
          })
        })
      );
    });
  });

  describe('retries', () => {
    it('adds Authentication request', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('{"success": true}', { status: 200 }));

      const api = createSafeFetch({
        authentication: () => {
          return {'Authentication': `Bearer token`}
        }
      });
      const res = await api.get('/test');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authentication': 'Bearer token'
          })
        })
      );
      expect(res.ok).toBe(true);
    });

    it('calls authentication on retry', async () => {
      const authSpy = jest.fn().mockReturnValue({ 'Authentication': 'Bearer token' });

      mockFetch
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        .mockResolvedValueOnce(new Response('{"success": true}', { status: 200 }));

      const api = createSafeFetch({
        authentication: authSpy
      });
      const res = await api.get('/test', { retries: { times: 2 } });

      expect(authSpy).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.ok).toBe(true);
    });

    it('retries GET on 500 error', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        .mockResolvedValueOnce(new Response('{"success": true}', { status: 200 }));

      const api = createSafeFetch();
      const res = await api.get('/test', { retries: { times: 2 } });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.ok).toBe(true);
    });

    it('retries POST when retryOn allows it', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        .mockResolvedValueOnce(new Response('{"success": true}', { status: 200 }));

      const api = createSafeFetch();
      const res = await api.post('/test', { data: 'test' }, {
        retries: {
          times: 2,
          retryOn: (ctx: any) => ctx.response?.status === 500
        }
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.ok).toBe(true);
    });

    it('retries in method', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        .mockResolvedValueOnce(new Response('{"success": true}', { status: 200 }));

      const api = createSafeFetch({});
      const res = await api.post('/test', { data: 'test' }, { retries: { times: 2 } });
      console.log('[IndexTest.]', res.response?.status)

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.ok).toBe(true);
    });

    it('respects Retry-After on 429', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('Too Many Requests', {
          status: 429,
          headers: new Headers({ 'Retry-After': '0.001' })
        }))
        .mockResolvedValueOnce(new Response('{"ok": true}', { status: 200 }));

      const api = createSafeFetch();
      const res = await api.get('/rate', { retries: { times: 2, baseDelayMs: 0 } });

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('handles total timeout', async () => {
      mockFetch.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve(new Response('too slow', { status: 200 })), 100);
      }));

      const api = createSafeFetch({ totalTimeoutMs: 10 });
      const res = await api.get('/slow');

      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('TimeoutError');
        expect(res.error.message).toContain('timed out after 10 ms');
      }
    });

    it('retries on successful response when retryOn returns true', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'ready', data: 'result' }), { status: 200 })
        );

      const api = createSafeFetch();
      const res = await api.get<{ status: string; data?: string }>('/task', {
        retries: {
          times: 5,
          baseDelayMs: 0,
          retryOn: ({ data }) => (data as { status: string } | undefined)?.status === 'pending'
        }
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(res.ok).toBe(true);
      if (isSuccess(res)) {
        expect(res.data.status).toBe('ready');
        expect(res.data.data).toBe('result');
      }
    });

    it('retries on 200 based on response body content', async () => {
      const retryOn = jest.fn()
        .mockReturnValueOnce(true)  // First call - retry
        .mockReturnValueOnce(true)  // Second call - retry
        .mockReturnValueOnce(false); // Third call - don't retry

      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ ready: false }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ready: false }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true }), { status: 200 }));

      const api = createSafeFetch();
      const res = await api.get('/poll', {
        retries: {
          times: 5,
          baseDelayMs: 0,
          retryOn
        }
      });

      expect(retryOn).toHaveBeenCalledTimes(3);
      expect(retryOn).toHaveBeenNthCalledWith(1, expect.objectContaining({
        attempt: 1,
        response: expect.any(Response),
        data: { ready: false }
      }));
      expect(retryOn).toHaveBeenNthCalledWith(2, expect.objectContaining({
        attempt: 2,
        data: { ready: false }
      }));
      expect(retryOn).toHaveBeenNthCalledWith(3, expect.objectContaining({
        attempt: 3,
        data: { ready: true }
      }));
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(res.ok).toBe(true);
    });

    it('stops retrying on 200 when max attempts reached', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending' }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending' }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending' }), { status: 200 }));

      const api = createSafeFetch();
      const res = await api.get<{ status: string }>('/task', {
        retries: {
          times: 3,
          baseDelayMs: 0,
          retryOn: ({ data }) => (data as { status: string } | undefined)?.status === 'pending'
        }
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(res.ok).toBe(true);
      if (isSuccess(res)) {
        expect(res.data.status).toBe('pending'); // Returns last response
      }
    });

    it('does not retry on 200 without retryOn function', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
      );

      const api = createSafeFetch();
      const res = await api.get<{ status: string }>('/task', {
        retries: {
          times: 3,
          baseDelayMs: 0
        }
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res.ok).toBe(true);
      if (isSuccess(res)) {
        expect(res.data.status).toBe('pending');
      }
    });

    it('caches only final successful response after retry on 200', async () => {
      const onValue = jest.fn();

      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending' }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ready' }), { status: 200 }));

      const api = createSafeFetch();
      const res1 = await api.get<{ status: string }>('/task', {
        retries: {
          times: 3,
          baseDelayMs: 0,
          retryOn: ({ data }) => (data as { status: string } | undefined)?.status === 'pending'
        },
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res1.ok).toBe(true);
      if (isSuccess(res1)) {
        expect(res1.data.status).toBe('ready');
      }
      expect(onValue).not.toHaveBeenCalled(); // No cache yet

      // Second request - should use cache with final 'ready' status
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'new' }), { status: 200 })
      );

      const res2 = await api.get<{ status: string }>('/task', {
        retries: {
          times: 3,
          baseDelayMs: 0,
          retryOn: ({ data }) => (data as { status: string } | undefined)?.status === 'pending'
        },
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(onValue).toHaveBeenCalledTimes(1);
      expect(onValue).toHaveBeenCalledWith({ status: 'ready' }); // Cached final result
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.status).toBe('new');
      }
    });
  });

  describe('error handling', () => {
    it('normalizes different error types', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const networkRes = await safeFetch.get('/test');
      expect(networkRes.ok).toBe(false);
      if (isError(networkRes)) expect(networkRes.error.name).toBe('NetworkError');

      mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));
      const httpRes = await safeFetch.get('/test');
      expect(httpRes.ok).toBe(false);
      if (isError(httpRes)) expect(httpRes.error.name).toBe('HttpError');
    });

    it('transforms errors with errorMap', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

      const api = createSafeFetch({
        errorMap: (error) => {
          if (error.name === 'HttpError' && (error as any).status === 404) {
            return {
              name: 'HttpError',
              message: 'Custom 404 message: Resource not found',
              status: 404,
              statusText: 'Not Found'
            } as any;
          }
          return error;
        }
      });

      const res = await api.get('/missing');
      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('HttpError');
        expect(res.error.message).toBe('Custom 404 message: Resource not found');
      }
    });

    it('transforms network errors with errorMap', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const api = createSafeFetch({
        errorMap: (error) => {
          if (error.name === 'NetworkError') {
            return {
              name: 'NetworkError',
              message: 'Custom network error: Please check your connection',
              cause: error.cause
            };
          }
          return error;
        }
      });

      const res = await api.get('/test');
      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('NetworkError');
        expect(res.error.message).toBe('Custom network error: Please check your connection');
      }
    });

    it('transforms timeout errors with errorMap', async () => {
      mockFetch.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve(new Response('too slow', { status: 200 })), 100);
      }));

      const api = createSafeFetch({
        totalTimeoutMs: 10,
        errorMap: (error) => {
          if (error.name === 'TimeoutError') {
            return {
              name: 'TimeoutError',
              message: 'Request timeout: Server took too long to respond',
              timeoutMs: (error as any).timeoutMs,
              cause: error.cause
            } as any;
          }
          return error;
        }
      });

      const res = await api.get('/slow');
      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('TimeoutError');
        expect(res.error.message).toBe('Request timeout: Server took too long to respond');
      }
    });

    it('handles errorMap exceptions gracefully', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

      const api = createSafeFetch({
        errorMap: (_error) => {
          throw new Error('errorMap crashed!');
        }
      });

      const res = await api.get('/test');
      expect(res.ok).toBe(false);
      if (isError(res)) {
        // Should return original error when errorMap throws
        expect(res.error.name).toBe('HttpError');
        expect((res.error as any).status).toBe(500);
      }
    });

    it('handles invalid errorMap return value', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

      const api = createSafeFetch({
        errorMap: (_error) => {
          // Return invalid value (not a NormalizedError)
          return { invalid: 'object' } as any;
        }
      });

      const res = await api.get('/test');
      expect(res.ok).toBe(false);
      if (isError(res)) {
        // Should return original error when errorMap returns invalid value
        expect(res.error.name).toBe('HttpError');
        expect((res.error as any).status).toBe(404);
      }
    });

    it('applies errorMap with retries', async () => {
      let callCount = 0;
      mockFetch
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

      const api = createSafeFetch({
        errorMap: (error) => {
          callCount++;
          if (error.name === 'HttpError' && (error as any).status === 500) {
            return {
              name: 'HttpError',
              message: `Custom server error (call ${callCount})`,
              status: 500,
              statusText: 'Internal Server Error'
            } as any;
          }
          return error;
        }
      });

      const res = await api.get('/test', { retries: { times: 2 } });
      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('HttpError');
        // errorMap is called only once with final error result
        expect(res.error.message).toContain('Custom server error');
      }
      expect(callCount).toBeGreaterThanOrEqual(1); // Called at least once
    });

    it('applies errorMap during token refresh', async () => {
      let token = 'old-token';
      const refreshToken = jest.fn().mockRejectedValue(new Error('Refresh failed'));

      mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

      const api = createSafeFetch({
        authentication: () => ({ 'Authorization': `Bearer ${token}` }),
        refreshToken,
        errorMap: (error) => {
          if (error.name === 'HttpError' && (error as any).status === 401) {
            return {
              name: 'HttpError',
              message: 'Authentication failed: Please log in again',
              status: 401,
              statusText: 'Unauthorized'
            } as any;
          }
          return error;
        }
      });

      const res = await api.get('/protected');
      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('HttpError');
        expect(res.error.message).toBe('Authentication failed: Please log in again');
      }
    });

    it('applies errorMap to multiple different error types in sequence', async () => {
      const errorLog: string[] = [];

      const api = createSafeFetch({
        totalTimeoutMs: 10,
        errorMap: (error) => {
          errorLog.push(error.name);
          return {
            ...error,
            message: `Transformed: ${error.message}`
          };
        }
      });

      // Network error
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const res1 = await api.get('/test1');
      expect(res1.ok).toBe(false);
      if (isError(res1)) {
        expect(res1.error.message).toContain('Transformed:');
      }

      // HTTP error
      mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));
      const res2 = await api.get('/test2');
      expect(res2.ok).toBe(false);
      if (isError(res2)) {
        expect(res2.error.message).toContain('Transformed:');
      }

      // Timeout error
      mockFetch.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve(new Response('too slow', { status: 200 })), 100);
      }));
      const res3 = await api.get('/test3');
      expect(res3.ok).toBe(false);
      if (isError(res3)) {
        expect(res3.error.message).toContain('Transformed:');
      }

      expect(errorLog).toEqual(['NetworkError', 'HttpError', 'TimeoutError']);
    });
  });

  describe('token refresh', () => {
    it('refreshes token on 401 and retries request', async () => {
      let token = 'old-token';
      const refreshToken = jest.fn().mockImplementation(async () => {
        token = 'new-token';
      });

      mockFetch
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
        .mockResolvedValueOnce(new Response('{"success": true}', { status: 200 }));

      const api = createSafeFetch({
        authentication: () => ({ 'Authorization': `Bearer ${token}` }),
        refreshToken
      });

      const res = await api.get('/protected');

      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({
        headers: expect.objectContaining({ 'Authorization': 'Bearer old-token' })
      }));
      expect(mockFetch).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
        headers: expect.objectContaining({ 'Authorization': 'Bearer new-token' })
      }));
      expect(res.ok).toBe(true);
    });

    it('calls refreshToken only once for concurrent requests', async () => {
      let token = 'old-token';
      const refreshToken = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        token = 'new-token';
      });

      mockFetch
        .mockResolvedValueOnce(new Response('{"data": 1}', { status: 200 }))
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
        .mockResolvedValueOnce(new Response('{"data": 2}', { status: 200 }))
        .mockResolvedValueOnce(new Response('{"data": 3}', { status: 200 }));

      const api = createSafeFetch({
        authentication: () => ({ 'Authorization': `Bearer ${token}` }),
        refreshToken
      });

      const [res1, res2, res3] = await Promise.all([
        api.get('/endpoint1'),
        api.get('/endpoint2'),
        api.get('/endpoint3')
      ]);

      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(5);
      expect(res1.ok).toBe(true);
      expect(res2.ok).toBe(true);
      expect(res3.ok).toBe(true);
      if (res1.ok && res2.ok && res3.ok) {
        expect(res1.data).toEqual({ data: 1 });
        expect(res2.data).toEqual({ data: 2 });
        expect(res3.data).toEqual({ data: 3 });
      }
    });

    it('uses custom shouldRefreshToken function', async () => {
      let token = 'old-token';
      const refreshToken = jest.fn().mockImplementation(async () => {
        token = 'new-token';
      });

      mockFetch
        .mockResolvedValueOnce(new Response('Token expired', { status: 403 }))
        .mockResolvedValueOnce(new Response('{"success": true}', { status: 200 }));

      const api = createSafeFetch({
        authentication: () => ({ 'Authorization': `Bearer ${token}` }),
        refreshToken,
        shouldRefreshToken: (res) => res.status === 403
      });

      const res = await api.get('/protected');

      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.ok).toBe(true);
    });

    it('shouldRefreshToken skips auth endpoints', async () => {
      const refreshToken = jest.fn().mockImplementation(async () => {});

      mockFetch.mockImplementationOnce((url) => {
        return Promise.resolve(
          Object.assign(new Response('Unauthorized', { status: 401 }), { url })
        );
      });

      const api = createSafeFetch({
        baseURL: 'https://api.example.com',
        authentication: () => ({ 'Authorization': 'Bearer token' }),
        refreshToken,
        shouldRefreshToken: (res) => {
          const url = res.url;
          return res.status === 401 && !url.includes('/auth/code/');
        }
      });

      const res = await api.get('/auth/code/verify');

      expect(refreshToken).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.name).toBe('HttpError');
        expect((res.error as any).status).toBe(401);
      }
    });

    it('does not retry after failed token refresh', async () => {
      const refreshToken = jest.fn().mockRejectedValue(new Error('Refresh failed'));

      mockFetch
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

      const api = createSafeFetch({
        authentication: () => ({ 'Authorization': 'Bearer token' }),
        refreshToken
      });

      const res = await api.get('/protected');

      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.name).toBe('HttpError');
        expect((res.error as any).status).toBe(401);
      }
    });
  });

  describe('validation', () => {

    it('caches with stale-while-revalidate', async () => {
      const onValue = jest.fn();

      // First request - creates cache
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'fresh-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const api = createSafeFetch();
      const res1 = await api.get<{ data: string }>('/users', {
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(onValue).not.toHaveBeenCalled(); // No cache yet
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res1.ok).toBe(true);
      if (isSuccess(res1)) {
        expect(res1.data.data).toBe('fresh-1');
      }

      // Second request - uses cache + revalidation
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'fresh-2' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res2 = await api.get<{ data: string }>('/users', {
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(onValue).toHaveBeenCalledTimes(1); // Called with cached data
      expect(onValue).toHaveBeenCalledWith({ data: 'fresh-1' }); // Old data from cache
      expect(mockFetch).toHaveBeenCalledTimes(2); // New request made
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('fresh-2'); // But returns fresh data
      }

      // Third request - uses updated cache again
      onValue.mockClear();
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'fresh-3' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res3 = await api.get<{ data: string }>('/users', {
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(onValue).toHaveBeenCalledTimes(1);
      expect(onValue).toHaveBeenCalledWith({ data: 'fresh-2' }); // Data from previous request
      expect(res3.ok).toBe(true);
      if (isSuccess(res3)) {
        expect(res3.data.data).toBe('fresh-3'); // New fresh data
      }
    });

    it('does not use expired cache', async () => {
      jest.useFakeTimers();
      const onValue = jest.fn();

      // First request - creates cache
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'old-data' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const api = createSafeFetch();
      const res1 = await api.get<{ data: string }>('/users', {
        cached: {
          cacheTime: 1000, // 1 second
          onValue
        }
      });

      expect(res1.ok).toBe(true);
      if (isSuccess(res1)) {
        expect(res1.data.data).toBe('old-data');
      }
      expect(onValue).not.toHaveBeenCalled();

      // 2 seconds passed - cache expired
      jest.advanceTimersByTime(2000);

      // Second request - cache expired, should get only fresh data
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'new-data' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res2 = await api.get<{ data: string }>('/users', {
        cached: {
          cacheTime: 1000,
          onValue
        }
      });

      expect(onValue).not.toHaveBeenCalled(); // Cache expired, onValue not called
      expect(mockFetch).toHaveBeenCalledTimes(2); // New request made
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('new-data'); // Only fresh data
      }

      jest.useRealTimers();
    });

    it('does not cache without cached option', async () => {
      // First request
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'first' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const api = createSafeFetch();
      const res1 = await api.get<{ data: string }>('/users');

      expect(res1.ok).toBe(true);
      if (isSuccess(res1)) {
        expect(res1.data.data).toBe('first');
      }
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request - should make new fetch, not use cache
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'second' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res2 = await api.get<{ data: string }>('/users');

      expect(mockFetch).toHaveBeenCalledTimes(2); // New request, cache not used
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('second'); // New data from server
      }
    });

    it('caches only successful result after retry', async () => {
      const onValue = jest.fn();

      // First request - 500 error, then success
      mockFetch
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: 'success-after-retry' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );

      const api = createSafeFetch();
      const res1 = await api.get<{ data: string }>('/users', {
        retries: { times: 2 },
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(mockFetch).toHaveBeenCalledTimes(2); // First attempt + retry
      expect(res1.ok).toBe(true);
      if (isSuccess(res1)) {
        expect(res1.data.data).toBe('success-after-retry');
      }
      expect(onValue).not.toHaveBeenCalled(); // No cache yet

      // Second request - should use cache of successful result
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'fresh' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res2 = await api.get<{ data: string }>('/users', {
        retries: { times: 2 },
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(onValue).toHaveBeenCalledTimes(1);
      expect(onValue).toHaveBeenCalledWith({ data: 'success-after-retry' }); // Cache of successful result
      expect(mockFetch).toHaveBeenCalledTimes(3); // One more request
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('fresh'); // Fresh data
      }
    });

    it('updates cache after token refresh', async () => {
      let token = 'old-token';
      const onValue = jest.fn();
      const refreshToken = jest.fn().mockImplementation(async () => {
        token = 'new-token';
      });

      // First request - successful
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'initial' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const api = createSafeFetch({
        authentication: () => ({ 'Authorization': `Bearer ${token}` }),
        refreshToken
      });

      const res1 = await api.get<{ data: string }>('/protected', {
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(res1.ok).toBe(true);
      if (isSuccess(res1)) {
        expect(res1.data.data).toBe('initial');
      }
      expect(onValue).not.toHaveBeenCalled(); // First request - no cache

      // Second request - 401, token refresh, then success
      mockFetch
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: 'after-refresh' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );

      const res2 = await api.get<{ data: string }>('/protected', {
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(onValue).toHaveBeenCalledTimes(1);
      expect(onValue).toHaveBeenCalledWith({ data: 'initial' }); // Old cache shown
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('after-refresh'); // New data after refresh
      }

      // Third request - should use updated cache
      onValue.mockClear();
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'latest' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res3 = await api.get<{ data: string }>('/protected', {
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(onValue).toHaveBeenCalledTimes(1);
      expect(onValue).toHaveBeenCalledWith({ data: 'after-refresh' }); // Cache updated
      expect(res3.ok).toBe(true);
      if (isSuccess(res3)) {
        expect(res3.data.data).toBe('latest');
      }
    });

    it('does not cache failed requests', async () => {
      const onValue = jest.fn();

      // First request - 500 error, retry also fails
      mockFetch
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

      const api = createSafeFetch();
      const res1 = await api.get<{ data: string }>('/users', {
        retries: { times: 2 },
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res1.ok).toBe(false);
      expect(onValue).not.toHaveBeenCalled(); // Error not cached

      // Second request - should make new request (error was not cached)
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res2 = await api.get<{ data: string }>('/users', {
        retries: { times: 2 },
        cached: {
          cacheTime: 5000,
          onValue
        }
      });

      expect(onValue).not.toHaveBeenCalled(); // No cache (error not saved)
      expect(mockFetch).toHaveBeenCalledTimes(3); // New request
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('success');
      }
    });

    it('is should long pool', async () => {
      jest.useFakeTimers();
      const onUpdated = jest.fn();

      // First request
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'initial' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const api = createSafeFetch();
      const controller = new AbortController();

      const resultPromise = api.get<{ data: string }>('/users', {
        longPooling: {
          abort: controller.signal,
          interval: 500,
          onUpdated
        }
      });

      // First request should complete immediately
      const res = await resultPromise;
      expect(res.ok).toBe(true);
      if (isSuccess(res)) {
        expect(res.data.data).toBe('initial');
      }
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(onUpdated).not.toHaveBeenCalled(); // Not called yet

      // Setup second polling request
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'poll-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      // Advance time to trigger first poll
      await jest.advanceTimersByTimeAsync(500);

      expect(onUpdated).toHaveBeenCalledTimes(1);
      expect(onUpdated).toHaveBeenNthCalledWith(1, { data: 'poll-1' });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Setup third polling request
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'poll-2' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      // Advance time to trigger second poll
      await jest.advanceTimersByTimeAsync(500);

      expect(onUpdated).toHaveBeenCalledTimes(2);
      expect(onUpdated).toHaveBeenNthCalledWith(2, { data: 'poll-2' });
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Stop polling
      controller.abort();
      jest.useRealTimers();
    });

    it('refreshes token during long polling when 401 occurs', async () => {
      jest.useFakeTimers();
      let token = 'old-token';
      const onUpdated = jest.fn();
      const refreshToken = jest.fn().mockImplementation(async () => {
        token = 'new-token';
      });

      // First request - successful
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'initial' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const api = createSafeFetch({
        authentication: () => ({ 'Authorization': `Bearer ${token}` }),
        refreshToken
      });
      const controller = new AbortController();

      const resultPromise = api.get<{ data: string }>('/protected', {
        longPooling: {
          abort: controller.signal,
          interval: 500,
          onUpdated
        }
      });

      // First request completes
      const res = await resultPromise;
      expect(res.ok).toBe(true);
      if (isSuccess(res)) {
        expect(res.data.data).toBe('initial');
      }
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(refreshToken).not.toHaveBeenCalled();

      // First poll - token expired (401), then refresh, then success
      mockFetch
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: 'after-refresh' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );

      // Advance time to trigger first poll
      await jest.advanceTimersByTimeAsync(500);

      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(onUpdated).toHaveBeenCalledTimes(1);
      expect(onUpdated).toHaveBeenNthCalledWith(1, { data: 'after-refresh' });
      expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 401 + retry with new token

      // Second poll - successful with new token
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'poll-2' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      // Advance time to trigger second poll
      await jest.advanceTimersByTimeAsync(500);

      expect(onUpdated).toHaveBeenCalledTimes(2);
      expect(onUpdated).toHaveBeenNthCalledWith(2, { data: 'poll-2' });
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(refreshToken).toHaveBeenCalledTimes(1); // Still only once

      // Stop polling
      controller.abort();
      jest.useRealTimers();
    });

    it('stops long polling when aborted', async () => {
      jest.useFakeTimers();
      const onUpdated = jest.fn();

      // First request
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'initial' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const api = createSafeFetch();
      const controller = new AbortController();

      const resultPromise = api.get<{ data: string }>('/users', {
        longPooling: {
          abort: controller.signal,
          interval: 500,
          onUpdated
        }
      });

      // First request completes
      const res = await resultPromise;
      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Setup first polling request
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'poll-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      // Advance time to trigger first poll
      await jest.advanceTimersByTimeAsync(500);

      expect(onUpdated).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Abort polling
      controller.abort();

      // Advance time - should NOT trigger more polls
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(500);

      // No more calls should have been made
      expect(onUpdated).toHaveBeenCalledTimes(1); // Still 1
      expect(mockFetch).toHaveBeenCalledTimes(2); // Still 2

      jest.useRealTimers();
    });
  });
});
