import {
  httpError,
  networkError,
  timeoutError,
  isHttpError,
  isNetworkError,
  isTimeoutError,
  toTypedHttpError,
  asHttpError,
  isNormalizedError
} from '../errors';

describe('Error guards and utilities', () => {
  describe('isNormalizedError', () => {
    it('returns true for valid normalized errors', () => {
      const error = { name: 'HttpError', message: 'Test error' };
      expect(isNormalizedError(error)).toBe(true);
    });

    it('returns false for invalid objects', () => {
      expect(isNormalizedError(null)).toBe(false);
      expect(isNormalizedError(undefined)).toBe(false);
      expect(isNormalizedError('error')).toBe(false);
      expect(isNormalizedError({})).toBe(false);
      expect(isNormalizedError({ name: 'Test' })).toBe(false);
      expect(isNormalizedError({ message: 'Test' })).toBe(false);
    });
  });

  describe('Type guards', () => {
    it('isHttpError identifies HttpError', () => {
      const mockResponse = new Response('Not found', { status: 404 });
      const error = httpError(mockResponse, { message: 'Resource not found' });

      expect(isHttpError(error)).toBe(true);
      expect(isNetworkError(error)).toBe(false);
      expect(isTimeoutError(error)).toBe(false);
    });

    it('isNetworkError identifies NetworkError', () => {
      const error = networkError(new Error('Connection failed'));

      expect(isNetworkError(error)).toBe(true);
      expect(isHttpError(error)).toBe(false);
      expect(isTimeoutError(error)).toBe(false);
    });

    it('isTimeoutError identifies TimeoutError', () => {
      const error = timeoutError(5000);

      expect(isTimeoutError(error)).toBe(true);
      expect(isHttpError(error)).toBe(false);
      expect(isNetworkError(error)).toBe(false);
    });
  });

  describe('toTypedHttpError', () => {
    it('returns typed HttpError with specific body type', () => {
      interface ValidationError {
        phone: string[];
        email: string[];
      }

      const mockResponse = new Response(
        JSON.stringify({
          phone: ['Phone is required', 'Invalid format'],
          email: ['Email is invalid']
        }),
        { status: 400 }
      );

      const error = httpError(mockResponse, {
        phone: ['Phone is required', 'Invalid format'],
        email: ['Email is invalid']
      });

      const typed = toTypedHttpError<ValidationError>(error);

      expect(typed).not.toBeNull();
      if (typed) {
        expect(typed.name).toBe('HttpError');
        expect(typed.status).toBe(400);
        expect(typed.body.phone).toEqual(['Phone is required', 'Invalid format']);
        expect(typed.body.email).toEqual(['Email is invalid']);

        // TypeScript should recognize the type
        const phoneErrors: string[] = typed.body.phone;
        expect(phoneErrors).toHaveLength(2);
      }
    });

    it('returns null for non-HttpError', () => {
      const error = networkError(new Error('Network failed'));
      const typed = toTypedHttpError(error);

      expect(typed).toBeNull();
    });

    it('works with nested error structures', () => {
      interface ApiError {
        error: {
          code: string;
          message: string;
          details: {
            field: string;
            reason: string;
          }[];
        };
      }

      const mockResponse = new Response('', { status: 422 });
      const error = httpError(mockResponse, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            { field: 'username', reason: 'Too short' },
            { field: 'password', reason: 'Too weak' }
          ]
        }
      });

      const typed = toTypedHttpError<ApiError>(error);

      expect(typed).not.toBeNull();
      if (typed) {
        expect(typed.body.error.code).toBe('VALIDATION_ERROR');
        expect(typed.body.error.details).toHaveLength(2);
        expect(typed.body.error.details[0].field).toBe('username');
      }
    });
  });

  describe('asHttpError', () => {
    it('returns typed HttpError when error is HttpError', () => {
      interface ErrorBody {
        message: string;
        code: number;
      }

      const mockResponse = new Response('', { status: 500 });
      const error = httpError(mockResponse, {
        message: 'Internal server error',
        code: 500
      });

      const typed = asHttpError<ErrorBody>(error);

      expect(typed.name).toBe('HttpError');
      expect(typed.body.message).toBe('Internal server error');
      expect(typed.body.code).toBe(500);
    });

    it('throws when error is not HttpError', () => {
      const error = networkError(new Error('Network failed'));

      expect(() => {
        asHttpError(error);
      }).toThrow('Expected HttpError but got NetworkError');
    });

    it('throws when error is TimeoutError', () => {
      const error = timeoutError(5000);

      expect(() => {
        asHttpError(error);
      }).toThrow('Expected HttpError but got TimeoutError');
    });
  });

  describe('Real-world usage examples', () => {
    it('handles validation errors with typed body', () => {
      interface FormValidationError {
        errors: Record<string, string[]>;
      }

      const mockResponse = new Response('', { status: 422 });
      const error = httpError(mockResponse, {
        errors: {
          email: ['Email is required', 'Email format is invalid'],
          password: ['Password must be at least 8 characters']
        }
      });

      const typed = toTypedHttpError<FormValidationError>(error);

      if (typed) {
        // Can safely access typed fields
        const emailErrors = typed.body.errors.email;
        expect(emailErrors).toContain('Email is required');

        const passwordErrors = typed.body.errors.password;
        expect(passwordErrors).toContain('Password must be at least 8 characters');
      }
    });

    it('handles API error responses with status-specific handling', () => {
      interface ApiErrorResponse {
        error: string;
        message: string;
        statusCode: number;
      }

      const mockResponse404 = new Response('', { status: 404 });
      const error404 = httpError(mockResponse404, {
        error: 'Not Found',
        message: 'User not found',
        statusCode: 404
      });

      const typed = toTypedHttpError<ApiErrorResponse>(error404);

      if (typed && typed.status === 404) {
        expect(typed.body.error).toBe('Not Found');
        expect(typed.body.message).toBe('User not found');
      }
    });

    it('uses type narrowing in error handling', () => {
      const mockResponse = new Response('', { status: 400 });
      const httpErr = httpError(mockResponse, { field: 'username', issue: 'too short' });
      const netErr = networkError(new Error('Failed'));

      // Type narrowing with guard
      if (isHttpError(httpErr)) {
        expect(httpErr.status).toBe(400);
        expect(httpErr.body).toEqual({ field: 'username', issue: 'too short' });
      }

      if (isNetworkError(netErr)) {
        expect(netErr.message).toBe('Network request failed');
      }
    });
  });
});