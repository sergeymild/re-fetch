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

    it('transforms validation errors with errorMap', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"invalid": true}', { status: 200 })
      );

      const validate = (data: any) => {
        if (data && typeof data.id === 'number') {
          return { success: true as const, data };
        }
        return { success: false as const, error: new Error('Missing id field') };
      };

      const api = createSafeFetch({
        errorMap: (error) => {
          if (error.name === 'ValidationError') {
            return {
              name: 'ValidationError',
              message: 'Data validation failed: Invalid response format',
              cause: error.cause
            };
          }
          return error;
        }
      });

      const res = await api.get('/user', { validate });
      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('ValidationError');
        expect(res.error.message).toBe('Data validation failed: Invalid response format');
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
    it('validates response with success', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"id": 1, "name": "test"}', { status: 200 })
      );

      const validate = (data: any) => {
        if (data && typeof data.id === 'number' && typeof data.name === 'string') {
          return { success: true as const, data };
        }
        return { success: false as const, error: new Error('Invalid data') };
      };

      const res = await safeFetch.get('/user', { validate });
      expect(res.ok).toBe(true);
      if (isSuccess(res)) {
        expect(res.data.id).toBe(1);
        expect(res.data.name).toBe('test');
      }
    });

    it('validates response with failure', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"invalid": true}', { status: 200 })
      );

      const validate = (data: any) => {
        if (data && typeof data.id === 'number') {
          return { success: true as const, data };
        }
        return { success: false as const, error: new Error('Missing id field') };
      };

      const res = await safeFetch.get('/user', { validate });
      expect(res.ok).toBe(false);
      if (isError(res)) {
        expect(res.error.name).toBe('ValidationError');
        expect(res.error.message).toBe('Validation failed');
      }
    });

    it('caches with stale-while-revalidate', async () => {
      const onValue = jest.fn();

      // Первый запрос - создается кеш
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

      expect(onValue).not.toHaveBeenCalled(); // Кеша еще нет
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res1.ok).toBe(true);
      if (isSuccess(res1)) {
        expect(res1.data.data).toBe('fresh-1');
      }

      // Второй запрос - используется кеш + ревалидация
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

      expect(onValue).toHaveBeenCalledTimes(1); // Вызван с кешированными данными
      expect(onValue).toHaveBeenCalledWith({ data: 'fresh-1' }); // Старые данные из кеша
      expect(mockFetch).toHaveBeenCalledTimes(2); // Сделан новый запрос
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('fresh-2'); // Но возвращены свежие данные
      }

      // Третий запрос - снова используется обновленный кеш
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
      expect(onValue).toHaveBeenCalledWith({ data: 'fresh-2' }); // Данные из предыдущего запроса
      expect(res3.ok).toBe(true);
      if (isSuccess(res3)) {
        expect(res3.data.data).toBe('fresh-3'); // Новые свежие данные
      }
    });

    it('does not use expired cache', async () => {
      jest.useFakeTimers();
      const onValue = jest.fn();

      // Первый запрос - создается кеш
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'old-data' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const api = createSafeFetch();
      const res1 = await api.get<{ data: string }>('/users', {
        cached: {
          cacheTime: 1000, // 1 секунда
          onValue
        }
      });

      expect(res1.ok).toBe(true);
      if (isSuccess(res1)) {
        expect(res1.data.data).toBe('old-data');
      }
      expect(onValue).not.toHaveBeenCalled();

      // Прошло 2 секунды - кеш протух
      jest.advanceTimersByTime(2000);

      // Второй запрос - кеш протух, должны получить только свежие данные
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

      expect(onValue).not.toHaveBeenCalled(); // Кеш протух, onValue не вызывается
      expect(mockFetch).toHaveBeenCalledTimes(2); // Сделан новый запрос
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('new-data'); // Только свежие данные
      }

      jest.useRealTimers();
    });

    it('does not cache without cached option', async () => {
      // Первый запрос
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

      // Второй запрос - должен сделать новый fetch, не использовать кеш
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'second' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res2 = await api.get<{ data: string }>('/users');

      expect(mockFetch).toHaveBeenCalledTimes(2); // Новый запрос, кеш не используется
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('second'); // Новые данные с сервера
      }
    });

    it('caches only successful result after retry', async () => {
      const onValue = jest.fn();

      // Первый запрос - ошибка 500, затем успех
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

      expect(mockFetch).toHaveBeenCalledTimes(2); // Первая попытка + retry
      expect(res1.ok).toBe(true);
      if (isSuccess(res1)) {
        expect(res1.data.data).toBe('success-after-retry');
      }
      expect(onValue).not.toHaveBeenCalled(); // Кеша еще нет

      // Второй запрос - должен использовать кеш успешного результата
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
      expect(onValue).toHaveBeenCalledWith({ data: 'success-after-retry' }); // Кеш успешного результата
      expect(mockFetch).toHaveBeenCalledTimes(3); // Еще один запрос
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('fresh'); // Свежие данные
      }
    });

    it('updates cache after token refresh', async () => {
      let token = 'old-token';
      const onValue = jest.fn();
      const refreshToken = jest.fn().mockImplementation(async () => {
        token = 'new-token';
      });

      // Первый запрос - успешен
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
      expect(onValue).not.toHaveBeenCalled(); // Первый запрос - нет кеша

      // Второй запрос - 401, refresh токена, затем успех
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
      expect(onValue).toHaveBeenCalledWith({ data: 'initial' }); // Старый кеш показан
      expect(res2.ok).toBe(true);
      if (isSuccess(res2)) {
        expect(res2.data.data).toBe('after-refresh'); // Новые данные после refresh
      }

      // Третий запрос - должен использовать обновленный кеш
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
      expect(onValue).toHaveBeenCalledWith({ data: 'after-refresh' }); // Кеш обновлен
      expect(res3.ok).toBe(true);
      if (isSuccess(res3)) {
        expect(res3.data.data).toBe('latest');
      }
    });

    it('does not cache failed requests', async () => {
      const onValue = jest.fn();

      // Первый запрос - ошибка 500, retry тоже ошибка
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
      expect(onValue).not.toHaveBeenCalled(); // Ошибка не кешируется

      // Второй запрос - должен сделать новый запрос (ошибка не была закеширована)
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

      expect(onValue).not.toHaveBeenCalled(); // Кеша не было (ошибка не сохранилась)
      expect(mockFetch).toHaveBeenCalledTimes(3); // Новый запрос
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
