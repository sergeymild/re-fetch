# re-fetch

Type-safe fetch wrapper with retries, timeouts, caching, and comprehensive error handling. Works seamlessly in browser, Node.js, and React Native.

## Features

- ✅ **Type-safe** - Full TypeScript support with generics
- 🔄 **Auto-retry** - Configurable retry strategies with exponential backoff
- ⏱️ **Timeouts** - Per-request and total timeouts
- 💾 **Caching** - Built-in request caching with TTL
- 🔐 **Authentication** - Token refresh handling
- 🎯 **Validation** - Response validation with custom validators
- 📱 **React Native** - No browser dependencies (no `window` usage)
- 🛡️ **Error handling** - Normalized error types (HttpError, NetworkError, TimeoutError, ValidationError)
- 🔌 **Interceptors** - Request/response/error interceptors

## Installation

```bash
npm install re-fetch
```

## Quick Start

```typescript
import { createSafeFetch } from 're-fetch';

// Create a client
const api = createSafeFetch({
  baseURL: 'https://api.example.com',
  headers: { 'Content-Type': 'application/json' },
  timeoutMs: 5000,
});

// Make requests
const result = await api.get('/users');

if (result.ok) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

## Usage Examples

### Basic GET Request

```typescript
const result = await api.get<User[]>('/users');

if (result.ok) {
  const users = result.data; // Type: User[]
} else {
  const error = result.error; // Normalized error
}
```

### POST Request with Body

```typescript
const result = await api.post('/users', {
  name: 'John',
  email: 'john@example.com'
});
```

### Retry Strategy

```typescript
const api = createSafeFetch({
  baseURL: 'https://api.example.com'
});

const result = await api.get('/data', {
  retries: {
    times: 3,
    baseDelayMs: 300,
    maxDelayMs: 2000,
  }
});
```

### Custom Retry Conditions

```typescript
const result = await api.get('/data', {
  retries: {
    times: 3,
    retryOn: ({ attempt, error, response }) => {
      // Retry only on 503 or network errors
      return error?.name === 'NetworkError' || response?.status === 503;
    }
  }
});
```

### Authentication with Token Refresh

```typescript
const api = createSafeFetch({
  baseURL: 'https://api.example.com',
  authentication: async () => ({
    'Authorization': `Bearer ${getAccessToken()}`
  }),
  refreshToken: async () => {
    const newToken = await refreshAccessToken();
    setAccessToken(newToken);
  },
  shouldRefreshToken: (response) => response.status === 401
});
```

### Response Validation

```typescript
const result = await api.get('/user', {
  validate: (data) => {
    if (data && typeof data === 'object' && 'id' in data) {
      return { success: true, data: data as User };
    }
    return { success: false, error: new Error('Invalid user data') };
  }
});
```

### Caching

```typescript
const [cachedData, setCachedData] = useState<User | undefined>();

const result = await api.get<User>('/user', {
  cached: {
    cacheTime: 60000, // Cache for 60 seconds
    onValue: (value) => {
      if (value) setCachedData(value);
    }
  }
});
```

### Interceptors

```typescript
const api = createSafeFetch({
  baseURL: 'https://api.example.com',
  interceptors: {
    onRequest: (url, init) => {
      console.log('Request:', url);
    },
    onResponse: (response) => {
      console.log('Response:', response.status);
    },
    onError: (error) => {
      console.error('Error:', error.message);
    }
  }
});
```

### Timeouts

```typescript
const result = await api.get('/slow-endpoint', {
  timeoutMs: 5000,        // Per-attempt timeout
  totalTimeoutMs: 15000   // Total timeout including retries
});
```

### Error Mapping

```typescript
const api = createSafeFetch({
  baseURL: 'https://api.example.com',
  errorMap: (error) => {
    if (error.name === 'HttpError' && error.status === 404) {
      return {
        ...error,
        message: 'Resource not found. Please check the URL.'
      };
    }
    return error;
  }
});
```

## Error Types

All errors are normalized into these types:

```typescript
type NormalizedError =
  | NetworkError      // Network failures
  | TimeoutError      // Request timeouts
  | HttpError         // HTTP errors (4xx, 5xx)
  | ValidationError;  // Validation failures
```

### Error Properties

```typescript
// NetworkError
{ name: 'NetworkError', message: string, cause?: unknown }

// TimeoutError
{ name: 'TimeoutError', message: string, timeoutMs: number, cause?: unknown }

// HttpError
{ name: 'HttpError', message: string, status: number, statusText: string, body?: unknown }

// ValidationError
{ name: 'ValidationError', message: string, cause?: unknown }
```

## API Reference

### `createSafeFetch(config?)`

Creates a new fetch client instance.

**Config Options:**
- `baseURL?: string` - Base URL for all requests
- `headers?: Record<string, string>` - Default headers
- `query?: Record<string, string | number | boolean | undefined>` - Default query params
- `timeoutMs?: number` - Default timeout per attempt
- `totalTimeoutMs?: number` - Default total timeout
- `parseAs?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'response'` - Default response parser
- `errorMap?: (error: NormalizedError) => NormalizedError` - Error mapper
- `interceptors?: Interceptors` - Request/response/error interceptors
- `authentication?: () => Record<string, string> | Promise<Record<string, string>>` - Auth headers provider
- `refreshToken?: () => Promise<void>` - Token refresh handler
- `shouldRefreshToken?: (response: Response) => boolean` - Refresh condition

### Request Methods

All methods return `Promise<SafeResult<T>>`:

```typescript
api<T>(url, init?): Promise<SafeResult<T>>
api.get<T>(url, init?): Promise<SafeResult<T>>
api.post<T>(url, body?, init?): Promise<SafeResult<T>>
api.put<T>(url, body?, init?): Promise<SafeResult<T>>
api.patch<T>(url, body?, init?): Promise<SafeResult<T>>
api.delete<T>(url, init?): Promise<SafeResult<T>>
```

### `unwrap(promise)`

Unwraps a SafeResult, throwing the error if not ok:

```typescript
import { unwrap } from 're-fetch';

try {
  const data = await unwrap(api.get('/users'));
  console.log(data);
} catch (error) {
  console.error(error);
}
```

## License

MIT
