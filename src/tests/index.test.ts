import { createSafeFetch, safeFetch } from '../re-fetch';
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
  });
});
