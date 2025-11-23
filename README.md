# re-fetch

Type-safe fetch wrapper with retries, timeouts, caching, and comprehensive error handling. Works seamlessly in browser, Node.js, and React Native.

## Features

- ✅ **Type-safe** - Full TypeScript support with generics
- 🔄 **Auto-retry** - Configurable retry strategies with exponential backoff
- ⏱️ **Timeouts** - Per-request and total timeouts
- 💾 **Caching** - Built-in request caching with TTL and stale-while-revalidate
- 🔄 **Long Polling** - Built-in support for long polling with automatic token refresh
- 🔐 **Authentication** - Token refresh handling with concurrent request deduplication
- 🎯 **Typed Errors** - Type-safe error handling with typed HTTP error bodies
- 📱 **React Native** - No browser dependencies (no `window` usage)
- 🛡️ **Error handling** - Normalized error types (HttpError, NetworkError, TimeoutError)
- 🔌 **Interceptors** - Request/response/error interceptors
- 🗺️ **Error Mapping** - Transform errors globally with errorMap

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

### Long Polling

Built-in support for long polling with automatic cache bypass and token refresh:

```typescript
const controller = new AbortController();

// Poll for updates every 5 seconds
const result = await api.get<Data>('/status', {
  longPooling: {
    abort: controller.signal,
    interval: 5000, // Poll every 5 seconds
    onUpdated: (data) => {
      console.log('Updated data:', data);
      // Update your UI here
    }
  }
});

// First result is returned immediately
if (result.ok) {
  console.log('Initial data:', result.data);
}

// Stop polling when done
setTimeout(() => controller.abort(), 60000);
```

**Features:**
- ✅ First request returns immediately with cached data (if available)
- ✅ Subsequent polls bypass cache for fresh data
- ✅ Automatic token refresh on 401 errors
- ✅ Clean cancellation with AbortController

### Typed Error Handling

Type-safe error body handling with generic type guards:

```typescript
import { toTypedHttpError, isHttpError } from 're-fetch';

interface ValidationError {
  errors: {
    email: string[];
    password: string[];
  };
}

const result = await api.post('/register', userData);

if (!result.ok) {
  // Type-safe error body access
  const validationError = toTypedHttpError<ValidationError>(result.error);

  if (validationError && validationError.status === 422) {
    // TypeScript knows the exact type of body
    console.log('Email errors:', validationError.body.errors.email);
    console.log('Password errors:', validationError.body.errors.password);
  }
}
```

**Available Guards:**
- `isHttpError(error)` - Check if error is HttpError
- `isNetworkError(error)` - Check if error is NetworkError
- `isTimeoutError(error)` - Check if error is TimeoutError
- `toTypedHttpError<T>(error)` - Safe cast to HttpError with typed body
- `asHttpError<T>(error)` - Assert cast to HttpError (throws if not)

## Error Types

All errors are normalized into these types:

```typescript
type NormalizedError =
  | NetworkError      // Network failures
  | TimeoutError      // Request timeouts
  | HttpError         // HTTP errors (4xx, 5xx)
```

### Error Properties

```typescript
// NetworkError
{ name: 'NetworkError', message: string, cause?: unknown }

// TimeoutError
{ name: 'TimeoutError', message: string, timeoutMs: number, cause?: unknown }

// HttpError
{ name: 'HttpError', message: string, status: number, statusText: string, body?: unknown }

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

**Request Options:**
- `method?: HttpMethod` - HTTP method
- `body?: BodyInit | object` - Request body
- `headers?: Record<string, string>` - Request headers
- `query?: Record<string, string | number | boolean>` - Query parameters
- `parseAs?: ParseAs` - Response parser
- `timeoutMs?: number` - Per-attempt timeout
- `totalTimeoutMs?: number` - Total timeout including retries
- `retries?: RetryStrategy` - Retry configuration
- `cached?: CacheConfig` - Cache configuration
- `longPooling?: LongPollingConfig` - Long polling configuration
- Plus all standard `RequestInit` options

**Long Polling Config:**
```typescript
{
  abort: AbortSignal;      // Signal to stop polling
  interval: number;        // Poll interval in milliseconds
  onUpdated: (data: T) => void;  // Callback for updates
}
```

**Cache Config:**
```typescript
{
  cacheTime?: number;      // Cache duration in milliseconds
  onValue?: (data: T) => void;   // Callback when cache is hit
}
```

## License

MIT
