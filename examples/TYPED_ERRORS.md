# Typed Error Handling

`re-fetch` предоставляет мощные утилиты для типобезопасной обработки ошибок.

## Функции

### Type Guards

#### `isHttpError(error: NormalizedError): error is HttpError`
Проверяет, является ли ошибка HTTP ошибкой.

```typescript
if (isHttpError(result.error)) {
  console.log('Status:', result.error.status);
}
```

#### `isNetworkError(error: NormalizedError): error is NetworkError`
Проверяет, является ли ошибка сетевой ошибкой.

```typescript
if (isNetworkError(result.error)) {
  console.log('Network failed:', result.error.message);
}
```

#### `isTimeoutError(error: NormalizedError): error is TimeoutError`
Проверяет, является ли ошибка таймаутом.

```typescript
if (isTimeoutError(result.error)) {
  console.log('Timeout after:', result.error.timeoutMs, 'ms');
}
```

### Typed Error Casting

#### `toTypedHttpError<TBody>(error: NormalizedError): HttpError & { body: TBody } | null`
Безопасно приводит ошибку к типизированной HTTP ошибке с конкретным типом body.
Возвращает `null` если ошибка не является `HttpError`.

```typescript
interface ValidationError {
  errors: {
    email: string[];
    password: string[];
  };
}

const result = await api.post('/register', userData);

if (!result.ok) {
  const typed = toTypedHttpError<ValidationError>(result.error);

  if (typed) {
    // typed.body теперь типизирован как ValidationError
    console.log('Email errors:', typed.body.errors.email);
    console.log('Password errors:', typed.body.errors.password);
  }
}
```

#### `asHttpError<TBody>(error: NormalizedError): HttpError & { body: TBody }`
Уверенно приводит ошибку к типизированной HTTP ошибке.
**Выбрасывает исключение** если ошибка не является `HttpError`.

```typescript
interface ApiError {
  code: string;
  message: string;
}

const result = await api.get('/data');

if (!result.ok && isHttpError(result.error)) {
  try {
    const typed = asHttpError<ApiError>(result.error);
    console.log('Error code:', typed.body.code);
    console.log('Error message:', typed.body.message);
  } catch (e) {
    console.error('Not an HttpError:', e);
  }
}
```

## Примеры использования

### Пример 1: Обработка ошибок валидации

```typescript
import { createSafeFetch, toTypedHttpError } from 're-fetch';

interface FormValidationError {
  errors: Record<string, string[]>;
}

const api = createSafeFetch({
  baseURL: 'https://api.example.com'
});

async function registerUser(data: any) {
  const result = await api.post('/register', data);

  if (!result.ok) {
    const validationError = toTypedHttpError<FormValidationError>(result.error);

    if (validationError && validationError.status === 422) {
      // Типизированный доступ к ошибкам валидации
      const errors = validationError.body.errors;

      return {
        success: false,
        errors: {
          email: errors.email || [],
          password: errors.password || [],
          username: errors.username || []
        }
      };
    }

    return {
      success: false,
      message: result.error.message
    };
  }

  return { success: true, data: result.data };
}
```

### Пример 2: Централизованная обработка ошибок

```typescript
interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

function handleApiError(error: NormalizedError): string {
  if (isHttpError(error)) {
    const typed = toTypedHttpError<ApiErrorBody>(error);

    if (typed?.body?.error) {
      return `API Error ${typed.body.error.code}: ${typed.body.error.message}`;
    }

    return `HTTP ${error.status}: ${error.statusText}`;
  }

  if (isNetworkError(error)) {
    return 'Network error: Please check your internet connection';
  }

  if (isTimeoutError(error)) {
    return `Request timeout after ${error.timeoutMs}ms`;
  }

  return error.message;
}

// Использование
const result = await api.get('/data');
if (!result.ok) {
  const errorMessage = handleApiError(result.error);
  showNotification(errorMessage);
}
```

### Пример 3: Type narrowing с множественными проверками

```typescript
interface NotFoundError {
  resource: string;
  id: string | number;
}

interface UnauthorizedError {
  message: string;
  requiredPermissions: string[];
}

async function fetchResource(id: string) {
  const result = await api.get(`/resources/${id}`);

  if (!result.ok) {
    if (isHttpError(result.error)) {
      switch (result.error.status) {
        case 404: {
          const notFound = toTypedHttpError<NotFoundError>(result.error);
          if (notFound?.body) {
            console.log(`${notFound.body.resource} with id ${notFound.body.id} not found`);
          }
          break;
        }

        case 401: {
          const unauthorized = toTypedHttpError<UnauthorizedError>(result.error);
          if (unauthorized?.body) {
            console.log('Required permissions:', unauthorized.body.requiredPermissions);
          }
          break;
        }

        default:
          console.log('HTTP error:', result.error.status);
      }
    }
  }

  return result;
}
```

### Пример 4: React Hook для обработки ошибок

```typescript
import { useState } from 'react';
import { toTypedHttpError, isHttpError } from 're-fetch';

interface ValidationErrors {
  errors: Record<string, string[]>;
}

function useFormSubmit<T>(submitFn: (data: T) => Promise<SafeResult<any>>) {
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (data: T) => {
    setIsSubmitting(true);
    setErrors({});

    try {
      const result = await submitFn(data);

      if (!result.ok) {
        const validationError = toTypedHttpError<ValidationErrors>(result.error);

        if (validationError && validationError.status === 422) {
          setErrors(validationError.body.errors);
          return { success: false };
        }

        throw new Error(result.error.message);
      }

      return { success: true, data: result.data };
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submit, errors, isSubmitting };
}

// Использование в компоненте
function RegisterForm() {
  const { submit, errors, isSubmitting } = useFormSubmit(
    (data) => api.post('/register', data)
  );

  const handleSubmit = async (data: any) => {
    const result = await submit(data);
    if (result.success) {
      // Success handling
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" />
      {errors.email && <div>{errors.email.join(', ')}</div>}

      <input name="password" type="password" />
      {errors.password && <div>{errors.password.join(', ')}</div>}

      <button disabled={isSubmitting}>Register</button>
    </form>
  );
}
```

### Пример 5: Custom Error Handler с errorMap

```typescript
interface StandardApiError {
  error: {
    code: string;
    message: string;
    statusCode: number;
  };
}

const api = createSafeFetch({
  baseURL: 'https://api.example.com',
  errorMap: (error) => {
    // Логируем все ошибки
    console.error('API Error:', error);

    // Добавляем дополнительную информацию для HTTP ошибок
    if (isHttpError(error)) {
      const typed = toTypedHttpError<StandardApiError>(error);

      if (typed?.body?.error) {
        return {
          ...error,
          message: `${typed.body.error.code}: ${typed.body.error.message}`
        };
      }
    }

    return error;
  }
});
```

## Best Practices

### 1. Используйте toTypedHttpError для безопасной типизации

```typescript
// ✅ Good - безопасная проверка
const typed = toTypedHttpError<MyErrorType>(error);
if (typed) {
  // работаем с typed.body
}

// ❌ Bad - небезопасная типизация
const typed = error as HttpError & { body: MyErrorType };
```

### 2. Определяйте типы ошибок для вашего API

```typescript
// types/api-errors.ts
export interface ValidationError {
  errors: Record<string, string[]>;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface NotFoundError {
  resource: string;
  id: string | number;
}
```

### 3. Создавайте переиспользуемые обработчики ошибок

```typescript
// utils/error-handlers.ts
export function handleValidationError(error: NormalizedError) {
  const typed = toTypedHttpError<ValidationError>(error);
  return typed?.body.errors || null;
}

export function isNotFoundError(error: NormalizedError): boolean {
  return isHttpError(error) && error.status === 404;
}
```

### 4. Комбинируйте с type guards

```typescript
if (!result.ok) {
  if (isHttpError(result.error)) {
    const typed = toTypedHttpError<MyError>(result.error);
    // TypeScript знает что это HttpError с типизированным body
  } else if (isNetworkError(result.error)) {
    // Обработка сетевых ошибок
  }
}
```

## Запуск примеров

```bash
# Запустить все примеры типизированных ошибок
npm run example:typed-errors
```